// Synthetic payment configuration and provider doubles. No real keys, accounts or
// provider endpoints are used anywhere in the tests.
import { vi } from "vitest";
import type { PaymentsConfig } from "@/server/payments/config";
import { signStripePayload } from "@/server/payments/stripe";
import { origin } from "./fixtures";

export const stripeTestKey = "sk_test_SyntheticKey0123456789";
export const webhookSecret = "whsec_SyntheticSecret0123456789";
export const pesapalIpnId = "11111111-2222-4333-8444-555555555555";

export const paymentsTestConfig: PaymentsConfig = {
  mode: "test",
  siteOrigin: origin,
  siteHostname: "kctf.example",
  turnstileSiteKey: "synthetic-site-key",
  turnstileSecret: "synthetic-turnstile-secret",
  turnstileVerifyUrl:
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  abuseHashSecret: "synthetic-abuse-hash-secret-0123456789",
  trustedProxy: "vercel",
  methods: {
    card: {
      provider: "stripe",
      secretKey: stripeTestKey,
      webhookSecret,
      currencies: ["USD", "EUR"],
      apiUrl: "https://stripe.test.invalid",
    },
    mobile_money: {
      provider: "pesapal",
      consumerKey: "synthetic-consumer-key",
      consumerSecret: "synthetic-consumer-secret",
      ipnId: pesapalIpnId,
      currencies: ["UGX"],
      apiUrl: "https://pesapal.test.invalid/api",
    },
  },
};

/** A complete, valid environment for test-mode payments on staging (synthetic). */
export const paymentsEnv: Record<string, string> = {
  SITE_ENVIRONMENT: "staging",
  SITE_URL: origin,
  DATABASE_URL:
    "postgresql://synthetic:synthetic@ep-synthetic-pooler.example.neon.tech/kctf?sslmode=require",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "synthetic-site-key",
  TURNSTILE_SECRET_KEY: "synthetic-turnstile-secret",
  ABUSE_HASH_SECRET: "synthetic-abuse-hash-secret-0123456789",
  DONATION_PAYMENTS_ENABLED: "true",
  PAYMENTS_MODE: "test",
  STRIPE_SECRET_KEY: stripeTestKey,
  STRIPE_WEBHOOK_SECRET: webhookSecret,
  PESAPAL_CONSUMER_KEY: "synthetic-consumer-key",
  PESAPAL_CONSUMER_SECRET: "synthetic-consumer-secret",
  PESAPAL_IPN_ID: pesapalIpnId,
};

export const donationInput = (overrides: Record<string, unknown> = {}) => ({
  method: "card",
  currency: "USD",
  amount: "50",
  name: "Synthetic Donor",
  email: "donor@example.com",
  message: "",
  consent: true,
  website: "",
  token: "synthetic-turnstile-token",
  idempotencyKey: crypto.randomUUID(),
  ...overrides,
});

export function donationRequest(
  data: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`${origin}/api/donations`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: typeof data === "string" ? data : JSON.stringify(data),
  });
}

/** A Checkout Session as Stripe returns it (only the fields the code reads). */
export function stripeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_SyntheticSession0001",
    object: "checkout.session",
    url: "https://checkout.stripe.com/c/pay/cs_test_SyntheticSession0001",
    status: "open",
    payment_status: "unpaid",
    amount_total: 5000,
    currency: "usd",
    client_reference_id: null,
    metadata: {},
    livemode: false,
    payment_intent: null,
    ...overrides,
  };
}

export function stripeEvent(
  type: string,
  session: Record<string, unknown>,
  id = `evt_${crypto.randomUUID().replace(/-/g, "")}`,
) {
  return JSON.stringify({
    id,
    object: "event",
    type,
    livemode: false,
    data: { object: session },
  });
}

export function signedWebhook(
  body: string,
  secret = webhookSecret,
  t?: number,
) {
  return new Request(`${origin}/api/payments/stripe/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signStripePayload(body, secret, t),
    },
    body,
  });
}

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

/**
 * Routes fetch calls to Turnstile, Stripe and Pesapal doubles. Unknown URLs throw, so a
 * test fails loudly if code tries to reach a real service.
 */
export function providerDoubles(handlers: {
  turnstile?: Handler;
  stripe?: Handler;
  pesapal?: Handler;
}) {
  return vi.fn(
    async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.href.includes("siteverify"))
        return (
          handlers.turnstile?.(url, init) ??
          Response.json({
            success: true,
            hostname: "kctf.example",
            action: "donation",
          })
        );
      if (url.hostname === "stripe.test.invalid" && handlers.stripe)
        return handlers.stripe(url, init);
      if (url.hostname === "pesapal.test.invalid" && handlers.pesapal)
        return handlers.pesapal(url, init);
      throw new Error(`Unexpected request to ${url.href}`);
    },
  );
}
