// Pesapal API 3.0 (developer.pesapal.com, "API 3.0 - JSON"): hosted checkout that offers
// MTN MoMo and Airtel Money in Uganda. Visitors choose the network and approve the
// payment on their phone on Pesapal's page; this site never asks for a phone PIN or OTP.
//
// Pesapal IPN calls and callback redirects carry no payment status and are not signed, so
// they are only prompts: the status always comes from the authenticated
// GetTransactionStatus endpoint. Pesapal has no idempotency header; the merchant
// reference (our donation reference) is unique per order.
import type { PesapalConfig } from "@/server/payments/config";
import { fetchJson, type ExecutionBudget } from "@/server/execution-budget";
import {
  retryableStatus,
  safeProviderCode,
  type CheckoutRequest,
  type CheckoutResult,
  type PaymentProvider,
  type StatusResult,
  type VerifiedStatus,
} from "@/server/payments/provider";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPesapalTrackingId = (value: string) => UUID.test(value);

/** GetTransactionStatus `status_code`: 0 INVALID, 1 COMPLETED, 2 FAILED, 3 REVERSED. */
const STATUS_CODES: Record<number, VerifiedStatus["state"]> = {
  // INVALID is also what an order that has not been paid yet reports.
  0: "pending",
  1: "succeeded",
  2: "failed",
  3: "reversed",
};

type Json = Record<string, unknown>;

// Tokens are valid for at most five minutes; cache per credentials, refresh early.
const tokens = new Map<string, { token: string; expires: number }>();
export function clearPesapalTokens() {
  tokens.clear();
}

export function createPesapalProvider(
  config: PesapalConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000,
  budget?: ExecutionBudget,
): PaymentProvider {
  async function request(
    method: "GET" | "POST",
    path: string,
    body?: object,
    bearer?: string,
  ): Promise<
    { ok: true; body: Json } | { ok: false; retryable: boolean; code: string }
  > {
    let response: Response;
    let json: Json = {};
    try {
      const result = await fetchJson(
        fetchImpl,
        `${config.apiUrl}${path}`,
        {
          method,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        },
        timeoutMs,
        budget,
      );
      response = result.response;
      json = result.body;
    } catch (error) {
      const name = (error as { name?: string })?.name;
      return {
        ok: false,
        retryable: true,
        code: name === "TimeoutError" ? "provider_timeout" : "provider_network",
      };
    }
    // Pesapal reports some errors with HTTP 200 and an `error` object or `status` field.
    const error = json.error as { code?: unknown; error_type?: unknown } | null;
    const status = Number(json.status ?? response.status);
    const hasError = error && (error.code || error.error_type);
    if (response.ok && !hasError && (!json.status || status === 200))
      return { ok: true, body: json };
    const httpStatus = response.ok ? status || 500 : response.status;
    return {
      ok: false,
      retryable: retryableStatus(httpStatus),
      code: safeProviderCode(
        error?.code ?? error?.error_type,
        `http_${httpStatus}`,
      ),
    };
  }

  async function token(): Promise<
    | { ok: true; token: string }
    | { ok: false; retryable: boolean; code: string }
  > {
    const cached = tokens.get(config.consumerKey);
    if (cached && cached.expires > Date.now()) return { ok: true, ...cached };
    const result = await request("POST", "/Auth/RequestToken", {
      consumer_key: config.consumerKey,
      consumer_secret: config.consumerSecret,
    });
    if (!result.ok) return result;
    const value = result.body.token;
    if (typeof value !== "string" || !value)
      return { ok: false, retryable: false, code: "auth_failed" };
    const expiry = Date.parse(String(result.body.expiryDate ?? ""));
    // Refresh a minute early; never trust more than the documented five minutes.
    const expires = Math.min(
      Number.isFinite(expiry) ? expiry : Infinity,
      Date.now() + 5 * 60_000,
    );
    tokens.set(config.consumerKey, { token: value, expires: expires - 60_000 });
    return { ok: true, token: value };
  }

  async function fetchStatus(sessionId: string): Promise<StatusResult> {
    if (!isPesapalTrackingId(sessionId))
      return { kind: "permanent", code: "invalid_session" };
    const auth = await token();
    if (!auth.ok)
      return {
        kind: auth.retryable ? "retryable" : "permanent",
        code: auth.code,
      };
    const result = await request(
      "GET",
      `/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(sessionId)}`,
      undefined,
      auth.token,
    );
    if (!result.ok)
      return {
        kind: result.retryable ? "retryable" : "permanent",
        code: result.code,
      };
    const body = result.body;
    const code = Number(body.status_code);
    const state = STATUS_CODES[code];
    if (state === undefined)
      return { kind: "retryable", code: "unknown_status" };
    const currency =
      typeof body.currency === "string"
        ? body.currency.toUpperCase()
        : undefined;
    const amount = Number(body.amount);
    return {
      kind: "ok",
      status: {
        state,
        // UGX has no minor unit; other currencies are not offered through Pesapal.
        amountMinor:
          currency === "UGX" && Number.isSafeInteger(amount) && amount > 0
            ? amount
            : undefined,
        currency,
        reference:
          typeof body.merchant_reference === "string"
            ? body.merchant_reference
            : undefined,
        sessionId,
        paymentId:
          typeof body.confirmation_code === "string" && body.confirmation_code
            ? body.confirmation_code.slice(0, 255)
            : undefined,
        code: safeProviderCode(
          body.payment_status_description,
          `status_${code}`,
        ),
      },
    };
  }

  return {
    id: "pesapal",
    fetchStatus,
    async createCheckout(request_: CheckoutRequest): Promise<CheckoutResult> {
      if (request_.currency !== "UGX")
        return { kind: "permanent", code: "unsupported_currency" };
      const auth = await token();
      if (!auth.ok)
        return {
          kind: auth.retryable ? "retryable" : "permanent",
          code: auth.code,
        };
      const result = await request(
        "POST",
        "/Transactions/SubmitOrderRequest",
        {
          id: request_.reference,
          currency: request_.currency,
          amount: request_.amountMinor,
          description: `Donation to KCTF (${request_.reference})`.slice(0, 100),
          callback_url: request_.returnUrl,
          cancellation_url: request_.cancelUrl,
          redirect_mode: "TOP_WINDOW",
          notification_id: config.ipnId,
          billing_address: {
            email_address: request_.donorEmail,
            first_name: request_.donorName.slice(0, 100),
          },
        },
        auth.token,
      );
      if (!result.ok)
        return {
          kind: result.retryable ? "retryable" : "permanent",
          code: result.code,
        };
      const sessionId = result.body.order_tracking_id;
      const url = result.body.redirect_url;
      if (
        typeof sessionId !== "string" ||
        !isPesapalTrackingId(sessionId) ||
        typeof url !== "string" ||
        !url.startsWith("https://") ||
        result.body.merchant_reference !== request_.reference
      )
        return { kind: "permanent", code: "invalid_order" };
      return { kind: "created", sessionId, url };
    },
  };
}
