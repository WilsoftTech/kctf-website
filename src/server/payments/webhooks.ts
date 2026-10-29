// Provider notifications.
//
// Stripe: the signature is verified over the exact raw body before anything else. The
// event is then only a prompt: the Checkout Session is re-read from Stripe's API (outside
// any transaction) and that authoritative state is applied together with a
// processed-event row in one short transaction. A redelivered event is acknowledged
// without being applied twice. Failures return 5xx so Stripe retries.
//
// Pesapal: IPN calls are not signed and carry no status (developer.pesapal.com). They
// must name a known order (tracking id AND merchant reference), are throttled per order,
// and only trigger an authenticated GetTransactionStatus query.
import type { Database } from "@/server/db";
import { readLimitedBytes } from "@/server/http/body";
import { ExecutionBudget } from "@/server/execution-budget";
import {
  stripeFinancialClient,
  applyFinancialSnapshot,
  financialSelect,
  FinancialUnavailable,
} from "@/server/payments/financial";
import { log, safeErrorCode } from "@/server/log";
import { providerById } from "@/server/payments/common";
import type {
  PaymentsConfigResult,
  PaymentsConfig,
} from "@/server/payments/config";
import { isPesapalTrackingId } from "@/server/payments/pesapal";
import {
  applyVerifiedStatus,
  donationRecordSelect,
} from "@/server/payments/state";
import { CHECK_INTERVAL_MS, reconcileDonation } from "@/server/payments/status";
import {
  STRIPE_SESSION_ID,
  verifyStripeSignature,
} from "@/server/payments/stripe";

export const MAX_WEBHOOK_BYTES = 262_144;
export const MAX_PESAPAL_IPN_BYTES = 4096;

export async function parsePesapalBody(
  request: Request,
  budget?: ExecutionBudget,
) {
  try {
    const read = await readLimitedBytes(
      request,
      MAX_PESAPAL_IPN_BYTES,
      budget?.requestSignal(8000),
    );
    if ("tooLarge" in read) return undefined;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(read.bytes);
    if (
      request.headers.get("content-type")?.includes("application/json") ||
      text.trim().startsWith("{")
    ) {
      const data: unknown = JSON.parse(text);
      if (!data || typeof data !== "object" || Array.isArray(data))
        return undefined;
      if (Object.values(data).some((value) => typeof value !== "string"))
        return undefined;
      return new URLSearchParams(data as Record<string, string>);
    }
    // URLSearchParams tolerates malformed escapes/UTF-8; validate before parsing.
    for (const part of text.split("&"))
      for (const value of part.split("="))
        decodeURIComponent(value.replaceAll("+", " "));
    return new URLSearchParams(text);
  } catch {
    return undefined;
  }
}

export const STRIPE_FINANCIAL_EVENTS = new Set([
  "charge.refunded",
  "charge.refund.updated",
  "refund.created",
  "refund.updated",
  "refund.failed",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
]);
export const STRIPE_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  ...STRIPE_FINANCIAL_EVENTS,
]);

export type WebhookDeps = {
  readConfig: () => PaymentsConfigResult;
  getDb: () => Database;
  fetchImpl?: typeof fetch;
  now?: () => number;
  budget?: ExecutionBudget;
};

type Reply = { status: number; body: Record<string, unknown> };
const reply = (status: number, body: Record<string, unknown>): Reply => ({
  status,
  body,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readRaw(request: Request, budget: ExecutionBudget) {
  const body = await readLimitedBytes(
    request,
    MAX_WEBHOOK_BYTES,
    budget.requestSignal(8000),
  );
  return "tooLarge" in body ? undefined : body.bytes;
}

export async function handleStripeWebhook(
  request: Request,
  deps: WebhookDeps,
): Promise<Reply> {
  const budget = deps.budget ?? new ExecutionBudget(25_000, request.signal);
  const { config } = deps.readConfig();
  const stripe = config?.methods.card;
  if (!config || !stripe) return reply(503, { error: "not_configured" });

  let raw: Uint8Array | undefined;
  try {
    raw = await readRaw(request, budget);
  } catch {
    raw = undefined;
  }
  if (raw === undefined) return reply(400, { error: "invalid_body" });
  const now = deps.now?.() ?? Date.now();
  const signature = verifyStripeSignature(
    raw,
    request.headers.get("stripe-signature"),
    stripe.webhookSecret,
    Math.floor(now / 1000),
  );
  if (!signature.ok) {
    log("warn", "stripe_webhook_rejected", { code: signature.reason });
    return reply(400, { error: "invalid_signature" });
  }

  let event: {
    id?: unknown;
    type?: unknown;
    livemode?: unknown;
    data?: { object?: { id?: unknown; client_reference_id?: unknown } };
  };
  try {
    event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    if (!event || typeof event !== "object" || Array.isArray(event))
      return reply(400, { error: "invalid_event" });
  } catch {
    return reply(400, { error: "invalid_json" });
  }
  const eventId =
    typeof event.id === "string" && event.id.length <= 255 ? event.id : "";
  const type = typeof event.type === "string" ? event.type : "";
  if (!/^evt_[A-Za-z0-9]+$/.test(eventId) || !type)
    return reply(400, { error: "invalid_event" });
  if (!STRIPE_EVENTS.has(type))
    return reply(200, { received: true, ignored: true });
  if ((event.livemode === true) !== (config.mode === "live")) {
    log("warn", "stripe_webhook_wrong_mode", { eventType: type });
    return reply(200, { received: true, ignored: true });
  }
  const sessionId = event.data?.object?.id;
  if (STRIPE_FINANCIAL_EVENTS.has(type)) {
    if (typeof sessionId !== "string")
      return reply(400, { error: "invalid_event" });
    return handleStripeFinancialEvent(
      deps.getDb(),
      config,
      eventId,
      type,
      sessionId,
      deps,
      budget,
    );
  }
  if (typeof sessionId !== "string" || !STRIPE_SESSION_ID.test(sessionId))
    return reply(400, { error: "invalid_event" });

  const db = deps.getDb();
  try {
    const seen = await db.paymentEvent.findUnique({
      where: { provider_eventId: { provider: "stripe", eventId } },
      select: { id: true },
    });
    if (seen) return reply(200, { received: true, duplicate: true });

    const clientReference = event.data?.object?.client_reference_id;
    const donation = await db.donation.findFirst({
      where: {
        OR: [
          { providerSessionId: sessionId },
          ...(typeof clientReference === "string" && UUID.test(clientReference)
            ? [{ id: clientReference, providerSessionId: null }]
            : []),
        ],
        provider: "stripe",
      },
      select: donationRecordSelect,
    });
    if (!donation) {
      await recordEvent(db, eventId, type, undefined, "unmatched");
      log("warn", "stripe_webhook_unmatched", { eventType: type });
      return reply(200, { received: true });
    }

    // Authoritative state from Stripe's API, never from the event snapshot.
    const provider = providerById(config, "stripe", deps.fetchImpl, budget)!;
    const fetched = await provider.fetchStatus(sessionId);
    if (fetched.kind !== "ok") {
      log("warn", "stripe_webhook_status_unavailable", {
        donationId: donation.id,
        code: fetched.code,
      });
      return reply(503, { error: "status_unavailable" });
    }
    const outcome = await db.$transaction(async (tx) => {
      await tx.paymentEvent.create({
        data: {
          provider: "stripe",
          eventId,
          type,
          donationId: donation.id,
          outcome: "processing",
        },
      });
      // A session first seen through its webhook is linked here.
      if (!donation.providerSessionId)
        await tx.donation.updateMany({
          where: { id: donation.id, providerSessionId: null },
          data: { providerSessionId: sessionId },
        });
      const applied = await applyVerifiedStatus(
        tx,
        { ...donation, providerSessionId: sessionId },
        fetched.status,
      );
      const label = applied.reason
        ? "needs_review"
        : applied.changed
          ? applied.to
          : "no_change";
      await tx.paymentEvent.updateMany({
        where: { provider: "stripe", eventId },
        data: { outcome: label },
      });
      return label;
    });
    log("info", "stripe_webhook_processed", {
      donationId: donation.id,
      eventType: type,
      outcome,
    });
    return reply(200, { received: true });
  } catch (error) {
    // Concurrent delivery of the same event: the other request recorded it.
    if ((error as { code?: string })?.code === "P2002")
      return reply(200, { received: true, duplicate: true });
    log("error", "stripe_webhook_failed", { code: safeErrorCode(error) });
    return reply(500, { error: "processing_failed" });
  }
}

async function handleStripeFinancialEvent(
  db: Database,
  config: PaymentsConfig,
  eventId: string,
  type: string,
  objectId: string,
  deps: WebhookDeps,
  budget: ExecutionBudget,
): Promise<Reply> {
  let donationId: string | undefined;
  try {
    if (
      await db.paymentEvent.findUnique({
        where: { provider_eventId: { provider: "stripe", eventId } },
        select: { id: true },
      })
    )
      return reply(200, { received: true, duplicate: true });
    const stripe = config.methods.card;
    if (!stripe || stripe.provider !== "stripe")
      return reply(503, { error: "not_configured" });
    const client = stripeFinancialClient(stripe, deps.fetchImpl, budget);
    const paymentId = await client.eventPaymentId(type, objectId);
    let donation = await db.donation.findFirst({
      where: { provider: "stripe", providerPaymentId: paymentId },
      select: financialSelect,
    });
    if (!donation) {
      const id = await client.identity(paymentId);
      if (id)
        donation = await db.donation.findFirst({
          where: { id, provider: "stripe" },
          select: financialSelect,
        });
      // Out-of-order financial event: prove this intent also belongs to our Checkout.
      if (donation) {
        if (!donation.providerSessionId)
          throw new FinancialUnavailable("financial_session_missing");
        const provider = providerById(
          config,
          "stripe",
          deps.fetchImpl,
          budget,
        )!;
        const status = await provider.fetchStatus(donation.providerSessionId);
        if (status.kind !== "ok" || status.status.paymentId !== paymentId)
          throw new FinancialUnavailable("financial_session_mismatch");
      }
    }
    if (!donation) {
      await recordEvent(db, eventId, type, undefined, "unmatched");
      return reply(200, { received: true, ignored: true });
    }
    donationId = donation.id;
    // Capture the row version before fetching. A stale in-flight response cannot
    // overwrite a newer financial snapshot, even for distinct concurrent events.
    const snapshot = await client.snapshot(paymentId);
    const outcome = await db.$transaction(async (tx) => {
      await tx.paymentEvent.create({
        data: {
          provider: "stripe",
          eventId,
          type,
          donationId,
          outcome: "processing",
        },
      });
      const result = await applyFinancialSnapshot(tx, donation, snapshot);
      await tx.paymentEvent.updateMany({
        where: { provider: "stripe", eventId },
        data: { outcome: result },
      });
      return result;
    });
    log("info", "stripe_financial_processed", {
      donationId,
      eventType: type,
      outcome,
    });
    return reply(200, { received: true });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      return reply(200, { received: true, duplicate: true });
    const code = safeErrorCode(error);
    if (donationId)
      await db.donation
        .updateMany({
          where: { id: donationId },
          data: {
            reconcileFailures: { increment: 1 },
            lastReconcileError: code,
          },
        })
        .catch(() => {});
    log("error", "stripe_financial_failed", { donationId, code });
    return reply(503, { error: "financial_unavailable" });
  }
}

async function recordEvent(
  db: Database,
  eventId: string,
  type: string,
  donationId: string | undefined,
  outcome: string,
) {
  await db.paymentEvent.createMany({
    data: [{ provider: "stripe", eventId, type, donationId, outcome }],
    skipDuplicates: true,
  });
}

/** Pesapal expects this acknowledgement shape: 200 = processed, 500 = failed. */
function ipnAck(
  notificationType: string,
  trackingId: string,
  reference: string,
  status: 200 | 500,
): Reply {
  return reply(200, {
    orderNotificationType: notificationType,
    orderTrackingId: trackingId,
    orderMerchantReference: reference,
    status,
  });
}

export async function handlePesapalIpn(
  params: URLSearchParams,
  deps: WebhookDeps,
): Promise<Reply> {
  const trackingId = params.get("OrderTrackingId") ?? "";
  const reference = params.get("OrderMerchantReference") ?? "";
  const notificationType = params.get("OrderNotificationType") ?? "";
  if (
    !isPesapalTrackingId(trackingId) ||
    !/^KCTF-D-[0-9A-Z]{8}$/.test(reference) ||
    !/^[A-Z]{1,20}$/.test(notificationType)
  )
    return reply(400, { error: "invalid_notification" });
  const { config } = deps.readConfig();
  if (!config?.methods.mobile_money)
    return ipnAck(notificationType, trackingId, reference, 500);
  try {
    const db = deps.getDb();
    const donation = await db.donation.findFirst({
      where: { providerSessionId: trackingId, reference, provider: "pesapal" },
      select: {
        ...donationRecordSelect,
        provider: true,
        createdAt: true,
        lastCheckedAt: true,
      },
    });
    if (!donation) {
      log("warn", "pesapal_ipn_unmatched");
      // Acknowledge so a forged or stale notification is not retried forever.
      return ipnAck(notificationType, trackingId, reference, 200);
    }
    // Repeated notifications within a few seconds share one status query.
    const now = deps.now?.() ?? Date.now();
    if (
      donation.lastCheckedAt &&
      now - donation.lastCheckedAt.getTime() < CHECK_INTERVAL_MS
    )
      return ipnAck(notificationType, trackingId, reference, 200);
    const fetched = await reconcileDonation(
      db,
      config as PaymentsConfig,
      donation,
      deps.fetchImpl,
      now,
      deps.budget,
    );
    const ok = fetched?.kind === "ok";
    log(ok ? "info" : "warn", "pesapal_ipn_processed", {
      donationId: donation.id,
      code: ok ? fetched.status.code : fetched?.code,
    });
    return ipnAck(notificationType, trackingId, reference, ok ? 200 : 500);
  } catch (error) {
    log("error", "pesapal_ipn_failed", { code: safeErrorCode(error) });
    return ipnAck(notificationType, trackingId, reference, 500);
  }
}
