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
import { ExecutionBudget } from "@/server/execution-budget";
import { randomUUID } from "node:crypto";
import {
  reconcileFinancial,
  financialSelect,
} from "@/server/payments/financial";

/** Minimum time between provider status checks for one donation. */
export const CHECK_INTERVAL_MS = 5_000;
/** Pesapal orders still unpaid this long after creation are treated as expired. */
export const PESAPAL_ABANDON_AFTER_MS = 48 * 60 * 60_000;
/** Stripe sessions expire after an hour; allow for webhook delays before reconciling. */
export const RECONCILE_AFTER_MS = 10 * 60_000;

const statusSelect = {
  ...donationRecordSelect,
  method: true,
  checkoutUrl: true,
  createdAt: true,
  updatedAt: true,
  lastCheckedAt: true,
  ...financialSelect,
  collectedMinor: true,
  refundedMinor: true,
  pendingRefundMinor: true,
  reversedMinor: true,
  refundState: true,
  disputeState: true,
  disputedMinor: true,
  financialReviewReason: true,
  outbox: { select: { kind: true, status: true } },
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
  collectedMinor?: number;
  refundedMinor?: number;
  reversedMinor?: number;
  pendingRefundMinor?: number;
  refundState?: string;
  disputeState?: string;
  disputedMinor?: number;
  financialReviewReason?: string | null;
  outbox?: { kind: string; status: string }[];
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
    financial: {
      collectedMinor: row.collectedMinor ?? 0,
      refundedMinor: row.refundedMinor ?? 0,
      reversedMinor: row.reversedMinor ?? 0,
      pendingRefundMinor: row.pendingRefundMinor ?? 0,
      refundState: row.refundState ?? "none",
      disputeState: row.disputeState ?? "none",
      disputedMinor: row.disputedMinor ?? 0,
      underReview: !!row.financialReviewReason,
    },
    acknowledgement:
      row.outbox?.find((job) => job.kind === "donation-acknowledgement")
        ?.status ?? "not_queued",
  };
}

/** Asks the provider and applies the answer. Never runs inside a transaction. */
export async function reconcileDonation(
  db: Database,
  config: PaymentsConfig,
  donation: ReconcilableDonation,
  fetchImpl?: typeof fetch,
  now = Date.now(),
  budget?: ExecutionBudget,
): Promise<StatusResult | undefined> {
  if (!donation.providerSessionId) return undefined;
  const provider = providerById(config, donation.provider, fetchImpl, budget);
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
  const applied = await applyStatus(db, donation, status);
  if (applied.reason) return { kind: "permanent", code: applied.reason };
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
  {
    limit = 20,
    fetchImpl,
    budget = new ExecutionBudget(35_000),
  }: {
    limit?: number;
    fetchImpl?: typeof fetch;
    budget?: ExecutionBudget;
  } = {},
) {
  if (!budget.canStart(6000))
    return { checked: 0, reconciled: 0, failed: 0, closed: 0, partial: true };
  const before = new Date(Date.now() - RECONCILE_AFTER_MS);
  const openRows = await db.donation.findMany({
    where: {
      OR: [
        { status: { in: [...OPEN_STATUSES] } },
        {
          status: { in: ["failed", "cancelled", "expired"] },
          providerSessionId: { not: null },
          createdAt: { gt: new Date(Date.now() - 30 * 86_400_000) },
        },
      ],
      createdAt: { lt: before },
      AND: [
        { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: before } }] },
      ],
    },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }],
    take: Math.max(1, Math.min(limit, 100)),
    select: statusSelect,
  });
  const settledRows = await db.donation.findMany({
    where: {
      status: { in: ["succeeded", "reversed", "needs_review"] },
      providerSessionId: { not: null },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: before } }],
    },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }],
    take: Math.max(1, Math.min(limit, 100)),
    select: statusSelect,
  });
  // Interleave classes; an open-checkout backlog cannot hide missed refunds.
  const rows = Array.from(
    { length: Math.max(openRows.length, settledRows.length) },
    (_, i) => [openRows[i], settledRows[i]],
  )
    .flat()
    .filter((row) => row !== undefined)
    .slice(0, Math.max(1, Math.min(limit, 100)));
  let reconciled = 0;
  let failed = 0;
  let closed = 0;
  let checked = 0;
  let partial = false;
  for (const row of rows) {
    if (!budget.canStart()) {
      partial = true;
      break;
    }
    const token = randomUUID();
    const claimed = await db.donation.updateMany({
      where: {
        id: row.id,
        lastCheckedAt: row.lastCheckedAt,
        OR: [
          { reconcileClaimToken: null },
          { reconcileClaimedAt: { lt: new Date(Date.now() - 120_000) } },
        ],
      },
      data: { reconcileClaimToken: token, reconcileClaimedAt: new Date() },
    });
    if (!claimed.count) continue;
    checked++;
    try {
      if (!row.providerSessionId) {
        // The provider call never returned a checkout; after the grace period nobody can
        // pay it, so it is closed rather than left open forever.
        const expired = await db.donation.updateMany({
          where: { id: row.id, status: "created" },
          data: {
            status: "expired",
            statusReason: "checkout_not_created",
            settledAt: new Date(),
            lastCheckedAt: new Date(),
          },
        });
        closed += expired.count;
        continue;
      }
      try {
        if (
          row.provider === "stripe" &&
          !OPEN_STATUSES.includes(row.status) &&
          row.providerPaymentId
        ) {
          const stripe = config.methods.card;
          if (!stripe || stripe.provider !== "stripe")
            throw new Error("financial_provider_unconfigured");
          const outcome = await reconcileFinancial(
            db,
            stripe,
            row,
            fetchImpl,
            budget,
          );
          if (outcome === "needs_review")
            throw new Error("financial_identity_mismatch");
          reconciled++;
        } else {
          const outcome = await reconcileDonation(
            db,
            config,
            row,
            fetchImpl,
            Date.now(),
            budget,
          );
          if (outcome?.kind === "ok") reconciled++;
          else throw new Error(outcome?.code ?? "provider_unavailable");
        }
        await db.donation.updateMany({
          where: { id: row.id, reconcileClaimToken: token },
          data: {
            lastCheckedAt: new Date(),
            reconcileFailures: 0,
            lastReconcileError: null,
          },
        });
      } catch (error) {
        failed++;
        await db.donation.updateMany({
          where: { id: row.id, reconcileClaimToken: token },
          data: {
            lastCheckedAt: new Date(),
            reconcileFailures: { increment: 1 },
            lastReconcileError: safeErrorCode(error),
          },
        });
        log("warn", "donation_reconcile_failed", {
          donationId: row.id,
          code: safeErrorCode(error),
        });
      }
    } finally {
      await db.donation.updateMany({
        where: { id: row.id, reconcileClaimToken: token },
        data: { reconcileClaimToken: null, reconcileClaimedAt: null },
      });
    }
  }
  log("info", "donation_reconcile_run", {
    claimed: rows.length,
    reconciled,
    failed,
    deleted: closed,
  });
  return {
    checked,
    reconciled,
    failed,
    closed,
    ...(partial ? { partial: true } : {}),
  };
}
