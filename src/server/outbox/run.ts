// Single entry point for every trigger: after a submission, the authenticated HTTP
// endpoint (Vercel Cron) and the operator CLI.
import "server-only";
import { readDeliveryConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { log, safeErrorCode } from "@/server/log";
import {
  processOutbox,
  purgeExpiredRateLimits,
  type OutboxSummary,
} from "@/server/outbox/worker";

export type RunResult =
  | ({ ok: true; purgedRateLimits: number } & OutboxSummary)
  | { ok: false; reason: "not_configured" | "error" };

export async function runOutbox(
  options: { batchSize?: number; purge?: boolean } = {},
): Promise<RunResult> {
  const { config, issues } = readDeliveryConfig();
  if (!config) {
    log("error", "outbox_not_configured", { missing: issues.join(" ") });
    return { ok: false, reason: "not_configured" };
  }
  const started = Date.now();
  try {
    const db = getDb();
    const summary = await processOutbox(
      { db, delivery: config },
      { batchSize: options.batchSize },
    );
    const purgedRateLimits = options.purge
      ? await purgeExpiredRateLimits(db)
      : 0;
    log("info", "outbox_run", {
      ...summary,
      deleted: purgedRateLimits,
      durationMs: Date.now() - started,
    });
    return { ok: true, purgedRateLimits, ...summary };
  } catch (error) {
    log("error", "outbox_run_failed", { code: safeErrorCode(error) });
    return { ok: false, reason: "error" };
  }
}
