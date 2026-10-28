// Single entry point for scheduled and operator reconciliation of open donations.
import "server-only";
import { getDb } from "@/server/db";
import { log, safeErrorCode } from "@/server/log";
import { paymentsConfig } from "@/server/payments/config";
import { reconcileOpenDonations } from "@/server/payments/status";

export type ReconcileRunResult =
  | {
      ok: true;
      checked: number;
      reconciled: number;
      failed: number;
      closed: number;
    }
  | { ok: false; reason: "not_configured" | "error" };

export async function reconcilePayments(
  options: { limit?: number } = {},
): Promise<ReconcileRunResult> {
  const { config } = paymentsConfig();
  if (!config) return { ok: false, reason: "not_configured" };
  try {
    return {
      ok: true,
      ...(await reconcileOpenDonations(getDb(), config, options)),
    };
  } catch (error) {
    log("error", "donation_reconcile_run_failed", {
      code: safeErrorCode(error),
    });
    return { ok: false, reason: "error" };
  }
}
