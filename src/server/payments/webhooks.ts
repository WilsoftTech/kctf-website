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

export const STRIPE_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

export type WebhookDeps = {
  readConfig: () => PaymentsConfigResult;
  getDb: () => Database;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

type Reply = { status: number; body: Record<string, unknown> };
const reply = (status: number, body: Record<string, unknown>): Reply => ({
  status,
  body,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readRaw(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > MAX_WEBHOOK_BYTES)
    return undefined;
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_WEBHOOK_BYTES) return undefined;
  // Verify the exact bytes Stripe signed, decoded as UTF-8 without normalisation.
  return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
}

export async function handleStripeWebhook(
  request: Request,
  deps: WebhookDeps,
): Promise<Reply> {
  const { config } = deps.readConfig();
  const stripe = config?.methods.card;
  if (!config || !stripe) return reply(503, { error: "not_configured" });

  let raw: string | undefined;
  try {
    raw = await readRaw(request);
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
    event = JSON.parse(raw);
  } catch {
    return reply(400, { error: "invalid_json" });
  }
  const eventId = typeof event.id === "string" ? event.id.slice(0, 255) : "";
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
    const provider = providerById(config, "stripe", deps.fetchImpl)!;
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
