import { afterEach, describe, expect, it, vi } from "vitest";
import { enquirySchema } from "@/validation/enquiry";
import { POST } from "@/app/api/enquiries/route";
import { rateLimit } from "@/lib/enquiries";
const valid = {
  name: "Synthetic Visitor",
  email: "visitor@example.com",
  topic: "general",
  message: "A synthetic enquiry to test validation.",
  consent: true,
  website: "",
  token: "test-token",
};
const url = "https://kctf.example";
function req(data: unknown = valid, headers: Record<string, string> = {}) {
  return new Request(url + "/api/enquiries", {
    method: "POST",
    headers: { origin: url, "content-type": "application/json", ...headers },
    body: typeof data === "string" ? data : JSON.stringify(data),
  });
}
function enable() {
  vi.stubEnv("SITE_URL", url);
  vi.stubEnv("ENQUIRIES_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "test");
  vi.stubEnv("ENQUIRY_FROM", "test@example.com");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "test");
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test");
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
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
    { topic: "donation" },
    { extra: "untrusted" },
  ])("rejects invalid or unexpected input %j", (change) =>
    expect(enquirySchema.safeParse({ ...valid, ...change }).success).toBe(
      false,
    ),
  );
  it("rejects excessive message lengths", () =>
    expect(
      enquirySchema.safeParse({ ...valid, message: "x".repeat(3001) }).success,
    ).toBe(false));
});
describe("server boundary", () => {
  it("rejects foreign origins before external calls", async () => {
    enable();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (await POST(req(valid, { origin: "https://foreign.example" }))).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON", async () => {
    enable();
    expect((await POST(req("{"))).status).toBe(400);
  });
  it("rejects non JSON", async () => {
    enable();
    expect(
      (await POST(req(valid, { "content-type": "text/plain" }))).status,
    ).toBe(415);
  });
  it("rejects oversized streamed bodies without trusting content-length", async () => {
    enable();
    expect((await POST(req("x".repeat(17000)))).status).toBe(413);
  });
  it("validates on the server", async () => {
    enable();
    expect((await POST(req({ ...valid, consent: false }))).status).toBe(400);
  });
  it("never claims delivery when configuration is incomplete", async () => {
    vi.stubEnv("SITE_URL", url);
    vi.stubEnv("ENQUIRIES_ENABLED", "false");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await POST(req())).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects failed bot verification without emailing", async () => {
    enable();
    const fetch = vi.fn().mockResolvedValue(Response.json({ success: false }));
    vi.stubGlobal("fetch", fetch);
    expect(
      (await POST(req(valid, { "x-forwarded-for": "192.0.2.1" }))).status,
    ).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a verified token for another hostname", async () => {
    enable();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          success: true,
          hostname: "foreign.example",
          action: "enquiry",
        }),
      ),
    );
    expect(
      (await POST(req(valid, { "x-forwarded-for": "192.0.2.2" }))).status,
    ).toBe(400);
  });
  it("returns success only after provider acceptance", async () => {
    enable();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          hostname: "kctf.example",
          action: "enquiry",
        }),
      )
      .mockResolvedValueOnce(Response.json({ id: "synthetic-id" }));
    vi.stubGlobal("fetch", fetch);
    expect(
      (await POST(req(valid, { "x-forwarded-for": "192.0.2.3" }))).status,
    ).toBe(200);
    const payload = JSON.parse(fetch.mock.calls[1][1].body);
    expect(payload.reply_to).toBe(valid.email);
    expect(payload.text).toContain(valid.message);
    expect(payload).not.toHaveProperty("html");
  });
  it("reports email-provider failures honestly", async () => {
    enable();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            success: true,
            hostname: "kctf.example",
            action: "enquiry",
          }),
        )
        .mockResolvedValueOnce(new Response("failure", { status: 500 })),
    );
    expect(
      (await POST(req(valid, { "x-forwarded-for": "192.0.2.4" }))).status,
    ).toBe(502);
  });
  it("reports provider timeouts honestly", async () => {
    enable();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(
      (await POST(req(valid, { "x-forwarded-for": "192.0.2.5" }))).status,
    ).toBe(502);
  });
  it("limits bursts and expires counters", () => {
    const t = Date.now();
    for (let i = 0; i < 5; i++)
      expect(rateLimit("synthetic-test", t)).toBe(true);
    expect(rateLimit("synthetic-test", t)).toBe(false);
    expect(rateLimit("synthetic-test", t + 60001)).toBe(true);
  });
});
