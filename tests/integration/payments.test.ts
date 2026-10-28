// Online donations against a real, disposable PostgreSQL database with local doubles for
// Turnstile, Stripe, Pesapal and Resend. These are MOCKED provider tests: no Stripe or
// Pesapal sandbox is contacted and no email is sent.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startDonation } from "@/server/payments/create";
import { accessTokenFor } from "@/server/payments/common";
import {
  cancelDonation,
  donationStatus,
  reconcileOpenDonations,
} from "@/server/payments/status";
import {
  handlePesapalIpn,
  handleStripeWebhook,
} from "@/server/payments/webhooks";
import { clearPesapalTokens } from "@/server/payments/pesapal";
import { processOutbox } from "@/server/outbox/worker";
import { submitEnquiry } from "@/server/enquiries/submit";
import { origin, request } from "../support/fixtures";
import {
  donationInput,
  donationRequest,
  paymentsTestConfig,
  providerDoubles,
  signedWebhook,
  stripeEvent,
} from "../support/payments";
import {
  db,
  delivery,
  enquiryInput,
  resetDatabase,
  submitDeps,
} from "./helpers";

beforeEach(async () => {
  await resetDatabase();
  clearPesapalTokens();
});
afterAll(() => db.$disconnect());

const secret = paymentsTestConfig.abuseHashSecret;

/** Stateful Stripe double: remembers created sessions; tests set their outcome. */
function fakeStripe() {
  const sessions = new Map<string, Record<string, unknown>>();
  const creates: { key: string | undefined; params: URLSearchParams }[] = [];
  let failNextCreate: "network" | 500 | 400 | undefined;
  let failRetrieve = false;
  const handler = vi.fn(async (url: URL, init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    if (url.pathname === "/v1/checkout/sessions" && init.method === "POST") {
      const params = new URLSearchParams(String(init.body));
      creates.push({ key: headers["Idempotency-Key"], params });
      if (failNextCreate) {
        const failure = failNextCreate;
        failNextCreate = undefined;
        if (failure === "network") throw new TypeError("fetch failed");
        return Response.json(
          { error: { code: "synthetic" } },
          { status: failure },
        );
      }
      // Idempotent like Stripe: the same key returns the same session.
      const existing = [...sessions.values()].find(
        (s) => s.__key === headers["Idempotency-Key"],
      );
      if (existing) return Response.json(existing);
      const id = `cs_test_Synthetic${String(sessions.size + 1).padStart(6, "0")}`;
      const session = {
        __key: headers["Idempotency-Key"],
        id,
        url: `https://checkout.stripe.com/c/pay/${id}`,
        status: "open",
        payment_status: "unpaid",
        amount_total: Number(
          params.get("line_items[0][price_data][unit_amount]"),
        ),
        currency: params.get("line_items[0][price_data][currency]"),
        client_reference_id: params.get("client_reference_id"),
        metadata: {
          donation_reference: params.get("metadata[donation_reference]"),
        },
        livemode: false,
        payment_intent: null,
      };
      sessions.set(id, session);
      return Response.json(session);
    }
    const match = url.pathname.match(
      /^\/v1\/checkout\/sessions\/([^/]+)(\/expire)?$/,
    );
    if (match) {
      if (failRetrieve) throw new TypeError("fetch failed");
      const session = sessions.get(match[1]);
      if (!session)
        return Response.json(
          { error: { code: "resource_missing" } },
          { status: 404 },
        );
      if (match[2]) {
        if (session.status !== "open")
          return Response.json(
            { error: { code: "checkout_session_not_open" } },
            { status: 400 },
          );
        session.status = "expired";
      }
      return Response.json(session);
    }
    throw new Error(`Unexpected Stripe call ${url.pathname}`);
  });
  return {
    handler,
    sessions,
    creates,
    failCreate: (f: "network" | 500 | 400) => (failNextCreate = f),
    failRetrieve: (v: boolean) => (failRetrieve = v),
    pay(id: string, extra: Record<string, unknown> = {}) {
      Object.assign(sessions.get(id)!, {
        status: "complete",
        payment_status: "paid",
        payment_intent: { id: `pi_${id.slice(-6)}`, status: "succeeded" },
        ...extra,
      });
    },
    retrieveCalls: () =>
      handler.mock.calls.filter(
        ([u, i]) =>
          (i as RequestInit).method === "GET" || String(u).includes("/expire"),
      ).length,
  };
}

/** Stateful Pesapal double. */
function fakePesapal() {
  const orders = new Map<string, Record<string, unknown>>();
  let failStatus = false;
  const handler = vi.fn(async (url: URL, init: RequestInit) => {
    if (url.pathname.endsWith("/Auth/RequestToken"))
      return Response.json({
        token: "synthetic.jwt",
        expiryDate: new Date(Date.now() + 300_000).toISOString(),
        error: null,
        status: "200",
      });
    if (url.pathname.endsWith("/Transactions/SubmitOrderRequest")) {
      const body = JSON.parse(String(init.body));
      const trackingId = crypto.randomUUID();
      orders.set(trackingId, {
        merchant_reference: body.id,
        amount: body.amount,
        currency: body.currency,
        status_code: 0,
        payment_status_description: "INVALID",
      });
      return Response.json({
        order_tracking_id: trackingId,
        merchant_reference: body.id,
        redirect_url: `https://cybqa.pesapal.com/pesapaliframe/PesapalIframe3/Index/?OrderTrackingId=${trackingId}`,
        error: null,
        status: "200",
      });
    }
    if (url.pathname.endsWith("/Transactions/GetTransactionStatus")) {
      if (failStatus)
        throw Object.assign(new Error("t"), { name: "TimeoutError" });
      const order = orders.get(url.searchParams.get("orderTrackingId")!);
      if (!order)
        return Response.json({ error: { code: "not_found" }, status: "404" });
      return Response.json({
        payment_method: "MTN",
        confirmation_code: "SYNTHCONF1",
        error: null,
        status: "200",
        ...order,
      });
    }
    throw new Error(`Unexpected Pesapal call ${url.pathname}`);
  });
  return {
    handler,
    orders,
    set(trackingId: string, fields: Record<string, unknown>) {
      Object.assign(orders.get(trackingId)!, fields);
    },
    failStatus: (v: boolean) => (failStatus = v),
  };
}

function setup() {
  const stripe = fakeStripe();
  const pesapal = fakePesapal();
  const fetchImpl = providerDoubles({
    stripe: stripe.handler,
    pesapal: pesapal.handler,
  }) as unknown as typeof fetch;
  const readConfig = () => ({
    enabled: true,
    issues: [],
    config: paymentsTestConfig,
  });
  const deps = { siteOrigin: origin, readConfig, getDb: () => db, fetchImpl };
  return { stripe, pesapal, fetchImpl, deps };
}

async function start(
  deps: ReturnType<typeof setup>["deps"],
  overrides: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) {
  const input = donationInput(overrides);
  const result = await startDonation(donationRequest(input, headers), deps);
  return { input, result };
}

const donations = () => db.donation.findMany({ orderBy: { createdAt: "asc" } });
const jobs = () =>
  db.emailOutbox.findMany({ where: { donationId: { not: null } } });

describe("starting a card donation", () => {
  it("records the attempt, then returns Stripe's hosted checkout", async () => {
    const { deps, stripe } = setup();
    const { result } = await start(deps);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      state: "redirect",
      checkoutUrl: expect.stringMatching(/^https:\/\/checkout\.stripe\.com\//),
      statusUrl: expect.stringMatching(
        /^\/donate\/give\/status\?token=[\w-]{43}$/,
      ),
    });
    const [row] = await donations();
    expect(row).toMatchObject({
      status: "pending",
      provider: "stripe",
      method: "card",
      mode: "test",
      amountMinor: 5000,
      currency: "USD",
      providerSessionId: "cs_test_Synthetic000001",
    });
    // The status token is stored only as a digest.
    expect(JSON.stringify(row)).not.toContain(accessTokenFor(row.id, secret));
    const { params, key } = stripe.creates[0];
    expect(key).toBe(`kctf-donation-${row.id}`);
    expect(params.get("line_items[0][price_data][unit_amount]")).toBe("5000");
    expect(params.get("client_reference_id")).toBe(row.id);
  });

  it("replays a retried request without a second donation or session", async () => {
    const { deps, stripe } = setup();
    const { input, result } = await start(deps);
    const again = await startDonation(donationRequest(input), deps);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(result.body);
    expect(await donations()).toHaveLength(1);
    expect(stripe.creates).toHaveLength(1);
  });

  it("refuses to reuse a key for a different amount", async () => {
    const { deps } = setup();
    const { input } = await start(deps);
    const changed = await startDonation(
      donationRequest({ ...input, amount: "75" }),
      deps,
    );
    expect(changed.status).toBe(409);
    expect(await donations()).toHaveLength(1);
  });

  it("recovers an uncertain provider call with the same Stripe idempotency key", async () => {
    const { deps, stripe } = setup();
    stripe.failCreate("network");
    const { input, result } = await start(deps);
    expect(result.status).toBe(503);
    expect(result.body.state).toBe("unconfirmed");
    expect((await donations())[0].status).toBe("created");
    const retry = await startDonation(donationRequest(input), deps);
    expect(retry.status).toBe(201);
    expect(stripe.creates.map((c) => c.key)).toEqual([
      stripe.creates[0].key,
      stripe.creates[0].key,
    ]);
    expect(await donations()).toHaveLength(1);
  });

  it("marks a refused checkout as failed and says nothing was charged", async () => {
    const { deps, stripe } = setup();
    stripe.failCreate(400);
    const { result } = await start(deps);
    expect(result.status).toBe(502);
    expect(result.body).toMatchObject({ state: "unavailable" });
    expect((await donations())[0]).toMatchObject({
      status: "failed",
      statusReason: "synthetic",
    });
    expect(await jobs()).toHaveLength(0);
  });

  it("saves nothing when Turnstile rejects the request", async () => {
    const { deps } = setup();
    const fetchImpl = providerDoubles({
      turnstile: () => Response.json({ success: false }),
    }) as unknown as typeof fetch;
    const { result } = await start({ ...deps, fetchImpl });
    expect(result.status).toBe(400);
    expect(await donations()).toHaveLength(0);
  });

  it("applies donation rate limits separately from enquiry limits", async () => {
    const { deps } = setup();
    const statuses = [];
    for (let i = 0; i < 7; i++)
      statuses.push((await start(deps)).result.status);
    expect(statuses.slice(0, 6)).toEqual([201, 201, 201, 201, 201, 201]);
    expect(statuses[6]).toBe(429);
    // Enquiries from the same address are unaffected.
    const enquiry = await submitEnquiry(
      request(enquiryInput(1, { email: "donor@example.com" })),
      submitDeps(),
    );
    expect(enquiry.status).toBe(201);
  });
});

describe("Stripe webhooks", () => {
  async function paidDonation() {
    const ctx = setup();
    await start(ctx.deps);
    const [row] = await donations();
    return { ...ctx, row, sessionId: row.providerSessionId! };
  }
  const webhook = (deps: ReturnType<typeof setup>["deps"], body: string) =>
    handleStripeWebhook(signedWebhook(body), deps);

  it("confirms a payment only after re-reading the session from Stripe", async () => {
    const { deps, stripe, row, sessionId } = await paidDonation();
    // The event claims payment, but Stripe's API still says open: nothing changes.
    const claim = stripeEvent("checkout.session.completed", {
      id: sessionId,
      status: "complete",
      payment_status: "paid",
    });
    expect((await webhook(deps, claim)).status).toBe(200);
    expect(
      (await db.donation.findUnique({ where: { id: row.id } }))!.status,
    ).toBe("pending");
    expect(await jobs()).toHaveLength(0);

    stripe.pay(sessionId);
    const event = stripeEvent("checkout.session.completed", { id: sessionId });
    expect((await webhook(deps, event)).status).toBe(200);
    const done = await db.donation.findUnique({ where: { id: row.id } });
    expect(done).toMatchObject({
      status: "succeeded",
      providerPaymentId: expect.stringMatching(/^pi_/),
    });
    expect(done!.settledAt).toBeInstanceOf(Date);
    expect((await jobs()).map((j) => j.kind).sort()).toEqual([
      "donation-acknowledgement",
      "donation-staff-notification",
    ]);
    const events = await db.paymentEvent.findMany();
    expect(events.map((e) => e.outcome).sort()).toEqual([
      "no_change",
      "succeeded",
    ]);
  });

  it("ignores a redelivered event and queues notifications once", async () => {
    const { deps, stripe, sessionId } = await paidDonation();
    stripe.pay(sessionId);
    const event = stripeEvent("checkout.session.completed", { id: sessionId });
    await webhook(deps, event);
    const again = await webhook(deps, event);
    expect(again.body).toMatchObject({ duplicate: true });
    await webhook(
      deps,
      stripeEvent("checkout.session.async_payment_succeeded", {
        id: sessionId,
      }),
    );
    expect(await jobs()).toHaveLength(2);
  });

  it("handles concurrent deliveries without duplicate notifications", async () => {
    const { deps, stripe, sessionId } = await paidDonation();
    stripe.pay(sessionId);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        webhook(
          deps,
          stripeEvent("checkout.session.completed", { id: sessionId }),
        ),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await jobs()).toHaveLength(2);
  });

  it("never lets a later expiry or failure undo a confirmed payment", async () => {
    const { deps, stripe, row, sessionId } = await paidDonation();
    stripe.pay(sessionId);
    await webhook(
      deps,
      stripeEvent("checkout.session.completed", { id: sessionId }),
    );
    // Out of order / contradictory: Stripe now reports expired, then a failed intent.
    Object.assign(stripe.sessions.get(sessionId)!, {
      status: "expired",
      payment_status: "unpaid",
    });
    await webhook(
      deps,
      stripeEvent("checkout.session.expired", { id: sessionId }),
    );
    Object.assign(stripe.sessions.get(sessionId)!, {
      status: "complete",
      payment_status: "unpaid",
      payment_intent: { id: "pi_x", status: "requires_payment_method" },
    });
    await webhook(
      deps,
      stripeEvent("checkout.session.async_payment_failed", { id: sessionId }),
    );
    expect(
      (await db.donation.findUnique({ where: { id: row.id } }))!.status,
    ).toBe("succeeded");
    expect(await jobs()).toHaveLength(2);
  });

  it("accepts a verified success that arrives after an expiry", async () => {
    const { deps, stripe, row, sessionId } = await paidDonation();
    Object.assign(stripe.sessions.get(sessionId)!, { status: "expired" });
    await webhook(
      deps,
      stripeEvent("checkout.session.expired", { id: sessionId }),
    );
    expect(
      (await db.donation.findUnique({ where: { id: row.id } }))!.status,
    ).toBe("expired");
    stripe.pay(sessionId);
    await webhook(
      deps,
      stripeEvent("checkout.session.completed", { id: sessionId }),
    );
    expect(
      (await db.donation.findUnique({ where: { id: row.id } }))!.status,
    ).toBe("succeeded");
  });

  it.each([
    ["amount", { amount_total: 100 }, "amount_mismatch"],
    ["currency", { currency: "eur" }, "currency_mismatch"],
    [
      "reference",
      { metadata: { donation_reference: "KCTF-D-TAMPERED" } },
      "reference_mismatch",
    ],
    [
      "donation id",
      { client_reference_id: "0194f9a0-0000-7000-8000-00000000dead" },
      "reference_mismatch",
    ],
    ["mode", { livemode: true }, "mode_mismatch"],
  ])(
    "flags a %s mismatch for review and sends nothing",
    async (_, fields, reason) => {
      const { deps, stripe, row, sessionId } = await paidDonation();
      stripe.pay(sessionId, fields);
      await webhook(
        deps,
        stripeEvent("checkout.session.completed", { id: sessionId }),
      );
      expect(
        await db.donation.findUnique({ where: { id: row.id } }),
      ).toMatchObject({
        status: "needs_review",
        statusReason: reason,
      });
      expect(await jobs()).toHaveLength(0);
    },
  );

  it("marks a failed delayed payment as failed", async () => {
    const { deps, stripe, row, sessionId } = await paidDonation();
    Object.assign(stripe.sessions.get(sessionId)!, {
      status: "complete",
      payment_status: "unpaid",
      payment_intent: { id: "pi_y", status: "requires_payment_method" },
    });
    await webhook(
      deps,
      stripeEvent("checkout.session.async_payment_failed", { id: sessionId }),
    );
    expect(
      (await db.donation.findUnique({ where: { id: row.id } }))!.status,
    ).toBe("failed");
    expect(await jobs()).toHaveLength(0);
  });

  it("asks Stripe to retry when the session cannot be read, without recording the event", async () => {
    const { deps, stripe, sessionId } = await paidDonation();
    stripe.pay(sessionId);
    stripe.failRetrieve(true);
    const event = stripeEvent("checkout.session.completed", { id: sessionId });
    expect((await webhook(deps, event)).status).toBe(503);
    expect(await db.paymentEvent.count()).toBe(0);
    stripe.failRetrieve(false);
    expect((await webhook(deps, event)).status).toBe(200);
    expect(await jobs()).toHaveLength(2);
  });

  it("records unknown sessions without touching donations", async () => {
    const { deps } = setup();
    const result = await webhook(
      deps,
      stripeEvent("checkout.session.completed", {
        id: "cs_test_Unknown0000001",
      }),
    );
    expect(result.status).toBe(200);
    expect(await db.paymentEvent.findMany()).toMatchObject([
      { outcome: "unmatched" },
    ]);
  });

  it("rejects a forged event before touching the database", async () => {
    const { deps, sessionId, row } = await paidDonation();
    const body = stripeEvent("checkout.session.completed", { id: sessionId });
    const forged = await handleStripeWebhook(
      signedWebhook(body, "whsec_AttackerSecret0123"),
      deps,
    );
    expect(forged.status).toBe(400);
    expect(await db.paymentEvent.count()).toBe(0);
    expect(
      (await db.donation.findUnique({ where: { id: row.id } }))!.status,
    ).toBe("pending");
  });
});

describe("public status, cancellation and reconciliation", () => {
  it("shows status by token only, without donor details, and confirms with Stripe", async () => {
    const { deps, stripe } = setup();
    const { result } = await start(deps, { message: "Private note" });
    const statusUrl = new URL(
      (result.body as { statusUrl: string }).statusUrl,
      origin,
    );
    const [row] = await donations();
    stripe.pay(row.providerSessionId!);
    const { status, body } = await donationStatus(statusUrl, deps);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      status: "succeeded",
      amountMinor: 5000,
      currency: "USD",
      test: true,
    });
    const text = JSON.stringify(body);
    for (const secretValue of [
      "Synthetic Donor",
      "donor@example.com",
      "Private note",
      row.id,
    ])
      expect(text).not.toContain(secretValue);
    expect(await jobs()).toHaveLength(2);
  });

  it("returns 404 for unknown or malformed tokens", async () => {
    const { deps } = setup();
    await start(deps);
    for (const token of ["x", "A".repeat(43), ""])
      expect(
        (
          await donationStatus(
            new URL(`${origin}/api/donations/status?token=${token}`),
            deps,
          )
        ).status,
      ).toBe(404);
  });

  it("throttles provider checks from polling", async () => {
    const { deps, stripe } = setup();
    const { result } = await start(deps);
    const statusUrl = new URL(
      (result.body as { statusUrl: string }).statusUrl,
      origin,
    );
    await donationStatus(statusUrl, deps);
    await donationStatus(statusUrl, deps);
    await donationStatus(statusUrl, deps);
    expect(stripe.retrieveCalls()).toBe(1);
  });

  it("cancels an open Stripe checkout so it can no longer be paid", async () => {
    const { deps, stripe } = setup();
    const { result } = await start(deps);
    const token = new URL(
      (result.body as { statusUrl: string }).statusUrl,
      origin,
    ).searchParams.get("token");
    const cancel = await cancelDonation(
      new Request(`${origin}/api/donations/cancel`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
      deps,
    );
    expect(cancel.body).toMatchObject({ status: "cancelled" });
    const [row] = await donations();
    expect(stripe.sessions.get(row.providerSessionId!)!.status).toBe("expired");
  });

  it("will not cancel a donation that Stripe says is paid", async () => {
    const { deps, stripe } = setup();
    const { result } = await start(deps);
    const token = new URL(
      (result.body as { statusUrl: string }).statusUrl,
      origin,
    ).searchParams.get("token");
    const [row] = await donations();
    stripe.pay(row.providerSessionId!);
    const cancel = await cancelDonation(
      new Request(`${origin}/api/donations/cancel`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
      deps,
    );
    expect(cancel.body).toMatchObject({ status: "succeeded" });
  });

  it("reconciles missed webhooks and closes attempts that never reached a checkout", async () => {
    const { deps, stripe } = setup();
    await start(deps);
    stripe.failCreate("network");
    await start(deps);
    const [paid, orphan] = await donations();
    stripe.pay(paid.providerSessionId!);
    await db.$executeRawUnsafe(
      "UPDATE donations SET created_at = now() - interval '1 hour'",
    );
    const summary = await reconcileOpenDonations(db, paymentsTestConfig, {
      fetchImpl: deps.fetchImpl,
    });
    expect(summary).toMatchObject({ checked: 2, reconciled: 1, closed: 1 });
    expect(
      (await db.donation.findUnique({ where: { id: paid.id } }))!.status,
    ).toBe("succeeded");
    expect(
      await db.donation.findUnique({ where: { id: orphan.id } }),
    ).toMatchObject({
      status: "expired",
      statusReason: "checkout_not_created",
    });
  });
});

describe("Mobile Money through Pesapal", () => {
  async function momo() {
    const ctx = setup();
    const { result } = await start(ctx.deps, {
      method: "mobile_money",
      currency: "UGX",
      amount: "50,000",
    });
    const [row] = await donations();
    return { ...ctx, result, row, trackingId: row.providerSessionId! };
  }
  const ipn = (
    deps: ReturnType<typeof setup>["deps"],
    trackingId: string,
    reference: string,
  ) =>
    handlePesapalIpn(
      new URLSearchParams({
        OrderTrackingId: trackingId,
        OrderMerchantReference: reference,
        OrderNotificationType: "IPNCHANGE",
      }),
      deps,
    );

  it("starts a hosted Pesapal order in UGX", async () => {
    const { result, row } = await momo();
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      checkoutUrl: expect.stringMatching(/^https:\/\/cybqa\.pesapal\.com\//),
    });
    expect(row).toMatchObject({
      provider: "pesapal",
      method: "mobile_money",
      currency: "UGX",
      amountMinor: 50000,
      status: "pending",
    });
  });

  it("treats the IPN as a prompt and confirms through GetTransactionStatus", async () => {
    const { deps, pesapal, row, trackingId } = await momo();
    // Still unpaid (status 0): stays pending while the donor approves on their phone.
    const first = await ipn(deps, trackingId, row.reference);
    expect(first.body).toMatchObject({
      status: 200,
      orderTrackingId: trackingId,
    });
    expect(
      (await db.donation.findUnique({ where: { id: row.id } }))!.status,
    ).toBe("pending");
    pesapal.set(trackingId, {
      status_code: 1,
      payment_status_description: "COMPLETED",
    });
    await db.donation.update({
      where: { id: row.id },
      data: { lastCheckedAt: null },
    });
    await ipn(deps, trackingId, row.reference);
    expect(
      await db.donation.findUnique({ where: { id: row.id } }),
    ).toMatchObject({
      status: "succeeded",
      providerPaymentId: "SYNTHCONF1",
    });
    expect(await jobs()).toHaveLength(2);
  });

  it("acknowledges but ignores notifications for unknown orders or wrong references", async () => {
    const { deps, pesapal, row, trackingId } = await momo();
    pesapal.set(trackingId, { status_code: 1 });
    const wrong = await ipn(deps, trackingId, "KCTF-D-ZZZZZZZZ");
    expect(wrong.body).toMatchObject({ status: 200 });
    expect(
      (await db.donation.findUnique({ where: { id: row.id } }))!.status,
    ).toBe("pending");
    expect(await jobs()).toHaveLength(0);
  });

  it("records failure, and a later verified payment still wins", async () => {
    const { deps, pesapal, row, trackingId } = await momo();
    pesapal.set(trackingId, {
      status_code: 2,
      payment_status_description: "FAILED",
    });
    await ipn(deps, trackingId, row.reference);
    expect(
      (await db.donation.findUnique({ where: { id: row.id } }))!.status,
    ).toBe("failed");
    pesapal.set(trackingId, { status_code: 1 });
    await db.donation.update({
      where: { id: row.id },
      data: { lastCheckedAt: null },
    });
    await ipn(deps, trackingId, row.reference);
    expect(
      (await db.donation.findUnique({ where: { id: row.id } }))!.status,
    ).toBe("succeeded");
  });

  it("flags an amount Pesapal reports differently", async () => {
    const { deps, pesapal, row, trackingId } = await momo();
    pesapal.set(trackingId, { status_code: 1, amount: 500 });
    await ipn(deps, trackingId, row.reference);
    expect(
      await db.donation.findUnique({ where: { id: row.id } }),
    ).toMatchObject({
      status: "needs_review",
      statusReason: "amount_mismatch",
    });
    expect(await jobs()).toHaveLength(0);
  });

  it("asks Pesapal to retry when the status check times out, then reconciles", async () => {
    const { deps, pesapal, row, trackingId } = await momo();
    pesapal.failStatus(true);
    const result = await ipn(deps, trackingId, row.reference);
    expect(result.body).toMatchObject({ status: 500 });
    expect(
      (await db.donation.findUnique({ where: { id: row.id } }))!.status,
    ).toBe("pending");
    pesapal.failStatus(false);
    pesapal.set(trackingId, { status_code: 1 });
    await db.$executeRawUnsafe(
      "UPDATE donations SET created_at = now() - interval '1 hour', last_checked_at = NULL",
    );
    await reconcileOpenDonations(db, paymentsTestConfig, {
      fetchImpl: deps.fetchImpl,
    });
    expect(
      (await db.donation.findUnique({ where: { id: row.id } }))!.status,
    ).toBe("succeeded");
  });

  it("closes orders still unpaid after two days", async () => {
    const { deps, row } = await momo();
    await db.$executeRawUnsafe(
      "UPDATE donations SET created_at = now() - interval '3 days'",
    );
    await reconcileOpenDonations(db, paymentsTestConfig, {
      fetchImpl: deps.fetchImpl,
    });
    expect(
      await db.donation.findUnique({ where: { id: row.id } }),
    ).toMatchObject({
      status: "expired",
      statusReason: "not_completed",
    });
  });
});

describe("donation notifications", () => {
  it("emails staff and the donor only for a confirmed donation", async () => {
    const { deps, stripe } = setup();
    await start(deps, { message: "<b>For the lions</b>" });
    const [row] = await donations();
    stripe.pay(row.providerSessionId!);
    await handleStripeWebhook(
      signedWebhook(
        stripeEvent("checkout.session.completed", {
          id: row.providerSessionId,
        }),
      ),
      deps,
    );
    const resend = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => Response.json({ id: `msg_${crypto.randomUUID()}` }),
    );
    const summary = await processOutbox({
      db,
      delivery,
      fetchImpl: resend as unknown as typeof fetch,
    });
    expect(summary).toMatchObject({ claimed: 2, sent: 2 });
    const payloads = resend.mock.calls.map(
      ([, init]) => JSON.parse(String(init.body)) as Record<string, unknown>,
    );
    const staff = payloads.find((p) =>
      (p.to as string[]).includes("staff@kctf.example"),
    )!;
    const donor = payloads.find((p) =>
      (p.to as string[]).includes("donor@example.com"),
    )!;
    expect(staff.subject).toMatch(
      /^\[TEST\] KCTF donation confirmed: USD 50\.00/,
    );
    expect(staff.reply_to).toBe("donor@example.com");
    expect(String(staff.html)).toContain("&lt;b&gt;For the lions&lt;/b&gt;");
    expect(donor.text).toMatch(/not a tax receipt/);
    expect(donor.text).toMatch(/TEST MODE/);
  });

  it("refuses to send a donation job whose donation is not confirmed", async () => {
    const { deps } = setup();
    await start(deps);
    const [row] = await donations();
    await db.emailOutbox.create({
      data: { donationId: row.id, kind: "donation-staff-notification" },
    });
    const resend = vi.fn();
    await processOutbox({
      db,
      delivery,
      fetchImpl: resend as unknown as typeof fetch,
    });
    expect(resend).not.toHaveBeenCalled();
    expect((await jobs())[0]).toMatchObject({
      status: "failed",
      lastError: "donation_not_succeeded",
    });
  });

  it("requires every outbox job to belong to exactly one record", async () => {
    await expect(
      db.$executeRawUnsafe(
        "INSERT INTO email_outbox (id, kind) VALUES (gen_random_uuid(), 'x')",
      ),
    ).rejects.toThrow();
  });
});

describe("donation enquiries stay separate", () => {
  it("never creates a donation record or payment job", async () => {
    const result = await submitEnquiry(
      request(enquiryInput(7, { topic: "donation" })),
      submitDeps(),
    );
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      message: expect.stringMatching(/No payment has been made or taken/),
    });
    expect(await db.donation.count()).toBe(0);
    expect(await jobs()).toHaveLength(0);
  });
});
