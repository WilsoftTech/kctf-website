// Donation state machine. Every change is one conditional UPDATE (`WHERE status IN …`), so
// duplicate, concurrent and out-of-order notifications cannot corrupt state:
// - `succeeded` never returns to pending/failed/cancelled/expired.
// - A provider-verified success is accepted after an earlier failure, cancellation or
//   expiry: the money moved, so the record must say so.
// - Any amount, currency or reference mismatch moves the donation to `needs_review` for an
//   operator and queues nothing.
// Notifications are queued in the same transaction as the move to `succeeded`, so they
// exist only for a verified success and only once (also enforced by a unique index).
import type { DonationStatus } from "@/generated/prisma/enums";
import type { Database } from "@/server/db";
import { log } from "@/server/log";
import type { VerifiedStatus } from "@/server/payments/provider";

export const DONATION_STAFF_NOTIFICATION = "donation-staff-notification";
export const DONATION_ACKNOWLEDGEMENT = "donation-acknowledgement";

type Tx = Omit<
  Database,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/** For each target state, the states it may be entered from. */
export const ALLOWED_FROM: Record<DonationStatus, readonly DonationStatus[]> = {
  created: [],
  pending: ["created"],
  succeeded: ["created", "pending", "failed", "cancelled", "expired"],
  failed: ["created", "pending"],
  cancelled: ["created", "pending"],
  expired: ["created", "pending"],
  reversed: ["succeeded"],
  needs_review: [
    "created",
    "pending",
    "failed",
    "cancelled",
    "expired",
    "succeeded",
  ],
};

export const OPEN_STATUSES: readonly DonationStatus[] = ["created", "pending"];

export function canTransition(from: DonationStatus, to: DonationStatus) {
  return ALLOWED_FROM[to].includes(from);
}

export type DonationRecord = {
  id: string;
  reference: string;
  amountMinor: number;
  currency: string;
  mode: "test" | "live";
  providerSessionId: string | null;
};

/** Returns a reason code when the provider's view does not match our record. */
export function mismatch(
  donation: DonationRecord,
  status: VerifiedStatus,
): string | undefined {
  if (
    donation.providerSessionId &&
    status.sessionId !== donation.providerSessionId
  )
    return "session_mismatch";
  if (status.reference !== undefined && status.reference !== donation.reference)
    return "reference_mismatch";
  if (status.donationId !== undefined && status.donationId !== donation.id)
    return "reference_mismatch";
  if (status.live !== undefined && status.live !== (donation.mode === "live"))
    return "mode_mismatch";
  // Amount and currency must be confirmed before a donation can count as paid.
  if (status.state === "succeeded" || status.state === "reversed") {
    if (status.currency === undefined || status.amountMinor === undefined)
      return "amount_unverified";
    if (status.currency !== donation.currency) return "currency_mismatch";
    if (status.amountMinor !== donation.amountMinor) return "amount_mismatch";
  } else if (
    status.currency !== undefined &&
    status.currency !== donation.currency
  )
    return "currency_mismatch";
  return undefined;
}

export type ApplyResult = {
  from?: DonationStatus;
  to: DonationStatus;
  changed: boolean;
  reason?: string;
};

/**
 * Applies a provider-verified status inside the caller's transaction (or directly).
 * Never calls a provider: callers fetch the status first, outside any transaction.
 */
export async function applyVerifiedStatus(
  tx: Tx,
  donation: DonationRecord,
  status: VerifiedStatus,
  now = new Date(),
): Promise<ApplyResult> {
  const reason = mismatch(donation, status);
  const target: DonationStatus = reason ? "needs_review" : status.state;
  const update = await tx.donation.updateMany({
    where: { id: donation.id, status: { in: [...ALLOWED_FROM[target]] } },
    data: {
      status: target,
      lastCheckedAt: now,
      ...(reason
        ? { statusReason: reason }
        : status.code
          ? { statusReason: status.code }
          : {}),
      ...(status.paymentId && !reason
        ? { providerPaymentId: status.paymentId }
        : {}),
      ...(target === "succeeded" ? { settledAt: now } : {}),
      ...(target === "failed" ||
      target === "expired" ||
      target === "cancelled" ||
      target === "reversed"
        ? { settledAt: now }
        : {}),
    },
  });
  if (update.count === 0) {
    // No transition (same state, or not allowed). Record that we checked.
    await tx.donation.updateMany({
      where: { id: donation.id },
      data: { lastCheckedAt: now },
    });
    return { to: target, changed: false, reason };
  }
  if (target === "succeeded") {
    await tx.emailOutbox.createMany({
      data: [
        { donationId: donation.id, kind: DONATION_STAFF_NOTIFICATION },
        { donationId: donation.id, kind: DONATION_ACKNOWLEDGEMENT },
      ],
      skipDuplicates: true,
    });
  }
  log(target === "needs_review" ? "error" : "info", "donation_status_changed", {
    donationId: donation.id,
    status: target,
    code: reason ?? status.code,
  });
  return { to: target, changed: true, reason };
}

/** Runs applyVerifiedStatus in its own short transaction. */
export async function applyStatus(
  db: Database,
  donation: DonationRecord,
  status: VerifiedStatus,
) {
  return db.$transaction((tx) => applyVerifiedStatus(tx, donation, status));
}

export const donationRecordSelect = {
  id: true,
  reference: true,
  amountMinor: true,
  currency: true,
  mode: true,
  providerSessionId: true,
} as const;
