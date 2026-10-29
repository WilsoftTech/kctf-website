// Single entry point for every trigger: after a submission, the authenticated HTTP
// endpoint (Vercel Cron) and the operator CLI.
import "server-only";
import { readDeliveryConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { log, safeErrorCode } from "@/server/log";
import { ExecutionBudget } from "@/server/execution-budget";
import {
  processOutbox,
  purgeExpiredRateLimits,
  type OutboxSummary,
} from "@/server/outbox/worker";

export type RunResult =
  | ({
      ok: boolean;
      purgedRateLimits: number;
      degraded: boolean;
    } & OutboxSummary)
  | { ok: false; reason: "not_configured" | "error" };

export async function runOutbox(
  options: {
    batchSize?: number;
    purge?: boolean;
    budget?: ExecutionBudget;
  } = {},
): Promise<RunResult> {
  const { config, issues } = readDeliveryConfig();
  if (!config) {
    log("error", "outbox_not_configured", { missing: issues.join(" ") });
    return { ok: false, reason: "not_configured" };
  }
  const started = Date.now();
  try {
    const db = getDb();
    const budget = options.budget ?? new ExecutionBudget(45_000);
    const summary = await processOutbox(
      { db, delivery: config },
      { batchSize: options.batchSize, budget },
    );
    const purgedRateLimits =
      options.purge && budget.canStart(6000)
        ? await purgeExpiredRateLimits(db)
        : 0;
    log("info", "outbox_run", {
      ...summary,
      deleted: purgedRateLimits,
      durationMs: Date.now() - started,
    });
    const degraded =
      summary.failed > 0 || summary.retried > 0 || summary.lost > 0;
    return {
      ok: !degraded && !summary.partial,
      degraded,
      purgedRateLimits,
      ...summary,
    };
  } catch (error) {
    log("error", "outbox_run_failed", { code: safeErrorCode(error) });
    return { ok: false, reason: "error" };
  }
}
