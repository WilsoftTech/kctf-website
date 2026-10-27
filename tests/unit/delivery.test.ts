import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStaffNotification,
  enquiryReference,
} from "@/server/outbox/notification";
import { sendWithResend } from "@/server/outbox/resend";
import { retryDelayMs } from "@/server/outbox/worker";
import { verifyTurnstile } from "@/server/enquiries/turnstile";
import { abuseKey, clientIp, limitsFor } from "@/server/enquiries/abuse";
import { log, safeErrorCode } from "@/server/log";

const enquiry = {
  id: "01926f3a-0000-7000-8000-00000000abcd",
  name: `Visitor <script>alert("x")</script>`,
  email: "visitor@example.com",
  topic: "partnership" as const,
  message: "Line one & <b>bold</b>\nLine 'two'",
  createdAt: new Date("2026-10-27T10:00:00.000Z"),
};
const delivery = {
  from: "KCTF Website <website@kctf.example>",
  to: ["staff@kctf.example"],
};

afterEach(() => vi.restoreAllMocks());

describe("staff notification", () => {
  const email = buildStaffNotification(enquiry, delivery);
  it("uses the verified sender and the visitor as Reply-To only", () => {
    expect(email.from).toBe(delivery.from);
    expect(email.reply_to).toBe(enquiry.email);
    expect(email.to).toEqual(delivery.to);
  });
  it("keeps visitor input out of the subject", () => {
    expect(email.subject).toBe(
      `KCTF website enquiry: Partnership (${enquiryReference(enquiry.id)})`,
    );
    expect(email.subject).not.toContain("Visitor");
  });
  it("escapes every visitor value in the HTML part", () => {
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>");
    expect(email.html).toContain(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
    expect(email.html).toContain("Line one &amp; &lt;b&gt;bold&lt;/b&gt;");
    expect(email.html).toContain("Line &#39;two&#39;");
  });
  it("includes an unescaped plain-text part", () =>
    expect(email.text).toContain(enquiry.message));
  it("derives a short stable reference", () =>
    expect(enquiryReference(enquiry.id)).toBe("KCTF-0000ABCD"));
});

describe("Resend client", () => {
  const send = (fetchImpl: typeof fetch) =>
    sendWithResend({
      apiUrl: "https://api.resend.com/emails",
      apiKey: "re_synthetic_key",
      idempotencyKey: "kctf-outbox/synthetic",
      payload: { subject: "synthetic" },
      fetchImpl,
      timeoutMs: 50,
    });
  it("sends the stable idempotency key and accepts provider acceptance", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ id: "msg_1" }));
    expect(await send(fetchImpl)).toEqual({
      kind: "accepted",
      providerMessageId: "msg_1",
    });
    expect(fetchImpl.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
      "kctf-outbox/synthetic",
    );
  });
  it.each([429, 500, 503, 409, 408])("retries HTTP %i", async (status) =>
    expect(
      (await send(vi.fn().mockResolvedValue(new Response("{}", { status }))))
        .kind,
    ).toBe("retryable"),
  );
  it.each([400, 401, 403, 422])(
    "fails permanently on HTTP %i",
    async (status) =>
      expect(
        await send(
          vi
            .fn()
            .mockResolvedValue(
              Response.json(
                { name: "validation_error", message: "secret detail" },
                { status },
              ),
            ),
        ),
      ).toEqual({
        kind: "permanent",
        code: "validation_error",
        httpStatus: status,
      }),
  );
  it("treats timeouts as uncertain and retryable", async () => {
    const hang: typeof fetch = (_url, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal!.reason),
        ),
      );
    expect(await send(hang)).toEqual({
      kind: "retryable",
      code: "provider_timeout",
    });
  });
  it("treats network failures as retryable", async () =>
    expect(
      await send(vi.fn().mockRejectedValue(new TypeError("fetch failed"))),
    ).toEqual({
      kind: "retryable",
      code: "provider_network",
    }));
  it("never copies unsafe provider text into error codes", async () =>
    expect(
      await send(
        vi
          .fn()
          .mockResolvedValue(
            Response.json({ name: "Contains spaces & data" }, { status: 422 }),
          ),
      ),
    ).toMatchObject({ code: "http_422" }));
});

describe("retry backoff", () => {
  it("doubles from one minute and caps at six hours", () => {
    const none = () => 0;
    expect(retryDelayMs(1, none)).toBe(60_000);
    expect(retryDelayMs(2, none)).toBe(120_000);
    expect(retryDelayMs(5, none)).toBe(960_000);
    expect(retryDelayMs(20, none)).toBe(6 * 3_600_000);
  });
  it("adds at most 20% jitter", () =>
    expect(retryDelayMs(1, () => 0.999)).toBeLessThanOrEqual(72_000));
});

describe("Turnstile verification", () => {
  const verify = (fetchImpl: typeof fetch, token = "token") =>
    verifyTurnstile({
      token,
      secret: "secret",
      hostname: "kctf.example",
      verifyUrl: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      fetchImpl,
    });
  const answer = (body: object) =>
    vi.fn().mockResolvedValue(Response.json(body));
  it("accepts the right hostname and action", async () =>
    expect(
      await verify(
        answer({ success: true, hostname: "kctf.example", action: "enquiry" }),
      ),
    ).toBe("valid"));
  it.each([
    { success: false },
    { success: true, hostname: "foreign.example", action: "enquiry" },
    { success: true, hostname: "kctf.example", action: "login" },
  ])("rejects %j", async (body) =>
    expect(await verify(answer(body))).toBe("invalid"),
  );
  it("rejects an empty token without calling Cloudflare", async () => {
    const fetchImpl = vi.fn();
    expect(await verify(fetchImpl, "")).toBe("invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("reports outages as unavailable", async () => {
    expect(await verify(vi.fn().mockRejectedValue(new Error("down")))).toBe(
      "unavailable",
    );
    expect(
      await verify(
        vi.fn().mockResolvedValue(new Response("", { status: 500 })),
      ),
    ).toBe("unavailable");
  });
});

describe("abuse controls", () => {
  const headers = new Headers({
    "x-real-ip": "192.0.2.10",
    "x-forwarded-for": "198.51.100.1, 10.0.0.1",
  });
  it("ignores forwarded headers unless a trusted proxy is declared", () => {
    expect(clientIp(headers, "none")).toBeUndefined();
    expect(clientIp(headers, "vercel")).toBe("192.0.2.10");
    expect(
      clientIp(new Headers({ "x-real-ip": "<script>" }), "vercel"),
    ).toBeUndefined();
  });
  it("stores keyed digests, never raw identifiers", () => {
    const limits = limitsFor(
      { ip: "192.0.2.10", email: "Visitor@Example.com" },
      "s".repeat(32),
    );
    const keys = limits.map((l) => l.key).join(" ");
    expect(keys).not.toContain("192.0.2.10");
    expect(keys).not.toContain("example.com");
    expect(limits.map((l) => l.key.split(":")[0])).toEqual([
      "ip",
      "email",
      "global",
    ]);
    expect(abuseKey("email", "a", "k1")).not.toBe(abuseKey("email", "a", "k2"));
  });
  it("skips per-IP limits when no client IP is trusted", () =>
    expect(limitsFor({ email: "v@example.com" }, "s".repeat(32))).toHaveLength(
      2,
    ));
});

describe("operational logs", () => {
  it("drops fields that are not on the allowlist", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    log("info", "synthetic", {
      enquiryId: "id-1",
      email: "visitor@example.com",
      message: "private",
      ip: "192.0.2.1",
      token: "t",
    } as Record<string, string>);
    const line = spy.mock.calls[0][0] as string;
    expect(JSON.parse(line)).toMatchObject({
      event: "synthetic",
      enquiryId: "id-1",
    });
    for (const secret of ["visitor@example.com", "private", "192.0.2.1", '"t"'])
      expect(line).not.toContain(secret);
  });
  it("reduces errors to safe codes, never messages", () => {
    expect(
      safeErrorCode({ code: "P2002", message: "postgres://user:pw@host" }),
    ).toBe("P2002");
    expect(safeErrorCode(new TypeError("contains secrets"))).toBe("TypeError");
    expect(safeErrorCode({ code: "has spaces and secrets" })).toBe(
      "unknown_error",
    );
  });
});
