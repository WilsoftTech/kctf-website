// Payment logic that needs no database: amounts, minor units, configuration gates,
// webhook signatures, provider adapters against local doubles and early request checks.
// Everything here is mocked; no provider sandbox or real key is involved.
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkAmount, formatAmount, parseAmount } from "@/lib/donation-options";
import {
  readPaymentsConfig,
  publicPaymentOptions,
} from "@/server/payments/config";
import {
  clearPesapalTokens,
  createPesapalProvider,
} from "@/server/payments/pesapal";
import {
  createStripeProvider,
  fromStripeAmount,
  sessionStatus,
  signStripePayload,
  toStripeAmount,
  verifyStripeSignature,
} from "@/server/payments/stripe";
import { ALLOWED_FROM, canTransition, mismatch } from "@/server/payments/state";
import { startDonation } from "@/server/payments/create";
import {
  handlePesapalIpn,
  handleStripeWebhook,
} from "@/server/payments/webhooks";
import { donationSchema } from "@/validation/donation";
import { origin } from "../support/fixtures";
import {
  donationInput,
  donationRequest,
  paymentsEnv,
  paymentsTestConfig,
  signedWebhook,
  stripeEvent,
  stripeSession,
  webhookSecret,
} from "../support/payments";

afterEach(() => {
  clearPesapalTokens();
  vi.restoreAllMocks();
});

describe("amounts and currencies", () => {
  it.each([
    ["50", "USD", 5000],
    ["50.5", "USD", 5050],
    ["1,000.25", "USD", 100025],
    ["50000", "UGX", 50000],
    ["50,000", "UGX", 50000],
    [" 20 000 ", "UGX", 20000],
  ] as const)("parses %s %s as %d minor units", (input, currency, minor) => {
    expect(parseAmount(input, currency)).toBe(minor);
  });
  it.each([
    ["50.123", "USD"],
    ["50.5", "UGX"],
    ["-5", "USD"],
    ["1e3", "USD"],
    ["0x10", "USD"],
    ["", "USD"],
    ["12.", "USD"],
    ["9999999999", "UGX"],
  ] as const)("rejects %j in %s", (input, currency) => {
    expect(parseAmount(input, currency)).toBeUndefined();
  });
  it("enforces minimum and maximum gifts per currency", () => {
    expect(checkAmount("4.99", "USD").ok).toBe(false);
    expect(checkAmount("5", "USD")).toEqual({ ok: true, minor: 500 });
    expect(checkAmount("10000", "USD").ok).toBe(true);
    expect(checkAmount("10000.01", "USD").ok).toBe(false);
    expect(checkAmount("4999", "UGX").ok).toBe(false);
    expect(checkAmount("5000000", "UGX").ok).toBe(true);
    expect(checkAmount("5000001", "UGX").ok).toBe(false);
  });
  it("always shows the ISO code, never an exchange-rate conversion", () => {
    expect(formatAmount(5000, "USD")).toBe("USD 50.00");
    expect(formatAmount(50000, "UGX")).toBe("UGX 50,000");
  });
  it("uses Stripe's two-decimal representation for UGX", () => {
    expect(toStripeAmount(50000, "UGX")).toBe(5_000_000);
    expect(toStripeAmount(5000, "USD")).toBe(5000);
    expect(fromStripeAmount(5_000_000, "ugx")).toBe(50000);
    expect(fromStripeAmount(5_000_050, "ugx")).toBeUndefined();
    expect(fromStripeAmount(5000, "usd")).toBe(5000);
  });
});

describe("donation request schema", () => {
  it("accepts a normal request", () => {
    expect(donationSchema.safeParse(donationInput()).success).toBe(true);
  });
  it.each([
    { cardNumber: "4242424242424242" },
    { cvv: "123" },
    { pin: "1234" },
    { otp: "000000" },
    { amountMinor: 1 },
    { recurring: true },
  ])("rejects unexpected field %o", (extra) => {
    expect(donationSchema.safeParse(donationInput(extra)).success).toBe(false);
  });
  it("rejects unknown methods and currencies", () => {
    expect(
      donationSchema.safeParse(donationInput({ method: "paypal" })).success,
    ).toBe(false);
    expect(
      donationSchema.safeParse(donationInput({ currency: "KES" })).success,
    ).toBe(false);
  });
});

describe("payment configuration", () => {
  it("is off by default and says nothing is wrong", () => {
    expect(readPaymentsConfig({})).toEqual({ enabled: false, issues: [] });
  });
  it("enables both methods with a complete test configuration", () => {
    const { config, issues } = readPaymentsConfig(paymentsEnv);
    expect(issues).toEqual([]);
    expect(config?.mode).toBe("test");
    expect(config?.methods.card?.currencies).toEqual(["USD"]);
    expect(config?.methods.mobile_money?.currencies).toEqual(["UGX"]);
    expect(config?.methods.mobile_money?.apiUrl).toBe(
      "https://cybqa.pesapal.com/pesapalv3/api",
    );
  });
  it("offers a method only when its provider is configured", () => {
    const env = { ...paymentsEnv };
    for (const key of Object.keys(env))
      if (key.startsWith("PESAPAL_")) delete env[key];
    const options = publicPaymentOptions(readPaymentsConfig(env));
    expect(options.methods.card.available).toBe(true);
    expect(options.methods.mobile_money).toEqual({
      available: false,
      currencies: [],
    });
  });
  it("reports a half-configured provider instead of ignoring it", () => {
    const { config, issues } = readPaymentsConfig({
      ...paymentsEnv,
      PESAPAL_IPN_ID: "not-a-uuid",
    });
    expect(config?.methods.mobile_money).toBeUndefined();
    expect(config?.methods.card).toBeDefined();
    expect(issues.join(" ")).toMatch(/PESAPAL_IPN_ID/);
  });
  it("refuses live keys in test mode and test keys in live mode", () => {
    expect(
      readPaymentsConfig({
        ...paymentsEnv,
        STRIPE_SECRET_KEY: "sk_live_Abcdefghij0123",
      }).issues.join(" "),
    ).toMatch(/test-mode/);
    const live = readPaymentsConfig({
      ...paymentsEnv,
      SITE_ENVIRONMENT: "production",
      SITE_INDEXING: "index",
      PAYMENTS_MODE: "live",
      PAYMENTS_LIVE_APPROVED: "true",
    });
    expect(live.issues.join(" ")).toMatch(/live-mode/);
    expect(live.config?.methods.card).toBeUndefined();
  });
  it("keeps live payments off without explicit approval and production", () => {
    const unapproved = readPaymentsConfig({
      ...paymentsEnv,
      SITE_ENVIRONMENT: "production",
      PAYMENTS_MODE: "live",
    });
    expect(unapproved.config).toBeUndefined();
    expect(unapproved.issues.join(" ")).toMatch(/PAYMENTS_LIVE_APPROVED/);
    const staging = readPaymentsConfig({
      ...paymentsEnv,
      PAYMENTS_MODE: "live",
      PAYMENTS_LIVE_APPROVED: "true",
    });
    expect(staging.config).toBeUndefined();
    expect(staging.issues.join(" ")).toMatch(/only allowed in production/);
  });
  it("refuses test mode on production", () => {
    const result = readPaymentsConfig({
      ...paymentsEnv,
      SITE_ENVIRONMENT: "production",
    });
    expect(result.config).toBeUndefined();
  });
  it("accepts only the documented card currencies", () => {
    expect(
      readPaymentsConfig({ ...paymentsEnv, STRIPE_CURRENCIES: "usd,eur" })
        .config?.methods.card?.currencies,
    ).toEqual(["USD", "EUR"]);
    expect(
      readPaymentsConfig({ ...paymentsEnv, STRIPE_CURRENCIES: "USD,UGX" })
        .config?.methods.card,
    ).toBeUndefined();
  });
  it("refuses provider API overrides outside development and test", () => {
    const result = readPaymentsConfig({
      ...paymentsEnv,
      STRIPE_API_URL: "http://127.0.0.1:9999",
    });
    expect(result.config?.methods.card).toBeUndefined();
    expect(result.issues.join(" ")).toMatch(/STRIPE_API_URL/);
  });
  it("never puts secrets in the public options", () => {
    const options = JSON.stringify(
      publicPaymentOptions(readPaymentsConfig(paymentsEnv)),
    );
    expect(options).not.toMatch(/sk_test|whsec_|consumer|abuse/);
  });
});

describe("Stripe webhook signatures", () => {
  const body = stripeEvent("checkout.session.completed", stripeSession());
  const now = 1_800_000_000;
  it("accepts a valid signature over the raw body", () => {
    const header = signStripePayload(body, webhookSecret, now);
    expect(verifyStripeSignature(body, header, webhookSecret, now)).toEqual({
      ok: true,
    });
  });
  it("accepts any matching v1 signature (secret rotation)", () => {
    const good = signStripePayload(body, webhookSecret, now).split(",")[1];
    const old = signStripePayload(body, "whsec_OldSecret0123456789", now);
    expect(
      verifyStripeSignature(body, `${old},${good}`, webhookSecret, now).ok,
    ).toBe(true);
  });
  it.each([
    ["missing", null],
    ["malformed", "garbage"],
    ["malformed", "t=1800000000,v0=abc"],
  ] as const)("rejects a %s header", (reason, header) => {
    expect(verifyStripeSignature(body, header, webhookSecret, now)).toEqual({
      ok: false,
      reason,
    });
  });
  it("rejects a wrong secret, a tampered body and a stale timestamp", () => {
    const header = signStripePayload(body, webhookSecret, now);
    expect(
      verifyStripeSignature(body, header, "whsec_Wrong0123456789", now).ok,
    ).toBe(false);
    expect(
      verifyStripeSignature(
        body.replace("5000", "1"),
        header,
        webhookSecret,
        now,
      ),
    ).toEqual({ ok: false, reason: "mismatch" });
    expect(
      verifyStripeSignature(body, header, webhookSecret, now + 301),
    ).toEqual({ ok: false, reason: "stale" });
    // Whitespace changes after parsing would also break the signature.
    expect(
      verifyStripeSignature(
        JSON.stringify(JSON.parse(body), null, 2),
        header,
        webhookSecret,
        now,
      ).ok,
    ).toBe(false);
  });
});

describe("Stripe Checkout Session mapping", () => {
  it.each([
    [{ status: "complete", payment_status: "paid" }, "succeeded"],
    [{ status: "open", payment_status: "unpaid" }, "pending"],
    [{ status: "expired", payment_status: "unpaid" }, "expired"],
    [
      {
        status: "complete",
        payment_status: "unpaid",
        payment_intent: { id: "pi_1", status: "processing" },
      },
      "pending",
    ],
    [
      {
        status: "complete",
        payment_status: "unpaid",
        payment_intent: { id: "pi_1", status: "requires_payment_method" },
      },
      "failed",
    ],
    [{ status: "complete", payment_status: "no_payment_required" }, "pending"],
  ])("maps %o to %s", (fields, state) => {
    expect(sessionStatus(stripeSession(fields))?.state).toBe(state);
  });
  it("reports the provider's amount in ISO minor units and our references", () => {
    const status = sessionStatus(
      stripeSession({
        status: "complete",
        payment_status: "paid",
        currency: "ugx",
        amount_total: 5_000_000,
        client_reference_id: "d1",
        metadata: { donation_reference: "KCTF-D-AAAAAAAA" },
        payment_intent: { id: "pi_123", status: "succeeded" },
      }),
    );
    expect(status).toMatchObject({
      amountMinor: 50000,
      currency: "UGX",
      donationId: "d1",
      reference: "KCTF-D-AAAAAAAA",
      paymentId: "pi_123",
      live: false,
    });
  });
  it("ignores objects that are not Checkout Sessions", () => {
    expect(sessionStatus({ id: "pi_123" })).toBeUndefined();
  });
});

describe("Stripe provider (mocked HTTP)", () => {
  const card = paymentsTestConfig.methods.card!;
  const checkoutRequest = {
    donationId: "0194f9a0-0000-7000-8000-000000000001",
    reference: "KCTF-D-AAAAAAAA",
    amountMinor: 5000,
    currency: "USD" as const,
    donorName: "Synthetic Donor",
    donorEmail: "donor@example.com",
    returnUrl: `${origin}/donate/give/status?token=t`,
    cancelUrl: `${origin}/donate/give/status?token=t&cancelled=1`,
  };
  it("creates a hosted Checkout Session with server amounts and a stable key", async () => {
    const fetchImpl = vi.fn(async () => Response.json(stripeSession()));
    const provider = createStripeProvider(card, fetchImpl as typeof fetch);
    const result = await provider.createCheckout(checkoutRequest);
    expect(result).toEqual({
      kind: "created",
      sessionId: "cs_test_SyntheticSession0001",
      url: "https://checkout.stripe.com/c/pay/cs_test_SyntheticSession0001",
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(String(url)).toBe(
      "https://stripe.test.invalid/v1/checkout/sessions",
    );
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${card.secretKey}`);
    expect(headers["Idempotency-Key"]).toBe(
      `kctf-donation-${checkoutRequest.donationId}`,
    );
    const params = new URLSearchParams(String(init.body));
    expect(params.get("mode")).toBe("payment");
    expect(params.get("submit_type")).toBe("donate");
    expect(params.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(params.get("line_items[0][price_data][unit_amount]")).toBe("5000");
    expect(params.get("client_reference_id")).toBe(checkoutRequest.donationId);
    expect(params.get("metadata[donation_reference]")).toBe("KCTF-D-AAAAAAAA");
    expect(params.get("success_url")).toBe(checkoutRequest.returnUrl);
    expect(params.get("cancel_url")).toBe(checkoutRequest.cancelUrl);
    expect(params.has("payment_method_types[0]")).toBe(false);
  });
  it.each([
    [500, "retryable"],
    [429, "retryable"],
    [400, "permanent"],
    [401, "permanent"],
  ])("classifies HTTP %d as %s", async (status, kind) => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ error: { code: "synthetic_error" } }, { status }),
    );
    const provider = createStripeProvider(card, fetchImpl as typeof fetch);
    expect(await provider.createCheckout(checkoutRequest)).toMatchObject({
      kind,
    });
  });
  it("treats a network failure or timeout as retryable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
    });
    const provider = createStripeProvider(card, fetchImpl as typeof fetch);
    expect(await provider.createCheckout(checkoutRequest)).toEqual({
      kind: "retryable",
      code: "provider_timeout",
    });
  });
  it("refuses a response without a valid session", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ id: "x", url: "http://evil" }),
    );
    const provider = createStripeProvider(card, fetchImpl as typeof fetch);
    expect(await provider.createCheckout(checkoutRequest)).toMatchObject({
      kind: "permanent",
    });
  });
  it("reads status with the payment intent expanded", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        stripeSession({ status: "complete", payment_status: "paid" }),
      ),
    );
    const provider = createStripeProvider(card, fetchImpl as typeof fetch);
    const result = await provider.fetchStatus("cs_test_SyntheticSession0001");
    expect(result).toMatchObject({
      kind: "ok",
      status: { state: "succeeded" },
    });
    const [url] = fetchImpl.mock.calls[0] as unknown as [URL];
    expect(String(url)).toContain("expand%5B%5D=payment_intent");
    expect(await provider.fetchStatus("../../v1/charges")).toMatchObject({
      kind: "permanent",
    });
  });
});

describe("Pesapal provider (mocked HTTP)", () => {
  const momo = paymentsTestConfig.methods.mobile_money!;
  const trackingId = "b945e4af-80a5-4ec1-8706-e03f8332fb04";
  function pesapal(status: Record<string, unknown> = {}) {
    return vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/Auth/RequestToken"))
        return Response.json({
          token: "synthetic.jwt.token",
          expiryDate: new Date(Date.now() + 5 * 60_000).toISOString(),
          error: null,
          status: "200",
        });
      if (url.endsWith("/Transactions/SubmitOrderRequest"))
        return Response.json({
          order_tracking_id: trackingId,
          merchant_reference: "KCTF-D-BBBBBBBB",
          redirect_url: `https://cybqa.pesapal.com/pesapaliframe/PesapalIframe3/Index/?OrderTrackingId=${trackingId}`,
          error: null,
          status: "200",
        });
      if (url.includes("/Transactions/GetTransactionStatus"))
        return Response.json({
          payment_method: "MTN",
          amount: 50000,
          currency: "UGX",
          merchant_reference: "KCTF-D-BBBBBBBB",
          confirmation_code: "SYNTH123",
          payment_status_description: "Completed",
          status_code: 1,
          error: null,
          status: "200",
          ...status,
        });
      throw new Error(`Unexpected ${url}`);
    });
  }
  const order = {
    donationId: "0194f9a0-0000-7000-8000-000000000002",
    reference: "KCTF-D-BBBBBBBB",
    amountMinor: 50000,
    currency: "UGX" as const,
    donorName: "Synthetic Donor",
    donorEmail: "donor@example.com",
    returnUrl: `${origin}/donate/give/status?token=t`,
    cancelUrl: `${origin}/donate/give/status?token=t&cancelled=1`,
  };
  it("submits a hosted order with the registered IPN and our reference", async () => {
    const fetchImpl = pesapal();
    const provider = createPesapalProvider(momo, fetchImpl as typeof fetch);
    expect(await provider.createCheckout(order)).toMatchObject({
      kind: "created",
      sessionId: trackingId,
    });
    const submit = fetchImpl.mock.calls.find(([u]) =>
      String(u).endsWith("SubmitOrderRequest"),
    ) as unknown as [string, RequestInit];
    const body = JSON.parse(String(submit[1].body));
    expect(body).toMatchObject({
      id: "KCTF-D-BBBBBBBB",
      currency: "UGX",
      amount: 50000,
      notification_id: momo.ipnId,
      callback_url: order.returnUrl,
      billing_address: { email_address: "donor@example.com" },
    });
    expect(JSON.stringify(body)).not.toMatch(/pin|otp/i);
    expect((submit[1].headers as Record<string, string>).Authorization).toBe(
      "Bearer synthetic.jwt.token",
    );
  });
  it("reuses the short-lived token", async () => {
    const fetchImpl = pesapal();
    const provider = createPesapalProvider(momo, fetchImpl as typeof fetch);
    await provider.fetchStatus(trackingId);
    await provider.fetchStatus(trackingId);
    const auths = fetchImpl.mock.calls.filter(([u]) =>
      String(u).endsWith("RequestToken"),
    );
    expect(auths).toHaveLength(1);
  });
  it("refuses non-UGX mobile-money orders", async () => {
    const provider = createPesapalProvider(momo, pesapal() as typeof fetch);
    expect(
      await provider.createCheckout({ ...order, currency: "USD" as never }),
    ).toEqual({
      kind: "permanent",
      code: "unsupported_currency",
    });
  });
  it.each([
    [0, "pending"],
    [1, "succeeded"],
    [2, "failed"],
    [3, "reversed"],
  ])("maps status_code %d to %s", async (code, state) => {
    const provider = createPesapalProvider(
      momo,
      pesapal({ status_code: code }) as typeof fetch,
    );
    expect(await provider.fetchStatus(trackingId)).toMatchObject({
      kind: "ok",
      status: {
        state,
        amountMinor: 50000,
        currency: "UGX",
        reference: "KCTF-D-BBBBBBBB",
      },
    });
  });
  it("treats an unknown status or an error object as not confirmed", async () => {
    const unknown = createPesapalProvider(
      momo,
      pesapal({ status_code: 9 }) as typeof fetch,
    );
    expect(await unknown.fetchStatus(trackingId)).toMatchObject({
      kind: "retryable",
    });
    const failed = createPesapalProvider(
      momo,
      pesapal({
        error: { code: "synthetic", error_type: "api_error" },
        status: "500",
      }) as typeof fetch,
    );
    expect(await failed.fetchStatus(trackingId)).toMatchObject({
      kind: "retryable",
    });
  });
});

describe("state machine rules", () => {
  it("never moves a confirmed donation back to an open or failed state", () => {
    for (const to of [
      "created",
      "pending",
      "failed",
      "cancelled",
      "expired",
    ] as const)
      expect(canTransition("succeeded", to)).toBe(false);
    expect(canTransition("succeeded", "reversed")).toBe(true);
    expect(canTransition("succeeded", "needs_review")).toBe(true);
  });
  it("accepts a verified success after failure, cancellation or expiry", () => {
    for (const from of [
      "created",
      "pending",
      "failed",
      "cancelled",
      "expired",
    ] as const)
      expect(canTransition(from, "succeeded")).toBe(true);
  });
  it("leaves reviewed and reversed donations to operators", () => {
    for (const to of Object.keys(
      ALLOWED_FROM,
    ) as (keyof typeof ALLOWED_FROM)[]) {
      expect(canTransition("needs_review", to)).toBe(false);
      if (to !== "needs_review")
        expect(canTransition("reversed", to)).toBe(false);
    }
  });
  const donation = {
    id: "d1",
    reference: "KCTF-D-AAAAAAAA",
    amountMinor: 5000,
    currency: "USD",
    mode: "test" as const,
    providerSessionId: "cs_test_SyntheticSession0001",
  };
  const verified = {
    state: "succeeded" as const,
    amountMinor: 5000,
    currency: "USD",
    reference: "KCTF-D-AAAAAAAA",
    donationId: "d1",
    sessionId: "cs_test_SyntheticSession0001",
    live: false,
  };
  it("flags any mismatch with the record", () => {
    expect(mismatch(donation, verified)).toBeUndefined();
    expect(mismatch(donation, { ...verified, amountMinor: 1 })).toBe(
      "amount_mismatch",
    );
    expect(mismatch(donation, { ...verified, currency: "EUR" })).toBe(
      "currency_mismatch",
    );
    expect(
      mismatch(donation, { ...verified, reference: "KCTF-D-ZZZZZZZZ" }),
    ).toBe("reference_mismatch");
    expect(mismatch(donation, { ...verified, donationId: "d2" })).toBe(
      "reference_mismatch",
    );
    expect(
      mismatch(donation, { ...verified, sessionId: "cs_test_Other000000001" }),
    ).toBe("session_mismatch");
    expect(mismatch(donation, { ...verified, live: true })).toBe(
      "mode_mismatch",
    );
    expect(mismatch(donation, { ...verified, amountMinor: undefined })).toBe(
      "amount_unverified",
    );
  });
});

describe("starting a donation: checks before any database access", () => {
  const getDb = vi.fn(() => {
    throw new Error("must not touch the database");
  });
  const deps = {
    siteOrigin: origin,
    readConfig: () => ({
      enabled: true,
      issues: [],
      config: paymentsTestConfig,
    }),
    getDb,
  };
  it("rejects other origins and formats", async () => {
    expect(
      (
        await startDonation(
          donationRequest(donationInput(), { origin: "https://evil.example" }),
          deps,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await startDonation(
          donationRequest(donationInput(), { "content-type": "text/plain" }),
          deps,
        )
      ).status,
    ).toBe(415);
    expect((await startDonation(donationRequest("{"), deps)).status).toBe(400);
    expect(
      (await startDonation(donationRequest("x".repeat(9000)), deps)).status,
    ).toBe(413);
  });
  it("rejects amounts outside the limits and tampered currencies", async () => {
    const small = await startDonation(
      donationRequest(donationInput({ amount: "1" })),
      deps,
    );
    expect(small.status).toBe(400);
    expect(small.body).toMatchObject({
      fields: { amount: [expect.any(String)] },
    });
    const decimals = await startDonation(
      donationRequest(
        donationInput({
          method: "mobile_money",
          currency: "UGX",
          amount: "50000.50",
        }),
      ),
      deps,
    );
    expect(decimals.status).toBe(400);
    const wrongCurrency = await startDonation(
      donationRequest(
        donationInput({ method: "mobile_money", currency: "USD" }),
      ),
      deps,
    );
    expect(wrongCurrency.body).toMatchObject({
      fields: { currency: [expect.any(String)] },
    });
    const notOffered = await startDonation(
      donationRequest(donationInput({ currency: "GBP" })),
      deps,
    );
    expect(notOffered.status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });
  it("says a method is unavailable when payments are off", async () => {
    const off = await startDonation(donationRequest(donationInput()), {
      ...deps,
      readConfig: () => ({ enabled: false, issues: [] }),
    });
    expect(off.status).toBe(503);
    expect(off.body.state).toBe("unavailable");
    expect(getDb).not.toHaveBeenCalled();
  });
});

describe("webhook and IPN checks before any database access", () => {
  const getDb = vi.fn(() => {
    throw new Error("must not touch the database");
  });
  const deps = {
    readConfig: () => ({
      enabled: true,
      issues: [],
      config: paymentsTestConfig,
    }),
    getDb,
  };
  const body = stripeEvent("checkout.session.completed", stripeSession());
  it("rejects bad signatures", async () => {
    const forged = await handleStripeWebhook(
      signedWebhook(body, "whsec_Forged0123456789"),
      deps,
    );
    expect(forged.status).toBe(400);
    const unsigned = await handleStripeWebhook(
      new Request(`${origin}/api/payments/stripe/webhook`, {
        method: "POST",
        body,
      }),
      deps,
    );
    expect(unsigned.status).toBe(400);
    const stale = await handleStripeWebhook(
      signedWebhook(body, webhookSecret, Math.floor(Date.now() / 1000) - 3600),
      deps,
    );
    expect(stale.status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });
  it("acknowledges irrelevant and wrong-mode events without acting", async () => {
    const other = stripeEvent("customer.created", { id: "cus_1" });
    expect(
      (await handleStripeWebhook(signedWebhook(other), deps)).body,
    ).toMatchObject({
      ignored: true,
    });
    const live = JSON.stringify({ ...JSON.parse(body), livemode: true });
    expect(
      (await handleStripeWebhook(signedWebhook(live), deps)).body,
    ).toMatchObject({
      ignored: true,
    });
    expect(getDb).not.toHaveBeenCalled();
  });
  it("is disabled when Stripe is not configured", async () => {
    const result = await handleStripeWebhook(signedWebhook(body), {
      ...deps,
      readConfig: () => ({ enabled: false, issues: [] }),
    });
    expect(result.status).toBe(503);
  });
  it("rejects malformed Pesapal notifications", async () => {
    const result = await handlePesapalIpn(
      new URLSearchParams({
        OrderTrackingId: "1; DROP TABLE",
        OrderMerchantReference: "KCTF-D-AAAAAAAA",
        OrderNotificationType: "IPNCHANGE",
      }),
      deps,
    );
    expect(result.status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });
});
