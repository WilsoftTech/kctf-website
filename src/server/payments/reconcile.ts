// Single entry point for scheduled and operator reconciliation of open donations.
import "server-only";
import { getDb } from "@/server/db";
import { log, safeErrorCode } from "@/server/log";
import { paymentsConfig } from "@/server/payments/config";
import { reconcileOpenDonations } from "@/server/payments/status";
import type { ExecutionBudget } from "@/server/execution-budget";

export type ReconcileRunResult =
  | {
      ok: boolean;
      checked: number;
      reconciled: number;
      failed: number;
      closed: number;
      partial?: boolean;
      skipped?: boolean;
    }
  | { ok: false; reason: "not_configured" | "error" };

export async function reconcilePayments(
  options: { limit?: number; budget?: ExecutionBudget } = {},
): Promise<ReconcileRunResult> {
  const { config, enabled } = paymentsConfig();
  if (!enabled)
    return {
      ok: true,
      skipped: true,
      checked: 0,
      reconciled: 0,
      failed: 0,
      closed: 0,
    };
  if (!config) return { ok: false, reason: "not_configured" };
  try {
    const summary = await reconcileOpenDonations(getDb(), config, options);
    return { ok: summary.failed === 0 && !summary.partial, ...summary };
  } catch (error) {
    log("error", "donation_reconcile_run_failed", {
      code: safeErrorCode(error),
    });
    return { ok: false, reason: "error" };
  }
}
