import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { describe, expect, it, vi } from "vitest";
import { readLimitedBytes } from "@/server/http/body";
import {
  parsePesapalBody,
  handleStripeWebhook,
  MAX_WEBHOOK_BYTES,
} from "@/server/payments/webhooks";
import {
  verifyStripeSignature,
  signStripePayload,
} from "@/server/payments/stripe";
import {
  ExecutionBudget,
  abortable,
  fetchJson,
} from "@/server/execution-budget";
import {
  createPesapalProvider,
  clearPesapalTokens,
} from "@/server/payments/pesapal";
import { workerOutcome } from "@/server/workers/run";
import { paymentsTestConfig, webhookSecret } from "../support/payments";
import { abuseKey } from "@/server/enquiries/abuse";

function streamed(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  const cancelled = vi.fn();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(chunks[index++]);
      else controller.close();
    },
    cancel: cancelled,
  });
  return {
    request: new Request("https://kctf.example/hook", {
      method: "POST",
      headers,
      body,
      duplex: "half",
    } as RequestInit),
    cancelled,
  };
}

describe("streamed webhook bodies", () => {
  it("keeps a stalled provider response body inside its request timeout", async () => {
    const fetchImpl = vi.fn(
      async () =>
        ({
          ok: true,
          json: () => new Promise(() => {}),
        }) as Response,
    );
    await expect(
      fetchJson(fetchImpl, "https://provider.invalid", {}, 20),
    ).rejects.toThrow();
    expect(fetchImpl.mock.calls).toHaveLength(1);
  });
  it("cancels a stalled stream when its shared deadline expires", async () => {
    const cancel = vi.fn();
    const request = new Request("https://kctf.example/hook", {
      method: "POST",
      duplex: "half",
      body: new ReadableStream({ pull: () => new Promise(() => {}), cancel }),
    } as RequestInit);
    await expect(
      readLimitedBytes(request, 1024, AbortSignal.timeout(20)),
    ).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it.each(["null", "[]", "false"])(
    "rejects signed non-object JSON %s",
    async (raw) => {
      const request = streamed([new TextEncoder().encode(raw)], {
        "stripe-signature": signStripePayload(raw, webhookSecret),
      }).request;
      const response = await handleStripeWebhook(request, {
        getDb: vi.fn(),
        readConfig: () => ({
          enabled: true,
          issues: [],
          config: paymentsTestConfig,
        }),
      });
      expect(response.status).toBe(400);
    },
  );
  it.each([{}, { "content-length": "1" }])(
    "cancels oversized streams without trusting length %j",
    async (headers) => {
      const { request, cancelled } = streamed(
        [new Uint8Array(8), new Uint8Array(33), new Uint8Array(1024)],
        headers as Record<string, string>,
      );
      expect(await readLimitedBytes(request, 32)).toEqual({ tooLarge: true });
      expect(cancelled).toHaveBeenCalledOnce();
    },
  );
  it("cancels a declared oversized body before reading it", async () => {
    const { request, cancelled } = streamed([new Uint8Array(1)], {
      "content-length": "999",
    });
    expect(await readLimitedBytes(request, 10)).toEqual({ tooLarge: true });
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it("verifies exact non-ASCII and BOM bytes instead of normalised text", () => {
    const raw = '\uFEFF{ "name": "é 🌿" }';
    const bytes = new TextEncoder().encode(raw);
    const signature = signStripePayload(raw, webhookSecret);
    expect(verifyStripeSignature(bytes, signature, webhookSecret)).toEqual({
      ok: true,
    });
    expect(
      verifyStripeSignature(bytes.slice(3), signature, webhookSecret).ok,
    ).toBe(false);
  });
  it("rejects signed malformed UTF-8 before database access", async () => {
    const bytes = new Uint8Array([0x7b, 0xff, 0x7d]);
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = createHmac("sha256", webhookSecret)
      .update(`${timestamp}.`)
      .update(bytes)
      .digest("hex");
    const request = streamed([bytes], {
      "stripe-signature": `t=${timestamp},v1=${digest}`,
    }).request;
    const getDb = vi.fn(() => {
      throw new Error("No database access allowed");
    });
    const response = await handleStripeWebhook(request, {
      getDb,
      readConfig: () => ({
        enabled: true,
        issues: [],
        config: paymentsTestConfig,
      }),
    });
    expect(response).toMatchObject({
      status: 400,
      body: { error: "invalid_json" },
    });
    expect(getDb).not.toHaveBeenCalled();
  });
  it("cancels an oversized Stripe body before verification or DB work", async () => {
    const { request, cancelled } = streamed([
      new Uint8Array(MAX_WEBHOOK_BYTES + 1),
      new Uint8Array(1),
    ]);
    const getDb = vi.fn(() => {
      throw new Error("No database access allowed");
    });
    expect(
      (
        await handleStripeWebhook(request, {
          getDb,
          readConfig: () => ({
            enabled: true,
            issues: [],
            config: paymentsTestConfig,
          }),
        })
      ).status,
    ).toBe(400);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(getDb).not.toHaveBeenCalled();
  });
  it("rejects a valid-looking Pesapal prefix followed by an oversized suffix", async () => {
    const prefix = new TextEncoder().encode(
      "OrderTrackingId=11111111-2222-4333-8444-555555555555&",
    );
    const { request, cancelled } = streamed([
      prefix,
      new Uint8Array(4096),
      new Uint8Array(1),
    ]);
    expect(await parsePesapalBody(request)).toBeUndefined();
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it.each([
    "OrderTrackingId=%FF",
    "OrderTrackingId=%GG",
    '{"OrderTrackingId":{}}',
    "[1]",
  ])("rejects malformed IPN input %s", async (body) => {
    expect(
      await parsePesapalBody(
        new Request("https://kctf.example", {
          method: "POST",
          headers: {
            "content-type": body.startsWith("[")
              ? "application/json"
              : "text/plain",
          },
          body,
        }),
      ),
    ).toBeUndefined();
  });
  it.each(["application/json", "application/x-www-form-urlencoded"])(
    "preserves valid %s IPN values",
    async (type) => {
      const data = {
        OrderTrackingId: "11111111-2222-4333-8444-555555555555",
        OrderMerchantReference: "KCTF-D-00000001",
        OrderNotificationType: "IPNCHANGE",
      };
      const body =
        type === "application/json"
          ? JSON.stringify(data)
          : new URLSearchParams(data).toString();
      expect(
        Object.fromEntries(
          (await parsePesapalBody(
            new Request("https://kctf.example", {
              method: "POST",
              headers: { "content-type": type },
              body,
            }),
          ))!,
        ),
      ).toEqual(data);
    },
  );
});

describe("execution budgets", () => {
  it("uses one absolute budget for Pesapal authentication and its status request", async () => {
    clearPesapalTokens();
    let now = 0;
    const budget = new ExecutionBudget(20_000, undefined, () => now);
    const fetchImpl = vi.fn(async () => {
      now = 19_000;
      return Response.json({
        token: "synthetic",
        expiryDate: new Date(Date.now() + 60_000).toISOString(),
      });
    });
    const provider = createPesapalProvider(
      paymentsTestConfig.methods.mobile_money!,
      fetchImpl,
      15_000,
      budget,
    );
    expect(
      await provider.fetchStatus("11111111-2222-4333-8444-555555555555"),
    ).toMatchObject({ kind: "retryable", code: "provider_timeout" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it("bounds a client that ignores cancellation", async () => {
    await expect(
      abortable(() => new Promise(() => {}), AbortSignal.timeout(20)),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });
  it("does not let child budgets extend the shared deadline", () => {
    let now = 0;
    const root = new ExecutionBudget(50_000, undefined, () => now);
    now = 40_000;
    const child = root.child(35_000);
    expect(child.remaining()).toBe(10_000);
    expect(child.canStart()).toBe(false);
    now = 50_000;
    expect(child.remaining()).toBe(0);
    expect(() => child.requestSignal(1000)).toThrow();
  });
  it("does not report healthy when payment reconciliation failed or work was deferred", () => {
    const email = {
      ok: true,
      degraded: false,
      claimed: 1,
      sent: 1,
      retried: 0,
      failed: 0,
      lost: 0,
      recovered: 0,
      purgedRateLimits: 0,
    };
    expect(workerOutcome(email, { ok: false, reason: "error" })).toBe("failed");
    expect(
      workerOutcome(email, {
        ok: false,
        checked: 1,
        failed: 1,
        reconciled: 0,
        closed: 0,
      }),
    ).toBe("degraded");
    expect(
      workerOutcome(
        { ...email, partial: true },
        { ok: true, checked: 0, failed: 0, reconciled: 0, closed: 0 },
      ),
    ).toBe("partial");
  });
});

describe("dependency compatibility", () => {
  it("accepts Vercel's default schemas with patched Zod and still attaches a pg pool", async () => {
    const require = createRequire(import.meta.url);
    const config = require("@vercel/cli-config");
    expect(
      config.authConfigSchema.safeParse(config.defaultAuthConfig).success,
    ).toBe(true);
    expect(
      config.globalConfigSchema.safeParse(config.defaultGlobalConfig).success,
    ).toBe(true);
    expect(config.authConfigSchema.safeParse({ token: 42 }).success).toBe(
      false,
    );
    const pool = new Pool({
      connectionString: "postgresql://synthetic:synthetic@127.0.0.1:1/test",
      idleTimeoutMillis: 10,
    });
    expect(() => attachDatabasePool(pool)).not.toThrow();
    await pool.end();
  });
  it("keeps every keyed pre-verification bucket within the database column bound", () => {
    for (const scope of ["enquiry", "donation", "draft"])
      expect(
        abuseKey(`a-${scope}-ip`, "unknown", "synthetic").length,
      ).toBeLessThanOrEqual(80);
  });
});
