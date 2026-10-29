// Read-only financial lifecycle. A webhook is a prompt; snapshots come from the
// authenticated PaymentIntent, complete refund list and complete dispute list.
import { z } from "zod";
import type { Database } from "@/server/db";
import { ExecutionBudget, fetchJson } from "@/server/execution-budget";
import type { StripeConfig } from "@/server/payments/config";
import { fromStripeAmount } from "@/server/payments/stripe";

const idSchema = z.string().regex(/^(pi|ch|re|du)_[A-Za-z0-9]{1,250}$/);
const money = z.number().int().nonnegative().max(2_147_483_647);
const intentSchema = z.object({
  id: idSchema,
  amount_received: money,
  currency: z.string().length(3),
  status: z.literal("succeeded"),
  livemode: z.boolean(),
  metadata: z.object({
    donation_id: z.string().uuid(),
    donation_reference: z.string(),
  }),
});
const adjustmentSchema = z.object({
  id: idSchema,
  amount: money,
  currency: z.string().length(3),
  payment_intent: z.string(),
  status: z.string().max(32),
  created: z.number().int().nonnegative(),
});
const refundStates = new Set([
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
]);
const disputeStates = new Set([
  "warning_needs_response",
  "warning_under_review",
  "warning_closed",
  "needs_response",
  "under_review",
  "won",
  "lost",
]);
export type FinancialObservation = {
  externalId: string;
  kind: "refund" | "dispute" | "reversal";
  amountMinor: number;
  currency: string;
  status: string;
  providerCreatedAt?: Date;
};
export type FinancialSnapshot = {
  paymentId: string;
  donationId: string;
  reference: string;
  currency: string;
  live: boolean;
  collectedMinor: number;
  refundedMinor: number;
  pendingRefundMinor: number;
  disputeState: string;
  disputedMinor: number;
  observations: FinancialObservation[];
};

export class FinancialUnavailable extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function stripeFinancialClient(
  config: StripeConfig,
  fetchImpl: typeof fetch = fetch,
  budget = new ExecutionBudget(25_000),
) {
  async function get(path: string, params?: URLSearchParams) {
    const url = new URL(`/v1/${path}`, config.apiUrl);
    if (params) url.search = params.toString();
    const result = await fetchJson(
      fetchImpl,
      url,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${config.secretKey}` },
      },
      8000,
      budget,
    );
    if (!result.response.ok)
      throw new FinancialUnavailable(
        `financial_http_${result.response.status}`,
      );
    return result.body;
  }
  async function list(kind: "refunds" | "disputes", paymentId: string) {
    const records: z.infer<typeof adjustmentSchema>[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const params = new URLSearchParams({
        payment_intent: paymentId,
        limit: "100",
      });
      if (cursor) params.set("starting_after", cursor);
      const body = await get(kind, params);
      const parsed = z
        .object({ data: z.array(adjustmentSchema), has_more: z.boolean() })
        .safeParse(body);
      if (!parsed.success)
        throw new FinancialUnavailable("financial_invalid_list");
      for (const record of parsed.data.data) {
        if (
          record.payment_intent !== paymentId ||
          records.some((r) => r.id === record.id)
        )
          throw new FinancialUnavailable("financial_reference_mismatch");
        if (!record.id.startsWith(kind === "refunds" ? "re_" : "du_"))
          throw new FinancialUnavailable("financial_invalid_id");
        records.push(record);
      }
      if (!parsed.data.has_more) return records;
      cursor = parsed.data.data.at(-1)?.id;
      if (!cursor) throw new FinancialUnavailable("financial_invalid_cursor");
    }
    // Never apply a truncated aggregate. Retry/operator review is explicit.
    throw new FinancialUnavailable("financial_pagination_limit");
  }
  return {
    async identity(paymentId: string) {
      if (!/^pi_[A-Za-z0-9]{1,250}$/.test(paymentId))
        throw new FinancialUnavailable("financial_invalid_id");
      const body = await get(`payment_intents/${paymentId}`);
      if (body.id !== paymentId)
        throw new FinancialUnavailable("financial_reference_mismatch");
      const metadata = body.metadata as Record<string, unknown> | undefined;
      return typeof metadata?.donation_id === "string" &&
        z.string().uuid().safeParse(metadata.donation_id).success
        ? metadata.donation_id
        : undefined;
    },
    /** Derive the PaymentIntent from an authenticated event-object retrieval. */
    async eventPaymentId(type: string, objectId: string) {
      if (!idSchema.safeParse(objectId).success)
        throw new FinancialUnavailable("financial_invalid_id");
      const kind = type.startsWith("charge.dispute.")
        ? "disputes"
        : type.startsWith("refund.") || type === "charge.refund.updated"
          ? "refunds"
          : "charges";
      const prefix =
        kind === "disputes" ? "du_" : kind === "refunds" ? "re_" : "ch_";
      if (!objectId.startsWith(prefix))
        throw new FinancialUnavailable("financial_invalid_id");
      let body = await get(`${kind}/${objectId}`);
      if (body.id !== objectId)
        throw new FinancialUnavailable("financial_reference_mismatch");
      if (
        typeof body.payment_intent !== "string" &&
        typeof body.charge === "string" &&
        body.charge.startsWith("ch_")
      )
        body = await get(`charges/${body.charge}`);
      const paymentId = body.payment_intent;
      if (
        typeof paymentId !== "string" ||
        !/^pi_[A-Za-z0-9]{1,250}$/.test(paymentId)
      )
        throw new FinancialUnavailable("financial_payment_missing");
      return paymentId;
    },
    async snapshot(paymentId: string): Promise<FinancialSnapshot> {
      if (!/^pi_[A-Za-z0-9]{1,250}$/.test(paymentId))
        throw new FinancialUnavailable("financial_invalid_id");
      const intent = intentSchema.safeParse(
        await get(`payment_intents/${paymentId}`),
      );
      if (!intent.success || intent.data.id !== paymentId)
        throw new FinancialUnavailable("financial_invalid_intent");
      const currency = intent.data.currency.toUpperCase();
      const collectedMinor = fromStripeAmount(
        intent.data.amount_received,
        currency,
      );
      if (collectedMinor === undefined)
        throw new FinancialUnavailable("financial_invalid_amount");
      const refunds = await list("refunds", paymentId);
      const disputes = await list("disputes", paymentId);
      let refundedMinor = 0,
        pendingRefundMinor = 0,
        disputedMinor = 0;
      const observations: FinancialObservation[] = [];
      for (const [kind, records] of [
        ["refund", refunds],
        ["dispute", disputes],
      ] as const) {
        for (const record of records) {
          const amountMinor = fromStripeAmount(record.amount, currency);
          if (
            record.currency.toUpperCase() !== currency ||
            amountMinor === undefined ||
            !(kind === "refund" ? refundStates : disputeStates).has(
              record.status,
            )
          )
            throw new FinancialUnavailable("financial_invalid_adjustment");
          observations.push({
            externalId: record.id,
            kind,
            amountMinor,
            currency,
            status: record.status,
            providerCreatedAt: new Date(record.created * 1000),
          });
          if (kind === "refund" && record.status === "succeeded")
            refundedMinor += amountMinor;
          if (
            kind === "refund" &&
            ["pending", "requires_action"].includes(record.status)
          )
            pendingRefundMinor += amountMinor;
          if (
            kind === "dispute" &&
            !["won", "warning_closed"].includes(record.status)
          )
            disputedMinor += amountMinor;
        }
      }
      if (
        refundedMinor > collectedMinor ||
        refundedMinor + pendingRefundMinor > collectedMinor ||
        !Number.isSafeInteger(disputedMinor) ||
        disputedMinor > 2_147_483_647
      )
        throw new FinancialUnavailable("financial_amount_mismatch");
      const priority = [
        "lost",
        "needs_response",
        "under_review",
        "warning_needs_response",
        "warning_under_review",
        "won",
        "warning_closed",
      ];
      const disputeState =
        priority.find((state) => disputes.some((d) => d.status === state)) ??
        "none";
      return {
        paymentId,
        donationId: intent.data.metadata.donation_id,
        reference: intent.data.metadata.donation_reference,
        currency,
        live: intent.data.livemode,
        collectedMinor,
        refundedMinor,
        pendingRefundMinor,
        disputeState,
        disputedMinor,
        observations,
      };
    },
  };
}

export const financialSelect = {
  id: true,
  reference: true,
  provider: true,
  providerSessionId: true,
  providerPaymentId: true,
  amountMinor: true,
  currency: true,
  mode: true,
  financialVersion: true,
  status: true,
  settledAt: true,
} as const;
type FinancialDonation = {
  id: string;
  reference: string;
  provider: "stripe" | "pesapal";
  providerSessionId: string | null;
  providerPaymentId: string | null;
  amountMinor: number;
  currency: string;
  mode: "test" | "live";
  financialVersion: number;
  status: string;
  settledAt?: Date | null;
};
type Tx = Omit<
  Database,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/** CAS prevents an older in-flight fetch overwriting a later snapshot. Losing a
 * race is retryable and never marks a provider event processed. No email is queued. */
export async function applyFinancialSnapshot(
  tx: Tx,
  donation: FinancialDonation,
  snapshot: FinancialSnapshot,
) {
  const mismatch =
    donation.provider !== "stripe" ||
    snapshot.donationId !== donation.id ||
    snapshot.reference !== donation.reference ||
    snapshot.currency !== donation.currency ||
    snapshot.live !== (donation.mode === "live") ||
    snapshot.collectedMinor !== donation.amountMinor ||
    (donation.providerPaymentId &&
      donation.providerPaymentId !== snapshot.paymentId);
  const result = await tx.donation.updateMany({
    where: { id: donation.id, financialVersion: donation.financialVersion },
    data: mismatch
      ? {
          financialVersion: { increment: 1 },
          financialReviewReason: "financial_identity_mismatch",
        }
      : {
          financialVersion: { increment: 1 },
          financialCheckedAt: new Date(),
          collectedMinor: snapshot.collectedMinor,
          refundedMinor: snapshot.refundedMinor,
          pendingRefundMinor: snapshot.pendingRefundMinor,
          disputedMinor: snapshot.disputedMinor,
          refundState:
            snapshot.refundedMinor === 0
              ? "none"
              : snapshot.refundedMinor === snapshot.collectedMinor
                ? "full"
                : "partial",
          disputeState: snapshot.disputeState,
          providerPaymentId: snapshot.paymentId,
          financialReviewReason: null,
          ...(!donation.settledAt ? { settledAt: new Date() } : {}),
          // Record the original collection even if a refund arrives before checkout's
          // notification. Financial notifications never create acknowledgement jobs.
          ...(donation.status !== "needs_review" &&
          donation.status !== "reversed"
            ? { status: "succeeded" as const }
            : {}),
        },
  });
  if (!result.count)
    throw new FinancialUnavailable("financial_snapshot_conflict");
  if (!mismatch && snapshot.observations.length)
    await tx.paymentAdjustment.createMany({
      data: snapshot.observations.map((observation) => ({
        ...observation,
        donationId: donation.id,
        provider: "stripe" as const,
      })),
      skipDuplicates: true,
    });
  return mismatch ? "needs_review" : "financial_updated";
}

export async function reconcileFinancial(
  db: Database,
  config: StripeConfig,
  donation: FinancialDonation,
  fetchImpl?: typeof fetch,
  budget?: ExecutionBudget,
) {
  if (!donation.providerPaymentId)
    throw new FinancialUnavailable("financial_payment_missing");
  const snapshot = await stripeFinancialClient(
    config,
    fetchImpl,
    budget,
  ).snapshot(donation.providerPaymentId);
  return db.$transaction((tx) =>
    applyFinancialSnapshot(tx, donation, snapshot),
  );
}
