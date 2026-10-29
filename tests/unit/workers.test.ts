import { afterEach, describe, expect, it, vi } from "vitest";
import { ExecutionBudget } from "@/server/execution-budget";

const mocks = vi.hoisted(() => ({
  email: vi.fn(),
  payments: vi.fn(),
  runs: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
vi.mock("@/server/db", () => ({ getDb: () => ({ workerRun: mocks.runs }) }));
vi.mock("@/server/outbox/run", () => ({ runOutbox: mocks.email }));
vi.mock("@/server/payments/reconcile", () => ({
  reconcilePayments: mocks.payments,
}));
const { runBackgroundWorker } = await import("@/server/workers/run");
const summary = {
  ok: true,
  degraded: false,
  claimed: 1,
  sent: 1,
  retried: 0,
  failed: 0,
  lost: 0,
  recovered: 0,
};
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
describe("combined worker", () => {
  it("reports a partial run if DB completion consumes the parent safety reserve", async () => {
    let now = 0;
    const budget = new ExecutionBudget(20_000, undefined, () => now);
    mocks.runs.create.mockResolvedValue({ id: "synthetic" });
    mocks.email.mockImplementation(async () => {
      now = 19000;
      return summary;
    });
    mocks.payments.mockResolvedValue({ ok: true, checked: 0, failed: 0 });
    expect(await runBackgroundWorker({ budget })).toMatchObject({
      ok: false,
      status: "partial",
    });
    expect(mocks.runs.deleteMany).not.toHaveBeenCalled();
  });
  it("runs email while reconciliation is unresolved and persists a degraded result", async () => {
    mocks.runs.create.mockResolvedValue({ id: "synthetic" });
    mocks.email.mockResolvedValue(summary);
    let release!: (result: {
      ok: boolean;
      failed: number;
      checked: number;
    }) => void;
    mocks.payments.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = runBackgroundWorker();
    await vi.waitFor(() => expect(mocks.email).toHaveBeenCalledOnce());
    expect(mocks.payments).toHaveBeenCalledOnce();
    const emailBudget = mocks.email.mock.calls[0][0].budget;
    const paymentBudget = mocks.payments.mock.calls[0][0].budget;
    expect(emailBudget.remaining()).toBeGreaterThan(paymentBudget.remaining());
    release({ ok: false, failed: 1, checked: 1 });
    expect(await pending).toMatchObject({
      ok: false,
      status: "degraded",
      email: { sent: 1 },
    });
    expect(mocks.runs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "degraded",
          sent: 1,
          paymentFailed: 1,
        }),
      }),
    );
  });
  it("does not hide a rejected reconciliation phase behind successful email", async () => {
    mocks.runs.create.mockResolvedValue({ id: "synthetic" });
    mocks.email.mockResolvedValue(summary);
    mocks.payments.mockRejectedValue(new Error("synthetic"));
    expect(await runBackgroundWorker()).toMatchObject({
      ok: false,
      status: "failed",
    });
  });
});
