import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  db,
  delivery,
  draftDeps,
  enquiryInput,
  resetDatabase,
  submitDeps,
} from "./helpers";
import { request } from "../support/fixtures";
import {
  donationInput,
  donationRequest,
  paymentsTestConfig,
  providerDoubles,
  signedWebhook,
  stripeEvent,
} from "../support/payments";
import { submitEnquiry } from "@/server/enquiries/submit";
import { startDonation } from "@/server/payments/create";
import { handleStripeWebhook } from "@/server/payments/webhooks";
import {
  applyFinancialSnapshot,
  financialSelect,
  stripeFinancialClient,
} from "@/server/payments/financial";
import { recordPesapalRefund } from "@/server/payments/manual";
import { applyStatus } from "@/server/payments/state";
import { reconcileOpenDonations } from "@/server/payments/status";
import { processOutbox } from "@/server/outbox/worker";
import { ExecutionBudget } from "@/server/execution-budget";
import { backgroundStatus } from "@/server/workers/status";

beforeEach(resetDatabase);
afterEach(() => vi.restoreAllMocks());
afterAll(() => db.$disconnect());

async function paid(provider: "stripe" | "pesapal" = "stripe") {
  return db.donation.create({
    data: {
      reference: "KCTF-D-00000001",
      idempotencyKey: crypto.randomUUID(),
      requestHash: "a".repeat(64),
      accessTokenHash: "b".repeat(64),
      provider,
      method: provider === "stripe" ? "card" : "mobile_money",
      mode: "test",
      amountMinor: 5000,
      currency: provider === "stripe" ? "USD" : "UGX",
      status: "succeeded",
      collectedMinor: 5000,
      donorName: "Synthetic",
      donorEmail: "synthetic@example.com",
      privacyNoticeVersion: "synthetic",
      providerSessionId:
        provider === "stripe"
          ? "cs_test_ReadinessSession0001"
          : "11111111-2222-4333-8444-555555555555",
      providerPaymentId: provider === "stripe" ? "pi_Readiness1" : "PESAPAL1",
      createdAt: new Date(Date.now() - 3_600_000),
      settledAt: new Date(Date.now() - 1_800_000),
    },
  });
}
type Payment = Awaited<ReturnType<typeof paid>>;
function financialDouble(row: Payment) {
  const intent: Record<string, unknown> = {
    id: row.providerPaymentId,
    amount_received: row.amountMinor,
    currency: "usd",
    status: "succeeded",
    livemode: false,
    metadata: { donation_id: row.id, donation_reference: row.reference },
  };
  const refunds: Record<string, unknown>[] = [];
  const disputes: Record<string, unknown>[] = [];
  const adjustment = (id: string, amount: number, status: string) => ({
    id,
    amount,
    status,
    currency: "usd",
    payment_intent: row.providerPaymentId,
    created: 1700000000,
  });
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname === `/v1/payment_intents/${row.providerPaymentId}`)
      return Response.json(intent);
    for (const [kind, records] of [
      ["refunds", refunds],
      ["disputes", disputes],
    ] as const) {
      if (url.pathname === `/v1/${kind}`) {
        const start = url.searchParams.get("starting_after");
        const index = start
          ? records.findIndex((record) => record.id === start) + 1
          : 0;
        return Response.json({
          data: records.slice(index, index + 100),
          has_more: records.length > index + 100,
        });
      }
      const record = records.find(
        (record) => url.pathname === `/v1/${kind}/${record.id}`,
      );
      if (record) return Response.json(record);
    }
    if (url.pathname === "/v1/charges/ch_Readiness1")
      return Response.json({
        id: "ch_Readiness1",
        payment_intent: row.providerPaymentId,
      });
    if (url.pathname === `/v1/checkout/sessions/${row.providerSessionId}`)
      return Response.json({
        id: row.providerSessionId,
        status: "complete",
        payment_status: "paid",
        payment_intent: { id: row.providerPaymentId, status: "succeeded" },
        amount_total: row.amountMinor,
        currency: "usd",
        client_reference_id: row.id,
        metadata: { donation_reference: row.reference },
        livemode: false,
      });
    throw new Error(`Unexpected synthetic request ${url.pathname}`);
  });
  const deps = {
    getDb: () => db,
    readConfig: () => ({
      enabled: true,
      issues: [],
      config: paymentsTestConfig,
    }),
    fetchImpl: fetchImpl as typeof fetch,
  };
  return {
    intent,
    refunds,
    disputes,
    adjustment,
    fetchImpl,
    deps,
    event: (type: string, id: string, eventId?: string) =>
      handleStripeWebhook(
        signedWebhook(stripeEvent(type, { id }, eventId)),
        deps,
      ),
    snapshot: () =>
      stripeFinancialClient(
        paymentsTestConfig.methods.card!,
        fetchImpl as typeof fetch,
      ).snapshot(row.providerPaymentId!),
  };
}

describe("accepted quotas are protected from invalid traffic", () => {
  it("105 invalid bot attempts cannot consume the online global budget", async () => {
    const reject = vi.fn(async () => Response.json({ success: false }));
    for (let i = 0; i < 105; i++)
      expect(
        (
          await submitEnquiry(
            request(enquiryInput(1000 + i), {
              "x-real-ip": `192.0.2.${i + 1}`,
            }),
            submitDeps(reject),
          )
        ).status,
      ).toBe(400);
    expect(
      await db.rateLimitBucket.findFirst({ where: { key: "global" } }),
    ).toBeNull();
    expect(
      (
        await submitEnquiry(
          request(enquiryInput(1), { "x-real-ip": "198.51.100.1" }),
          submitDeps(),
        )
      ).status,
    ).toBe(201);
    expect(
      (await db.rateLimitBucket.findFirstOrThrow({ where: { key: "global" } }))
        .count,
    ).toBe(1);
  });
  it("caps verification calls despite rotating email addresses", async () => {
    const reject = vi.fn(async () => Response.json({ success: false }));
    const results = [];
    for (let i = 0; i < 21; i++)
      results.push(
        (
          await submitEnquiry(
            request(enquiryInput(i), { "x-real-ip": "192.0.2.1" }),
            submitDeps(reject),
          )
        ).status,
      );
    expect(results).toEqual([...Array(20).fill(400), 429]);
    expect(reject).toHaveBeenCalledTimes(20);
    expect(
      await db.rateLimitBucket.findFirst({ where: { key: "global" } }),
    ).toBeNull();
  });
  it("ignores spoofed forwarding headers when the proxy is untrusted", async () => {
    const reject = vi.fn(async () => Response.json({ success: false }));
    const deps = submitDeps(reject);
    const config = deps.readConfig();
    if (config.mode !== "online") throw new Error("test configuration");
    deps.readConfig = () => ({
      ...config,
      config: { ...config.config, trustedProxy: "none" },
    });
    for (let i = 0; i < 21; i++)
      await submitEnquiry(
        request(enquiryInput(i), {
          "x-real-ip": `192.0.2.${i}`,
          "x-forwarded-for": `198.51.100.${i}`,
        }),
        deps,
      );
    expect(reject).toHaveBeenCalledTimes(20);
  });
  it("does not consume accepted quotas on verification outages or idempotent replays", async () => {
    expect(
      (
        await submitEnquiry(
          request(enquiryInput(1)),
          submitDeps(
            vi.fn(async () => {
              throw new Error("outage");
            }),
          ),
        )
      ).status,
    ).toBe(503);
    expect(
      await db.rateLimitBucket.findFirst({ where: { key: "global" } }),
    ).toBeNull();
    const input = enquiryInput(2);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        submitEnquiry(request(input), submitDeps()),
      ),
    );
    expect(results.every((result) => result.body.state === "received")).toBe(
      true,
    );
    expect(await db.enquiry.count()).toBe(1);
    expect(
      (await db.rateLimitBucket.findFirstOrThrow({ where: { key: "global" } }))
        .count,
    ).toBe(1);
  });
  it("admits only one concurrent verified request into the last global slot", async () => {
    await db.$executeRaw`INSERT INTO rate_limit_buckets (key,window_start,count,expires_at) VALUES ('global',date_bin(interval '1 hour',now(),TIMESTAMPTZ '2000-01-01'),99,now()+interval '2 hours')`;
    const results = await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        submitEnquiry(
          request(enquiryInput(i), { "x-real-ip": `192.0.2.${i + 1}` }),
          submitDeps(),
        ),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 429, 429]);
    expect(await db.enquiry.count()).toBe(1);
    expect(
      (await db.rateLimitBucket.findFirstOrThrow({ where: { key: "global" } }))
        .count,
    ).toBe(100);
  });
  it("separates draft and online quotas", async () => {
    for (let i = 0; i < 4; i++)
      await submitEnquiry(
        request(
          enquiryInput(1, {
            channel: "email-draft",
            idempotencyKey: crypto.randomUUID(),
          }),
        ),
        draftDeps(),
      );
    expect(
      (await submitEnquiry(request(enquiryInput(1)), submitDeps())).status,
    ).toBe(201);
    expect(await db.enquiry.count()).toBe(4);
  });
  it("does not charge donation accepted quotas for rejected tokens", async () => {
    const fetchImpl = providerDoubles({
      turnstile: async () => Response.json({ success: false }),
    });
    const deps = {
      getDb: () => db,
      siteOrigin: paymentsTestConfig.siteOrigin,
      readConfig: () => ({
        enabled: true,
        issues: [],
        config: paymentsTestConfig,
      }),
      fetchImpl,
    };
    for (let i = 0; i < 10; i++)
      expect(
        (
          await startDonation(
            donationRequest(
              donationInput({ email: `invalid${i}@example.com` }),
            ),
            deps,
          )
        ).status,
      ).toBe(400);
    expect(await db.donation.count()).toBe(0);
    expect(
      await db.rateLimitBucket.findFirst({ where: { key: "pay-global" } }),
    ).toBeNull();
  });
});

describe("Stripe refund and dispute accounting", () => {
  it("rejects successful plus pending refunds above the original collection", async () => {
    const row = await paid();
    const api = financialDouble(row);
    api.refunds.push(
      api.adjustment("re_Done1", 3000, "succeeded"),
      api.adjustment("re_Pending1", 3000, "pending"),
    );
    expect((await api.event("charge.refunded", "ch_Readiness1")).status).toBe(
      503,
    );
    expect(await db.paymentAdjustment.count()).toBe(0);
  });
  it("handles a refund before checkout notification without ever creating receipt jobs", async () => {
    const row = await paid();
    const api = financialDouble(row);
    await db.donation.update({
      where: { id: row.id },
      data: {
        status: "pending",
        collectedMinor: 0,
        providerPaymentId: null,
        settledAt: null,
      },
    });
    api.refunds.push(api.adjustment("re_Early1", 1000, "succeeded"));
    expect((await api.event("refund.created", "re_Early1")).status).toBe(200);
    expect(
      (await api.event("checkout.session.completed", row.providerSessionId!))
        .status,
    ).toBe(200);
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      status: "succeeded",
      collectedMinor: 5000,
      refundedMinor: 1000,
      settledAt: expect.any(Date),
    });
    expect(await db.emailOutbox.count()).toBe(0);
  });
  it("keeps failed financial reads retryable and visible instead of recording a healthy event", async () => {
    const row = await paid();
    const api = financialDouble(row);
    api.intent.amount_received = "invalid";
    expect((await api.event("charge.refunded", "ch_Readiness1")).status).toBe(
      503,
    );
    expect(await db.paymentEvent.count()).toBe(0);
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      refundedMinor: 0,
      reconcileFailures: 1,
      lastReconcileError: "financial_invalid_intent",
    });
    api.intent.amount_received = 5000;
    api.refunds.push(api.adjustment("re_Recovered1", 1000, "succeeded"));
    expect(
      (
        await reconcileOpenDonations(db, paymentsTestConfig, {
          fetchImpl: api.fetchImpl,
        })
      ).failed,
    ).toBe(0);
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      refundedMinor: 1000,
      reconcileFailures: 0,
      lastReconcileError: null,
    });
  });
  it("refuses an incomplete aggregate when pagination exceeds its bounded recovery allowance", async () => {
    const row = await paid();
    const api = financialDouble(row);
    for (let i = 0; i < 501; i++)
      api.refunds.push(api.adjustment(`re_Bounded${i}`, 1, "succeeded"));
    expect((await api.event("charge.refunded", "ch_Readiness1")).status).toBe(
      503,
    );
    expect(await db.paymentAdjustment.count()).toBe(0);
    expect(await db.paymentEvent.count()).toBe(0);
    expect(
      (await db.donation.findUniqueOrThrow({ where: { id: row.id } }))
        .refundedMinor,
    ).toBe(0);
  });
  it("tracks partial then full refunds without losing collection history or queuing acknowledgements", async () => {
    const row = await paid();
    const api = financialDouble(row);
    api.refunds.push(api.adjustment("re_Part1", 1000, "succeeded"));
    expect((await api.event("refund.updated", "re_Part1")).status).toBe(200);
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      status: "succeeded",
      collectedMinor: 5000,
      refundedMinor: 1000,
      refundState: "partial",
      amountMinor: 5000,
      settledAt: row.settledAt,
    });
    api.refunds.push(api.adjustment("re_Part2", 4000, "succeeded"));
    await api.event("charge.refunded", "ch_Readiness1");
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      status: "succeeded",
      collectedMinor: 5000,
      refundedMinor: 5000,
      refundState: "full",
      settledAt: row.settledAt,
    });
    expect(await db.paymentAdjustment.count()).toBe(2);
    expect(await db.emailOutbox.count()).toBe(0);
  });
  it("deduplicates concurrent deliveries and reads current state for older events", async () => {
    const row = await paid();
    const api = financialDouble(row);
    api.refunds.push(api.adjustment("re_Full", 5000, "succeeded"));
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api.event("refund.updated", "re_Full", "evt_Duplicate1"),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    await api.event("refund.created", "re_Full", "evt_Older1");
    expect(await db.paymentEvent.count()).toBe(2);
    expect(await db.paymentAdjustment.count()).toBe(1);
    expect(
      (await db.donation.findUniqueOrThrow({ where: { id: row.id } }))
        .refundedMinor,
    ).toBe(5000);
    expect(await db.emailOutbox.count()).toBe(0);
  });
  it("keeps pending and failed refund observations without counting them as returned funds", async () => {
    const row = await paid();
    const api = financialDouble(row);
    api.refunds.push(api.adjustment("re_Changing", 1000, "pending"));
    await api.event("refund.created", "re_Changing");
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({ refundedMinor: 0, pendingRefundMinor: 1000 });
    api.refunds[0].status = "failed";
    await api.event("refund.failed", "re_Changing");
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({ refundedMinor: 0, pendingRefundMinor: 0 });
    expect(await db.paymentAdjustment.count()).toBe(2);
  });
  it("tracks disputes and a won resolution independently from refunds and receipts", async () => {
    const row = await paid();
    const api = financialDouble(row);
    api.disputes.push(api.adjustment("du_Readiness1", 5000, "needs_response"));
    await api.event("charge.dispute.created", "du_Readiness1");
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      collectedMinor: 5000,
      refundedMinor: 0,
      disputeState: "needs_response",
      disputedMinor: 5000,
    });
    api.disputes[0].status = "won";
    await api.event("charge.dispute.closed", "du_Readiness1");
    await api.event("charge.dispute.created", "du_Readiness1");
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({ disputeState: "won", disputedMinor: 0 });
    expect(await db.paymentAdjustment.count()).toBe(2);
    expect(await db.emailOutbox.count()).toBe(0);
  });
  it("retains a lost dispute as a distinct amount, not a refund", async () => {
    const row = await paid();
    const api = financialDouble(row);
    api.disputes.push(api.adjustment("du_Lost1", 5000, "lost"));
    await api.event("charge.dispute.closed", "du_Lost1");
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      status: "succeeded",
      collectedMinor: 5000,
      refundedMinor: 0,
      disputeState: "lost",
      disputedMinor: 5000,
    });
  });
  it("refuses to apply an older in-flight snapshot after a newer one committed", async () => {
    const row = await paid();
    const api = financialDouble(row);
    const before = await db.donation.findUniqueOrThrow({
      where: { id: row.id },
      select: financialSelect,
    });
    const old = await api.snapshot();
    api.refunds.push(api.adjustment("re_New1", 1000, "succeeded"));
    const current = await api.snapshot();
    await db.$transaction((tx) => applyFinancialSnapshot(tx, before, current));
    await expect(
      db.$transaction((tx) => applyFinancialSnapshot(tx, before, old)),
    ).rejects.toMatchObject({ code: "financial_snapshot_conflict" });
    expect(
      (await db.donation.findUniqueOrThrow({ where: { id: row.id } }))
        .refundedMinor,
    ).toBe(1000);
  });
  it("reconciles missed financial events and fences concurrent worker claims", async () => {
    const row = await paid();
    const api = financialDouble(row);
    api.refunds.push(api.adjustment("re_Missed1", 1000, "succeeded"));
    const runs = await Promise.all(
      Array.from({ length: 3 }, () =>
        reconcileOpenDonations(db, paymentsTestConfig, {
          fetchImpl: api.fetchImpl as typeof fetch,
        }),
      ),
    );
    expect(runs.reduce((n, r) => n + r.checked, 0)).toBe(1);
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({ refundedMinor: 1000, reconcileClaimToken: null });
    expect(await db.emailOutbox.count()).toBe(0);
  });
  it("recovers a stale reconciliation claim while respecting an active claim", async () => {
    const row = await paid();
    const api = financialDouble(row);
    const token = crypto.randomUUID();
    await db.donation.update({
      where: { id: row.id },
      data: {
        reconcileClaimToken: token,
        reconcileClaimedAt: new Date(),
      },
    });
    expect(
      (
        await reconcileOpenDonations(db, paymentsTestConfig, {
          fetchImpl: api.fetchImpl,
        })
      ).checked,
    ).toBe(0);
    expect(
      (await db.donation.findUniqueOrThrow({ where: { id: row.id } }))
        .reconcileClaimToken,
    ).toBe(token);
    await db.donation.update({
      where: { id: row.id },
      data: {
        reconcileClaimedAt: new Date(Date.now() - 180000),
      },
    });
    expect(
      (
        await reconcileOpenDonations(db, paymentsTestConfig, {
          fetchImpl: api.fetchImpl,
        })
      ).checked,
    ).toBe(1);
    expect(
      (await db.donation.findUniqueOrThrow({ where: { id: row.id } }))
        .reconcileClaimToken,
    ).toBeNull();
  });
  it("fetches every refund page, rather than applying a truncated total", async () => {
    const row = await paid();
    const api = financialDouble(row);
    for (let i = 0; i < 101; i++)
      api.refunds.push(api.adjustment(`re_Page${i}`, 1, "succeeded"));
    await api.event("charge.refunded", "ch_Readiness1");
    expect(
      (await db.donation.findUniqueOrThrow({ where: { id: row.id } }))
        .refundedMinor,
    ).toBe(101);
    expect(await db.paymentAdjustment.count()).toBe(101);
  });
  it("flags identity mismatches without changing money or sending receipts", async () => {
    const row = await paid();
    const api = financialDouble(row);
    api.intent.currency = "eur";
    await api.event("charge.refunded", "ch_Readiness1");
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      collectedMinor: 5000,
      refundedMinor: 0,
      financialReviewReason: "financial_identity_mismatch",
    });
    expect(await db.emailOutbox.count()).toBe(0);
  });
});

describe("Pesapal reversal and operator accounting", () => {
  it("serializes a confirmed refund identity across different donations and amounts", async () => {
    const first = await paid("pesapal");
    const { id: originalId, ...copy } = first;
    const second = await db.donation.create({
      data: {
        ...copy,
        reference: "KCTF-D-00000002",
        idempotencyKey: crypto.randomUUID(),
        accessTokenHash: "c".repeat(64),
        providerSessionId: "22222222-2222-4333-8444-555555555555",
        providerPaymentId: "PESAPAL2",
      },
    });
    const results = await Promise.allSettled(
      [first, second].map((row, i) =>
        recordPesapalRefund(
          db,
          {
            reference: row.reference,
            providerReference: "same-confirmed-refund",
            amountMinor: 1000 + i,
            mode: "test",
            operator: "synthetic",
            reason: "verified_refund",
          },
          true,
        ),
      ),
    );
    expect(second.id).not.toBe(originalId);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await db.paymentAdjustment.count()).toBe(1);
  });
  it("retains original settlement and records a verified reversal without another receipt", async () => {
    const row = await paid("pesapal");
    await applyStatus(db, row, {
      state: "reversed",
      amountMinor: 5000,
      currency: "UGX",
      reference: row.reference,
      sessionId: row.providerSessionId!,
      paymentId: "PESAPAL1",
    });
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      status: "reversed",
      collectedMinor: 5000,
      reversedMinor: 5000,
      settledAt: row.settledAt,
      financialReviewReason: "pesapal_reversal_review",
    });
    expect(await db.emailOutbox.count()).toBe(0);
    expect(await db.paymentAdjustment.count()).toBe(1);
  });
  it("records externally verified partial refunds as dry-run-first accounting only", async () => {
    const row = await paid("pesapal");
    const input = {
      reference: row.reference,
      providerReference: "confirmed-refund-1",
      amountMinor: 1000,
      mode: "test",
      operator: "synthetic_operator",
      reason: "provider_confirmed_refund",
    };
    expect(await recordPesapalRefund(db, input)).toMatchObject({
      dryRun: true,
    });
    expect(await db.paymentAdjustment.count()).toBe(0);
    await Promise.all([
      recordPesapalRefund(db, input, true),
      recordPesapalRefund(db, input, true),
    ]);
    expect(await db.paymentAdjustment.count()).toBe(1);
    expect(
      await db.donation.findUniqueOrThrow({ where: { id: row.id } }),
    ).toMatchObject({
      refundedMinor: 1000,
      refundState: "partial",
      collectedMinor: 5000,
    });
    await expect(
      recordPesapalRefund(
        db,
        { ...input, providerReference: "refund-too-large", amountMinor: 5000 },
        true,
      ),
    ).rejects.toThrow("exceeds_collection");
    expect(await db.emailOutbox.count()).toBe(0);
  });
});

describe("worker deadlines and visibility", () => {
  it.each(["partial", "full", "pending", "disputed"])(
    "does not send a stale receipt for a %s financial change",
    async (state) => {
      const row = await paid();
      await db.donation.update({
        where: { id: row.id },
        data: {
          refundedMinor:
            state === "partial" ? 1000 : state === "full" ? 5000 : 0,
          pendingRefundMinor: state === "pending" ? 1000 : 0,
          disputeState: state === "disputed" ? "needs_response" : "none",
        },
      });
      await db.emailOutbox.create({
        data: { donationId: row.id, kind: "donation-acknowledgement" },
      });
      const fetchImpl = vi.fn();
      expect(await processOutbox({ db, delivery, fetchImpl })).toMatchObject({
        sent: 0,
        failed: 1,
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );
  it("stops claiming before the deadline and leaves untouched jobs for the next run", async () => {
    for (let i = 0; i < 3; i++)
      await submitEnquiry(request(enquiryInput(i)), submitDeps());
    let now = 0;
    const budget = new ExecutionBudget(20_000, undefined, () => now);
    const result = await processOutbox(
      {
        db,
        delivery,
        fetchImpl: vi.fn(async () => {
          now = 10_000;
          return Response.json({ id: "synthetic" });
        }),
      },
      { batchSize: 3, budget },
    );
    expect(result).toMatchObject({ claimed: 1, sent: 1, partial: true });
    expect(
      await db.emailOutbox.count({
        where: { status: "pending", attempts: 0, claimToken: null },
      }),
    ).toBe(2);
  });
  it("does not perform DB work when the budget is already exhausted", async () => {
    let now = 0;
    const budget = new ExecutionBudget(20_000, undefined, () => now);
    now = 20_001;
    const query = vi.spyOn(db, "$queryRaw");
    expect(await processOutbox({ db, delivery }, { budget })).toMatchObject({
      claimed: 0,
      partial: true,
    });
    expect(query).not.toHaveBeenCalled();
  });
  it("email processing proceeds while a payment provider is timing out", async () => {
    await submitEnquiry(request(enquiryInput(1)), submitDeps());
    const row = await paid();
    await db.donation.update({
      where: { id: row.id },
      data: { status: "pending", providerPaymentId: null },
    });
    let paymentFinished = false;
    const hanging = vi.fn(async () => new Promise<Response>(() => {}));
    const paymentRun = reconcileOpenDonations(db, paymentsTestConfig, {
      fetchImpl: hanging,
      budget: new ExecutionBudget(20_000),
    }).finally(() => {
      paymentFinished = true;
    });
    const email = await processOutbox({
      db,
      delivery,
      fetchImpl: vi.fn(async () => Response.json({ id: "synthetic" })),
    });
    expect(email.sent).toBe(1);
    expect(paymentFinished).toBe(false);
    const payments = await paymentRun;
    expect(payments.failed).toBe(1);
    expect(
      (await db.donation.findUniqueOrThrow({ where: { id: row.id } }))
        .reconcileFailures,
    ).toBe(1);
  });
  it("exposes overdue work and failed reconciliation in authenticated status data without PII", async () => {
    await submitEnquiry(request(enquiryInput(1)), submitDeps());
    await db.$executeRaw`UPDATE email_outbox SET created_at = now() - interval '20 minutes'`;
    const row = await paid();
    await db.donation.update({
      where: { id: row.id },
      data: { reconcileFailures: 1, lastReconcileError: "provider_timeout" },
    });
    const status = await backgroundStatus(db);
    expect(status.alerts).toEqual(
      expect.arrayContaining([
        "oldest_pending_over_15m",
        "payment_reconciliation_failures",
        "worker_schedule_overdue",
      ]),
    );
    expect(status.reconciliationFailures).toBe(1);
    expect(JSON.stringify(status)).not.toContain("@example.com");
  });
});
