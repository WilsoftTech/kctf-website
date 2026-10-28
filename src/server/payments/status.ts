// Public donation status (status page polling), visitor cancellation and reconciliation.
// The status endpoint is keyed by an unguessable token and returns no donor information.
// While a donation is open it asks the provider's authenticated API for the current state
// (throttled), so the page never depends on the browser, a redirect or a webhook alone.
import type { DonationCurrency, PaymentMethodId } from "@/lib/donation-options";
import type { DonationStatusResponse } from "@/lib/donation-response";
import type { Database } from "@/server/db";
import { log, safeErrorCode } from "@/server/log";
import {
  hashAccessToken,
  providerById,
  type PaymentDeps,
} from "@/server/payments/common";
import type { PaymentsConfig } from "@/server/payments/config";
import type { StatusResult } from "@/server/payments/provider";
import {
  applyStatus,
  donationRecordSelect,
  type DonationRecord,
  OPEN_STATUSES,
} from "@/server/payments/state";
import { accessTokenSchema } from "@/validation/donation";

/** Minimum time between provider status checks for one donation. */
export const CHECK_INTERVAL_MS = 5_000;
/** Pesapal orders still unpaid this long after creation are treated as expired. */
export const PESAPAL_ABANDON_AFTER_MS = 48 * 60 * 60_000;
/** Stripe sessions expire after an hour; allow for webhook delays before reconciling. */
export const RECONCILE_AFTER_MS = 10 * 60_000;

const statusSelect = {
  ...donationRecordSelect,
  status: true,
  method: true,
  provider: true,
  checkoutUrl: true,
  createdAt: true,
  updatedAt: true,
  lastCheckedAt: true,
} as const;

/** What reconciliation needs to know about a donation. */
export type ReconcilableDonation = DonationRecord & {
  provider: "stripe" | "pesapal";
  createdAt: Date;
};

function publicView(row: {
  reference: string;
  status: string;
  method: string;
  amountMinor: number;
  currency: string;
  mode: string;
  checkoutUrl: string | null;
  updatedAt: Date;
}): DonationStatusResponse {
  return {
    reference: row.reference,
    status: row.status as DonationStatusResponse["status"],
    method: row.method as PaymentMethodId,
    amountMinor: row.amountMinor,
    currency: row.currency as DonationCurrency,
    test: row.mode === "test",
    ...(row.status === "pending" && row.checkoutUrl
      ? { resumeUrl: row.checkoutUrl }
      : {}),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Asks the provider and applies the answer. Never runs inside a transaction. */
export async function reconcileDonation(
  db: Database,
  config: PaymentsConfig,
  donation: ReconcilableDonation,
  fetchImpl?: typeof fetch,
  now = Date.now(),
): Promise<StatusResult | undefined> {
  if (!donation.providerSessionId) return undefined;
  const provider = providerById(config, donation.provider, fetchImpl);
  if (!provider) return undefined;
  const fetched = await provider.fetchStatus(donation.providerSessionId);
  if (fetched.kind !== "ok") {
    await db.donation.updateMany({
      where: { id: donation.id },
      data: { lastCheckedAt: new Date(now) },
    });
    return fetched;
  }
  let status = fetched.status;
  // Pesapal has no session expiry: an order never paid after two days is closed. A later
  // verified payment can still move it to succeeded.
  if (
    donation.provider === "pesapal" &&
    status.state === "pending" &&
    now - donation.createdAt.getTime() > PESAPAL_ABANDON_AFTER_MS
  )
    status = { ...status, state: "expired", code: "not_completed" };
  await applyStatus(db, donation, status);
  return fetched;
}

export async function donationStatus(
  url: URL,
  deps: PaymentDeps,
): Promise<{
  status: number;
  body: DonationStatusResponse | { error: string };
}> {
  const token = accessTokenSchema.safeParse(url.searchParams.get("token"));
  if (!token.success) return { status: 404, body: { error: "not_found" } };
  try {
    const db = deps.getDb();
    const where = { accessTokenHash: hashAccessToken(token.data) };
    let row = await db.donation.findUnique({ where, select: statusSelect });
    if (!row) return { status: 404, body: { error: "not_found" } };
    const { config } = deps.readConfig();
    const due =
      !row.lastCheckedAt ||
      Date.now() - row.lastCheckedAt.getTime() >= CHECK_INTERVAL_MS;
    if (config && OPEN_STATUSES.includes(row.status) && due) {
      try {
        await reconcileDonation(db, config, row, deps.fetchImpl);
        row = (await db.donation.findUnique({ where, select: statusSelect }))!;
      } catch (error) {
        // The stored state is still correct, just possibly behind; show it.
        log("warn", "donation_status_check_failed", {
          donationId: row.id,
          code: safeErrorCode(error),
        });
      }
    }
    return { status: 200, body: publicView(row) };
  } catch (error) {
    log("error", "donation_status_failed", { code: safeErrorCode(error) });
    return { status: 503, body: { error: "unavailable" } };
  }
}

/**
 * The visitor came back through the provider's cancel link and confirmed. For Stripe the
 * open session is expired through the API, so it can no longer be paid, and the state
 * comes from Stripe's answer. Pesapal orders are left to the provider status.
 */
export async function cancelDonation(
  request: Request,
  deps: PaymentDeps,
): Promise<{
  status: number;
  body: DonationStatusResponse | { error: string };
}> {
  if (request.headers.get("origin") !== deps.siteOrigin)
    return { status: 403, body: { error: "forbidden" } };
  let token: string | undefined;
  try {
    const body = (await request.json()) as { token?: unknown };
    const parsed = accessTokenSchema.safeParse(body.token);
    token = parsed.success ? parsed.data : undefined;
  } catch {
    token = undefined;
  }
  if (!token) return { status: 404, body: { error: "not_found" } };
  try {
    const db = deps.getDb();
    const where = { accessTokenHash: hashAccessToken(token) };
    const row = await db.donation.findUnique({ where, select: statusSelect });
    if (!row) return { status: 404, body: { error: "not_found" } };
    const { config } = deps.readConfig();
    if (config && OPEN_STATUSES.includes(row.status) && row.providerSessionId) {
      const provider = providerById(config, row.provider, deps.fetchImpl);
      const result = await provider?.cancelCheckout?.(row.providerSessionId);
      if (result?.kind === "ok") {
        const status =
          result.status.state === "expired"
            ? {
                ...result.status,
                state: "cancelled" as const,
                code: "cancelled_by_donor",
              }
            : result.status;
        await applyStatus(db, row, status);
      } else if (!provider?.cancelCheckout) {
        await reconcileDonation(db, config, row, deps.fetchImpl);
      }
    } else if (row.status === "created" && !row.providerSessionId) {
      // No checkout was ever created: nothing can be paid.
      await db.donation.updateMany({
        where: { id: row.id, status: "created" },
        data: {
          status: "cancelled",
          statusReason: "cancelled_by_donor",
          settledAt: new Date(),
        },
      });
    }
    const updated = await db.donation.findUnique({
      where,
      select: statusSelect,
    });
    return { status: 200, body: publicView(updated!) };
  } catch (error) {
    log("error", "donation_cancel_failed", { code: safeErrorCode(error) });
    return { status: 503, body: { error: "unavailable" } };
  }
}

/**
 * Re-checks open donations whose outcome is uncertain (missed webhooks or IPNs, closed
 * browser tabs). Bounded per run; provider calls are made one at a time, outside
 * transactions. Runs from the scheduled worker and `npm run payments:reconcile`.
 */
export async function reconcileOpenDonations(
  db: Database,
  config: PaymentsConfig,
  { limit = 20, fetchImpl }: { limit?: number; fetchImpl?: typeof fetch } = {},
) {
  const before = new Date(Date.now() - RECONCILE_AFTER_MS);
  const rows = await db.donation.findMany({
    where: {
      status: { in: [...OPEN_STATUSES] },
      createdAt: { lt: before },
    },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }],
    take: Math.max(1, Math.min(limit, 100)),
    select: statusSelect,
  });
  let reconciled = 0;
  let failed = 0;
  let closed = 0;
  for (const row of rows) {
    if (!row.providerSessionId) {
      // The provider call never returned a checkout; after the grace period nobody can
      // pay it, so it is closed rather than left open forever.
      await db.donation.updateMany({
        where: { id: row.id, status: "created" },
        data: {
          status: "expired",
          statusReason: "checkout_not_created",
          settledAt: new Date(),
        },
      });
      closed++;
      continue;
    }
    try {
      const outcome = await reconcileDonation(db, config, row, fetchImpl);
      if (outcome?.kind === "ok") reconciled++;
      else failed++;
    } catch (error) {
      failed++;
      log("warn", "donation_reconcile_failed", {
        donationId: row.id,
        code: safeErrorCode(error),
      });
    }
  }
  log("info", "donation_reconcile_run", {
    claimed: rows.length,
    reconciled,
    failed,
    deleted: closed,
  });
  return { checked: rows.length, reconciled, failed, closed };
}
