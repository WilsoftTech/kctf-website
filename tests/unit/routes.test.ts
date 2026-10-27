import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/outbox/run", () => ({
  runOutbox: vi.fn(async () => ({
    ok: true,
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    recovered: 0,
    lost: 0,
    purgedRateLimits: 0,
  })),
}));
const { GET, POST } = await import("@/app/api/outbox/run/route");
const { runOutbox } = await import("@/server/outbox/run");
const secret = "synthetic-cron-secret-0123456789abcdef";
const call = (handler: typeof GET, authorization?: string) =>
  handler(
    new Request("https://kctf.example/api/outbox/run", {
      headers: authorization ? { authorization } : {},
    }),
  );

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(runOutbox).mockClear();
});

describe("outbox worker endpoint", () => {
  it("is disabled without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call(GET, `Bearer ${secret}`)).status).toBe(503);
    expect(runOutbox).not.toHaveBeenCalled();
  });
  it.each([undefined, "Bearer wrong", secret, `Basic ${secret}`])(
    "rejects authorization %s",
    async (header) => {
      vi.stubEnv("CRON_SECRET", secret);
      expect((await call(GET, header)).status).toBe(401);
      expect(runOutbox).not.toHaveBeenCalled();
    },
  );
  it("runs a bounded batch for an authenticated scheduler", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    const res = await call(POST, `Bearer ${secret}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(runOutbox).toHaveBeenCalledWith({ batchSize: 5, purge: true });
  });
});
