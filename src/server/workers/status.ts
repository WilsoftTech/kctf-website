import "server-only";
import type { Database } from "@/server/db";
import { outboxStatus } from "@/server/outbox/worker";
import { workerSettings } from "@/server/workers/run";

export async function backgroundStatus(db: Database, now = Date.now()) {
  const [email, lastRun, payments, stale, financialReview] = await Promise.all([
    outboxStatus(db),
    db.workerRun.findFirst({
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        startedAt: true,
        completedAt: true,
        status: true,
        sent: true,
        retried: true,
        failed: true,
        paymentChecked: true,
        paymentFailed: true,
        durationMs: true,
        code: true,
      },
    }),
    db.donation.aggregate({
      where: { reconcileFailures: { gt: 0 } },
      _count: { _all: true },
      _min: { lastCheckedAt: true },
    }),
    db.workerRun.count({
      where: { status: "running", startedAt: { lt: new Date(now - 120_000) } },
    }),
    db.donation.count({
      where: {
        OR: [
          { status: "needs_review" },
          { financialReviewReason: { not: null } },
          { disputeState: { notIn: ["none", "won", "warning_closed"] } },
        ],
      },
    }),
  ]);
  const pending = email.find((row) => row.status === "pending");
  const oldestPendingAgeSeconds = pending?.oldest
    ? Math.max(0, Math.floor((now - pending.oldest.getTime()) / 1000))
    : 0;
  const failed = email.find((row) => row.status === "failed")?.count ?? 0;
  const interval = workerSettings().intervalSeconds;
  const overdue =
    !lastRun?.completedAt ||
    now - lastRun.completedAt.getTime() > interval * 2000;
  const alerts = [
    ...(oldestPendingAgeSeconds > 900 ? ["oldest_pending_over_15m"] : []),
    ...((pending?.count ?? 0) >= 100 ? ["pending_over_100"] : []),
    ...(failed ? ["failed_email_jobs"] : []),
    ...(payments._count._all ? ["payment_reconciliation_failures"] : []),
    ...(financialReview ? ["financial_review_required"] : []),
    ...(overdue ? ["worker_schedule_overdue"] : []),
    ...(stale ? ["interrupted_worker_runs"] : []),
    ...(lastRun && lastRun.status !== "healthy"
      ? ["last_run_not_healthy"]
      : []),
  ];
  return {
    ok: alerts.length === 0,
    alerts,
    expectedIntervalSeconds: interval,
    email,
    pendingCount: pending?.count ?? 0,
    oldestPendingAgeSeconds,
    failedJobs: failed,
    reconciliationFailures: payments._count._all,
    financialReviewCount: financialReview,
    oldestReconciliationFailureAt: payments._min.lastCheckedAt,
    staleRuns: stale,
    lastRun,
  };
}
