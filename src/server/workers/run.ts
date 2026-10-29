import "server-only";
import { ExecutionBudget } from "@/server/execution-budget";
import { getDb } from "@/server/db";
import { runOutbox } from "@/server/outbox/run";
import { reconcilePayments } from "@/server/payments/reconcile";
import { safeErrorCode } from "@/server/log";

function integer(name: string, fallback: number, max: number, min = 1) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`Invalid ${name}`);
  return value;
}
export function workerSettings() {
  return {
    budgetMs: integer("WORKER_BUDGET_MS", 50_000, 50_000, 20_000),
    emailBatch: integer("WORKER_EMAIL_BATCH", 50, 100),
    paymentBatch: integer("WORKER_PAYMENT_BATCH", 20, 100),
    intervalSeconds: integer("WORKER_INTERVAL_SECONDS", 300, 86_400, 60),
  };
}

export function workerOutcome(
  email: Awaited<ReturnType<typeof runOutbox>>,
  payments: Awaited<ReturnType<typeof reconcilePayments>>,
) {
  const failed = "reason" in email || "reason" in payments;
  const degraded =
    ("degraded" in email && email.degraded) ||
    ("failed" in payments && payments.failed > 0);
  const partial =
    ("partial" in email && email.partial) ||
    ("partial" in payments && payments.partial);
  return failed
    ? "failed"
    : degraded
      ? "degraded"
      : partial
        ? "partial"
        : "healthy";
}

/** Independent phase budgets guarantee payment outages cannot starve email.
 * One absolute parent deadline includes the run record and final DB writes. */
export async function runBackgroundWorker(
  options: { budget?: ExecutionBudget; signal?: AbortSignal } = {},
) {
  const settings = workerSettings();
  const budget = options.budget
    ? options.budget.child(settings.budgetMs)
    : new ExecutionBudget(settings.budgetMs, options.signal);
  const started = Date.now();
  const db = getDb();
  await db.workerRun.updateMany({
    where: {
      status: "running",
      startedAt: { lt: new Date(started - 120_000) },
    },
    data: {
      status: "interrupted",
      completedAt: new Date(),
      code: "invocation_interrupted",
    },
  });
  const run = await db.workerRun.create({ data: {}, select: { id: true } });
  try {
    const [emailResult, paymentResult] = await Promise.allSettled([
      runOutbox({
        batchSize: settings.emailBatch,
        purge: true,
        budget: budget.child(45_000),
      }),
      reconcilePayments({
        limit: settings.paymentBatch,
        budget: budget.child(35_000),
      }),
    ]);
    const email =
      emailResult.status === "fulfilled"
        ? emailResult.value
        : { ok: false as const, reason: "error" as const };
    const payments =
      paymentResult.status === "fulfilled"
        ? paymentResult.value
        : { ok: false as const, reason: "error" as const };
    const outcome = workerOutcome(email, payments);
    // Unabortable DB completion may use the host safety margin; never label an
    // exhausted invocation healthy just because both phases returned summaries.
    const status =
      outcome === "healthy" && !budget.canStart(6000) ? "partial" : outcome;
    await db.workerRun.update({
      where: { id: run.id },
      data: {
        completedAt: new Date(),
        status,
        durationMs: Date.now() - started,
        sent: "sent" in email ? email.sent : 0,
        retried: "retried" in email ? email.retried : 0,
        failed: "failed" in email ? email.failed : 0,
        paymentChecked: "checked" in payments ? payments.checked : 0,
        paymentFailed: "failed" in payments ? payments.failed : 0,
      },
    });
    // Short-lived operational history; no financial history is purged.
    if (budget.canStart(6000))
      await db.workerRun.deleteMany({
        where: { startedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } },
      });
    return { ok: status === "healthy", status, runId: run.id, email, payments };
  } catch (error) {
    await db.workerRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        durationMs: Date.now() - started,
        code: safeErrorCode(error),
      },
    });
    throw error;
  }
}
