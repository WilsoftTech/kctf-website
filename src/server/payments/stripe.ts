// Stripe Checkout (hosted page) through Stripe's REST API, in the same minimal style as
// the Resend client. Sessions are created on the server with server-computed amounts and
// a stable Idempotency-Key per donation. Webhooks are verified against the raw body and
// then treated as a prompt: the Checkout Session is re-read from the API before any state
// changes, as Stripe recommends for snapshot events (docs.stripe.com/checkout/fulfillment).
import { createHmac, timingSafeEqual } from "node:crypto";
import type { DonationCurrency } from "@/lib/donation-options";
import type { StripeConfig } from "@/server/payments/config";
import {
  retryableStatus,
  safeProviderCode,
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentProvider,
  type StatusResult,
  type VerifiedStatus,
} from "@/server/payments/provider";

/** Stripe's default webhook tolerance is five minutes. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;
/** Checkout Sessions may expire 30 minutes to 24 hours after creation. */
export const SESSION_LIFETIME_SECONDS = 60 * 60;

// docs.stripe.com/currencies "Special cases": ISK and UGX are zero-decimal in ISO 4217 but
// Stripe represents them as two-decimal amounts whose fraction is always 00.
const STRIPE_TWO_DECIMAL_ZERO_FRACTION = new Set(["ISK", "UGX"]);

/** ISO minor units → Stripe API `amount` units. */
export function toStripeAmount(minor: number, currency: DonationCurrency) {
  return STRIPE_TWO_DECIMAL_ZERO_FRACTION.has(currency) ? minor * 100 : minor;
}

/** Stripe API `amount` units → ISO minor units; undefined if not representable. */
export function fromStripeAmount(amount: number, currency: string) {
  if (!Number.isSafeInteger(amount)) return undefined;
  if (!STRIPE_TWO_DECIMAL_ZERO_FRACTION.has(currency.toUpperCase()))
    return amount;
  return amount % 100 === 0 ? amount / 100 : undefined;
}

export type SignatureCheck =
  | { ok: true }
  | { ok: false; reason: "missing" | "malformed" | "stale" | "mismatch" };

/**
 * Verifies a `Stripe-Signature` header (`t=…,v1=…[,v1=…]`) over the exact raw body.
 * Any matching v1 signature is accepted, which covers secret rotation; v0 and unknown
 * schemes are ignored. Comparison is constant-time.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
): SignatureCheck {
  if (!header) return { ok: false, reason: "missing" };
  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    if (key === "v1" && /^[0-9a-f]{64}$/.test(value)) signatures.push(value);
  }
  if (timestamp === undefined || !signatures.length)
    return { ok: false, reason: "malformed" };
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds)
    return { ok: false, reason: "stale" };
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest();
  const matched = signatures.some((s) =>
    timingSafeEqual(Buffer.from(s, "hex"), expected),
  );
  return matched ? { ok: true } : { ok: false, reason: "mismatch" };
}

/** Builds a valid header for tests and local doubles. */
export function signStripePayload(
  rawBody: string,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

type StripeSession = {
  id?: unknown;
  url?: unknown;
  status?: unknown;
  payment_status?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  client_reference_id?: unknown;
  metadata?: { donation_reference?: unknown } | null;
  livemode?: unknown;
  payment_intent?: { id?: unknown; status?: unknown } | string | null;
};

export const STRIPE_SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,250}$/;

/** Maps a retrieved Checkout Session (payment_intent expanded) to a normalised status. */
export function sessionStatus(
  session: StripeSession,
): VerifiedStatus | undefined {
  if (typeof session.id !== "string" || !STRIPE_SESSION_ID.test(session.id))
    return undefined;
  const intent =
    session.payment_intent && typeof session.payment_intent === "object"
      ? session.payment_intent
      : undefined;
  const intentStatus =
    typeof intent?.status === "string" ? intent.status : undefined;
  const currency =
    typeof session.currency === "string"
      ? session.currency.toUpperCase()
      : undefined;
  let state: VerifiedStatus["state"];
  if (session.status === "complete" && session.payment_status === "paid")
    state = "succeeded";
  else if (session.status === "expired") state = "expired";
  else if (
    session.status === "complete" &&
    (intentStatus === "requires_payment_method" || intentStatus === "canceled")
  )
    // A delayed payment method failed after Checkout completed.
    state = "failed";
  else state = "pending";
  return {
    state,
    amountMinor:
      typeof session.amount_total === "number" && currency
        ? fromStripeAmount(session.amount_total, currency)
        : undefined,
    currency,
    donationId:
      typeof session.client_reference_id === "string"
        ? session.client_reference_id
        : undefined,
    reference:
      typeof session.metadata?.donation_reference === "string"
        ? session.metadata.donation_reference
        : undefined,
    sessionId: session.id,
    paymentId:
      typeof intent?.id === "string"
        ? intent.id
        : typeof session.payment_intent === "string"
          ? session.payment_intent
          : undefined,
    live: session.livemode === true,
    code: safeProviderCode(
      `${String(session.status)}_${String(session.payment_status)}`,
      "unknown",
    ),
  };
}

export function createStripeProvider(
  config: StripeConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000,
): PaymentProvider {
  async function call(
    method: "GET" | "POST",
    path: string,
    params?: URLSearchParams,
    idempotencyKey?: string,
  ): Promise<
    | { ok: true; body: StripeSession }
    | { ok: false; retryable: boolean; code: string }
  > {
    const url = new URL(`/v1${path}`, config.apiUrl);
    if (method === "GET" && params) url.search = params.toString();
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          ...(method === "POST"
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: method === "POST" ? (params?.toString() ?? "") : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const name = (error as { name?: string })?.name;
      return {
        ok: false,
        retryable: true,
        code: name === "TimeoutError" ? "provider_timeout" : "provider_network",
      };
    }
    let body: StripeSession & { error?: { code?: unknown; type?: unknown } } =
      {};
    try {
      body = await response.json();
    } catch {
      // Non-JSON body: classify by status alone.
    }
    if (response.ok) return { ok: true, body };
    return {
      ok: false,
      retryable: retryableStatus(response.status),
      code: safeProviderCode(
        body.error?.code ?? body.error?.type,
        `http_${response.status}`,
      ),
    };
  }

  const expand = () => new URLSearchParams({ "expand[]": "payment_intent" });

  function toStatus(result: Awaited<ReturnType<typeof call>>): StatusResult {
    if (!result.ok)
      return {
        kind: result.retryable ? "retryable" : "permanent",
        code: result.code,
      };
    const status = sessionStatus(result.body);
    return status
      ? { kind: "ok", status }
      : { kind: "permanent", code: "invalid_session" };
  }

  async function fetchStatus(sessionId: string): Promise<StatusResult> {
    if (!STRIPE_SESSION_ID.test(sessionId))
      return { kind: "permanent", code: "invalid_session" };
    return toStatus(
      await call("GET", `/checkout/sessions/${sessionId}`, expand()),
    );
  }

  return {
    id: "stripe",
    fetchStatus,
    async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
      const params = new URLSearchParams({
        mode: "payment",
        submit_type: "donate",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": request.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(
          toStripeAmount(request.amountMinor, request.currency),
        ),
        "line_items[0][price_data][product_data][name]":
          "Donation to Kigezi Community Transformation Foundation",
        customer_email: request.donorEmail,
        client_reference_id: request.donationId,
        "metadata[donation_reference]": request.reference,
        "metadata[donation_id]": request.donationId,
        "payment_intent_data[description]": `KCTF donation ${request.reference}`,
        "payment_intent_data[metadata][donation_reference]": request.reference,
        "payment_intent_data[metadata][donation_id]": request.donationId,
        success_url: request.returnUrl,
        cancel_url: request.cancelUrl,
        expires_at: String(
          Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
        ),
      });
      const result = await call(
        "POST",
        "/checkout/sessions",
        params,
        // One key per donation: retries after an uncertain result return the same session.
        `kctf-donation-${request.donationId}`,
      );
      if (!result.ok)
        return {
          kind: result.retryable ? "retryable" : "permanent",
          code: result.code,
        };
      const { id, url } = result.body;
      if (
        typeof id !== "string" ||
        !STRIPE_SESSION_ID.test(id) ||
        typeof url !== "string" ||
        !url.startsWith("https://")
      )
        return { kind: "permanent", code: "invalid_session" };
      return { kind: "created", sessionId: id, url };
    },
    async cancelCheckout(sessionId: string) {
      if (!STRIPE_SESSION_ID.test(sessionId))
        return { kind: "permanent", code: "invalid_session" };
      const expired = await call(
        "POST",
        `/checkout/sessions/${sessionId}/expire`,
        expand(),
        `kctf-expire-${sessionId}`,
      );
      // Only open sessions can be expired. If it already completed or expired, the
      // authoritative state comes from reading the session again.
      if (!expired.ok && !expired.retryable) return fetchStatus(sessionId);
      return toStatus(expired);
    },
  };
}
