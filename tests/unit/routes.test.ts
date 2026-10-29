import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/workers/run", () => ({
  runBackgroundWorker: vi.fn(async () => ({
    ok: true,
    status: "healthy",
    runId: "synthetic",
  })),
}));
vi.mock("@/server/db", () => ({ getDb: vi.fn() }));
vi.mock("@/server/workers/status", () => ({ backgroundStatus: vi.fn() }));
const { GET: statusGET } = await import("@/app/api/outbox/status/route");
const { backgroundStatus } = await import("@/server/workers/status");
const { GET, POST } = await import("@/app/api/outbox/run/route");
const { runBackgroundWorker } = await import("@/server/workers/run");
const secret = "synthetic-cron-secret-0123456789abcdef";
const call = (handler: typeof GET, authorization?: string) =>
  handler(
    new Request("https://kctf.example/api/outbox/run", {
      headers: authorization ? { authorization } : {},
    }),
  );

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(runBackgroundWorker).mockClear();
});

describe("outbox worker endpoint", () => {
  it("is disabled without CRON_SECRET", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call(GET, `Bearer ${secret}`)).status).toBe(503);
    expect(runBackgroundWorker).not.toHaveBeenCalled();
  });
  it.each([undefined, "Bearer wrong", secret, `Basic ${secret}`])(
    "rejects authorization %s",
    async (header) => {
      vi.stubEnv("CRON_SECRET", secret);
      expect((await call(GET, header)).status).toBe(401);
      expect(runBackgroundWorker).not.toHaveBeenCalled();
    },
  );
  it("runs a bounded batch for an authenticated scheduler", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    const res = await call(POST, `Bearer ${secret}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const budget = vi.mocked(runBackgroundWorker).mock.calls[0][0]!.budget!;
    expect(budget.remaining()).toBeGreaterThan(45_000);
    expect(budget.remaining()).toBeLessThanOrEqual(50_000);
  });
  it.each([
    ["partial", 207],
    ["degraded", 503],
    ["failed", 503],
  ] as const)("reports %s runs honestly", async (status, code) => {
    vi.stubEnv("CRON_SECRET", secret);
    vi.mocked(runBackgroundWorker).mockResolvedValueOnce({
      ok: false,
      status,
      runId: "synthetic",
    } as Awaited<ReturnType<typeof runBackgroundWorker>>);
    const response = await call(GET, `Bearer ${secret}`);
    expect(response.status).toBe(code);
    expect(await response.json()).toMatchObject({ ok: false, status });
  });
  it("reports unexpected failures without leaking provider details", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    vi.mocked(runBackgroundWorker).mockRejectedValueOnce(
      new Error("synthetic secret"),
    );
    const response = await call(GET, `Bearer ${secret}`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, status: "failed" });
  });
});

describe("worker status protection", () => {
  it("requires the scheduler secret before reading metrics", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call(statusGET)).status).toBe(503);
    vi.stubEnv("CRON_SECRET", secret);
    expect((await call(statusGET, "Bearer wrong")).status).toBe(401);
    expect(backgroundStatus).not.toHaveBeenCalled();
  });
  it("returns non-cacheable unhealthy status when authenticated metrics require attention", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    vi.mocked(backgroundStatus).mockResolvedValueOnce({
      ok: false,
      alerts: ["payment_reconciliation_failures"],
    } as Awaited<ReturnType<typeof backgroundStatus>>);
    const response = await call(statusGET, `Bearer ${secret}`);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      ok: false,
      alerts: ["payment_reconciliation_failures"],
    });
  });
});
