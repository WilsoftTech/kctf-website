import { describe, expect, it, vi } from "vitest";
import { enquirySchema } from "@/validation/enquiry";
import { submitEnquiry, type SubmitDeps } from "@/server/enquiries/submit";
import type { EnquiryConfigResult } from "@/server/config";
import { onlineConfig, origin, request, valid } from "../support/fixtures";

function deps(overrides: Partial<SubmitDeps> = {}) {
  const getDb = vi.fn(() => {
    throw new Error("database must not be reached");
  });
  const fetchImpl = vi.fn();
  return {
    getDb,
    fetchImpl,
    deps: {
      siteOrigin: origin,
      readConfig: (): EnquiryConfigResult => ({
        mode: "online",
        issues: [],
        config: onlineConfig,
      }),
      getDb,
      fetchImpl,
      ...overrides,
    } as SubmitDeps,
  };
}

describe("enquiry validation", () => {
  it("accepts a valid enquiry and trims names", () =>
    expect(enquirySchema.parse({ ...valid, name: "  Visitor  " }).name).toBe(
      "Visitor",
    ));
  it.each([
    { email: "invalid" },
    { message: "short" },
    { consent: false },
    { website: "spam" },
    { topic: "payment" },
    { extra: "untrusted" },
    { idempotencyKey: "not-a-uuid" },
    { idempotencyKey: undefined },
  ])("rejects invalid or unexpected input %j", (change) =>
    expect(enquirySchema.safeParse({ ...valid, ...change }).success).toBe(
      false,
    ),
  );
  it.each(["general", "volunteer", "partnership", "donation"])(
    "accepts the %s topic",
    (topic) =>
      expect(enquirySchema.safeParse({ ...valid, topic }).success).toBe(true),
  );
  it("rejects payment fields on a donation enquiry", () =>
    expect(
      enquirySchema.safeParse({
        ...valid,
        topic: "donation",
        amount: 50,
        currency: "UGX",
      }).success,
    ).toBe(false));
  it("rejects excessive message lengths", () =>
    expect(
      enquirySchema.safeParse({ ...valid, message: "x".repeat(3001) }).success,
    ).toBe(false));
});

describe("request boundary (before any database or network access)", () => {
  it("rejects foreign origins", async () => {
    const t = deps();
    const res = await submitEnquiry(
      request(valid, { origin: "https://foreign.example" }),
      t.deps,
    );
    expect(res.status).toBe(403);
    expect(t.getDb).not.toHaveBeenCalled();
    expect(t.fetchImpl).not.toHaveBeenCalled();
  });
  it("rejects a missing origin", async () => {
    const r = new Request(`${origin}/api/enquiries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(valid),
    });
    expect((await submitEnquiry(r, deps().deps)).status).toBe(403);
  });
  it("rejects non-JSON requests", async () => {
    const res = await submitEnquiry(
      request(valid, { "content-type": "text/plain" }),
      deps().deps,
    );
    expect(res.status).toBe(415);
  });
  it("rejects malformed JSON", async () =>
    expect((await submitEnquiry(request("{"), deps().deps)).status).toBe(400));
  it("rejects invalid UTF-8", async () => {
    const r = new Request(`${origin}/api/enquiries`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: new Uint8Array([0x7b, 0xff, 0x7d]),
    });
    expect((await submitEnquiry(r, deps().deps)).status).toBe(400);
  });
  it("rejects oversized declared bodies", async () => {
    const res = await submitEnquiry(
      request(valid, { "content-length": "999999" }),
      deps().deps,
    );
    expect(res.status).toBe(413);
  });
  it("rejects oversized streamed bodies without trusting content-length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(4096));
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 10) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const r = new Request(`${origin}/api/enquiries`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit);
    const res = await submitEnquiry(r, deps().deps);
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(10);
  });
  it("validates on the server and returns field errors", async () => {
    const res = await submitEnquiry(
      request({ ...valid, email: "nope" }),
      deps().deps,
    );
    expect(res.status).toBe(400);
    expect(res.body.state).toBe("invalid");
    expect(res.body).toHaveProperty("fields.email");
  });
  it("rejects filled honeypots", async () => {
    const res = await submitEnquiry(
      request({ ...valid, website: "https://spam.example" }),
      deps().deps,
    );
    expect(res.status).toBe(400);
  });
  it("never accepts submissions in email-draft mode", async () => {
    const t = deps({
      readConfig: () => ({ mode: "email-draft", issues: [] }),
    });
    const res = await submitEnquiry(request(), t.deps);
    expect(res.status).toBe(503);
    expect(res.body.state).toBe("unavailable");
    expect(t.getDb).not.toHaveBeenCalled();
  });
  it("reports broken configuration as unavailable, not as received", async () => {
    const t = deps({
      readConfig: () => ({
        mode: "unavailable",
        issues: ["DATABASE_URL is not set."],
      }),
    });
    const res = await submitEnquiry(request(), t.deps);
    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain("DATABASE_URL");
  });
  it("reports an unreachable database as unavailable (nothing saved)", async () => {
    const t = deps();
    const res = await submitEnquiry(request(), t.deps);
    expect(res.status).toBe(503);
    expect(res.body.state).toBe("unavailable");
    expect(t.fetchImpl).not.toHaveBeenCalled();
  });
});
