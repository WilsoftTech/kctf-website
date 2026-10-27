import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { submitEnquiry } from "@/server/enquiries/submit";
import {
  processOutbox,
  purgeExpiredRateLimits,
  requeueFailed,
} from "@/server/outbox/worker";
import { request } from "../support/fixtures";
import {
  db,
  delivery,
  enquiryInput,
  resetDatabase,
  submitDeps,
} from "./helpers";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

async function queue(count = 1) {
  for (let i = 0; i < count; i++)
    await submitEnquiry(request(enquiryInput(100 + i)), submitDeps());
  return db.emailOutbox.findMany({ orderBy: { createdAt: "asc" } });
}
const accepted = () =>
  vi.fn(async () => Response.json({ id: `msg_${crypto.randomUUID()}` }));
const run = (fetchImpl: typeof fetch, options = {}) =>
  processOutbox({ db, delivery, fetchImpl }, options);
async function makeDue() {
  await db.$executeRawUnsafe(
    "UPDATE email_outbox SET next_attempt_at = now() - interval '1 second'",
  );
}

describe("outbox delivery", () => {
  it("marks provider acceptance as sent with a stable idempotency key", async () => {
    const [job] = await queue();
    const fetchImpl = accepted();
    expect(await run(fetchImpl)).toMatchObject({ claimed: 1, sent: 1 });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(`kctf-outbox/${job.id}`);
    const payload = JSON.parse(init.body as string);
    expect(payload).toMatchObject({
      from: delivery.from,
      to: delivery.to,
      reply_to: "visitor100@example.com",
    });
    expect(payload.html).toBeTruthy();
    expect(payload.text).toContain("Synthetic enquiry number 100");
    const sent = await db.emailOutbox.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(sent).toMatchObject({
      status: "sent",
      attempts: 1,
      claimToken: null,
    });
    expect(sent.providerMessageId).toMatch(/^msg_/);
    expect(sent.sentAt).toBeInstanceOf(Date);
    // Nothing is left to claim.
    expect(await run(fetchImpl)).toMatchObject({ claimed: 0 });
  });

  it("keeps the enquiry and schedules a retry when the provider fails", async () => {
    const [job] = await queue();
    const failing = vi.fn(async () => new Response("{}", { status: 503 }));
    expect(await run(failing)).toMatchObject({ claimed: 1, retried: 1 });
    const pending = await db.emailOutbox.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(pending).toMatchObject({
      status: "pending",
      attempts: 1,
      lastError: "http_503",
    });
    expect(pending.nextAttemptAt.getTime()).toBeGreaterThan(
      Date.now() + 50_000,
    );
    expect(await db.enquiry.count()).toBe(1);
    // Backoff is respected: not claimable until due.
    expect(await run(failing)).toMatchObject({ claimed: 0 });
    await makeDue();
    expect(await run(accepted())).toMatchObject({ sent: 1 });
  });

  it("retries timeouts under the same provider key", async () => {
    const [job] = await queue();
    const keys: string[] = [];
    const hang = vi.fn((_url: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)["Idempotency-Key"]);
      return new Promise<Response>((_, reject) =>
        init.signal!.addEventListener("abort", () =>
          reject(init.signal!.reason),
        ),
      );
    });
    expect(
      await run(hang as unknown as typeof fetch, { providerTimeoutMs: 50 }),
    ).toMatchObject({ retried: 1 });
    expect(
      (await db.emailOutbox.findUniqueOrThrow({ where: { id: job.id } }))
        .lastError,
    ).toBe("provider_timeout");
    await makeDue();
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      keys.push((init.headers as Record<string, string>)["Idempotency-Key"]);
      return Response.json({ id: "msg_after_timeout" });
    });
    await run(fetchImpl as unknown as typeof fetch);
    expect(new Set(keys)).toEqual(new Set([`kctf-outbox/${job.id}`]));
  });

  it("fails permanently on a non-retryable provider error", async () => {
    const [job] = await queue();
    const rejected = vi.fn(async () =>
      Response.json({ name: "validation_error" }, { status: 422 }),
    );
    expect(await run(rejected)).toMatchObject({ failed: 1 });
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: job.id } }),
    ).toMatchObject({
      status: "failed",
      lastError: "validation_error",
    });
  });

  it("stops after the attempt limit and leaves an observable failed job", async () => {
    const [job] = await queue();
    await db.emailOutbox.update({
      where: { id: job.id },
      data: { maxAttempts: 3 },
    });
    const failing = vi.fn(async () => new Response("{}", { status: 500 }));
    for (let i = 0; i < 3; i++) {
      await makeDue();
      await run(failing);
    }
    const failed = await db.emailOutbox.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(failed).toMatchObject({
      status: "failed",
      attempts: 3,
      lastError: "http_500",
    });
    await makeDue();
    expect(await run(failing)).toMatchObject({ claimed: 0 });
    expect(failing).toHaveBeenCalledTimes(3);
    expect(await db.enquiry.count()).toBe(1);
    // Operators can requeue after fixing the cause.
    expect(await requeueFailed(db, [job.id])).toBe(1);
    expect(await run(accepted())).toMatchObject({ sent: 1 });
  });
});

describe("concurrency and recovery", () => {
  it("never lets concurrent workers send the same job", async () => {
    await queue(12);
    const sends = new Map<string, number>();
    const slow = vi.fn(async (_url: string, init: RequestInit) => {
      const key = (init.headers as Record<string, string>)["Idempotency-Key"];
      sends.set(key, (sends.get(key) ?? 0) + 1);
      await new Promise((r) => setTimeout(r, 25));
      return Response.json({ id: `msg_${key}` });
    });
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        run(slow as unknown as typeof fetch, { batchSize: 5 }),
      ),
    );
    const claimed = results.reduce((n, r) => n + r.claimed, 0);
    expect(claimed).toBeLessThanOrEqual(12);
    // Drain anything the parallel round left.
    await run(slow as unknown as typeof fetch, { batchSize: 50 });
    expect(sends.size).toBe(12);
    expect([...sends.values()].every((n) => n === 1)).toBe(true);
    expect(await db.emailOutbox.count({ where: { status: "sent" } })).toBe(12);
  });

  it("recovers a stale claim and fences out the original worker", async () => {
    const [job] = await queue();
    const staleToken = crypto.randomUUID();
    await db.$executeRaw`
      UPDATE email_outbox SET status = 'processing', attempts = 1,
             claim_token = ${staleToken}::uuid, claimed_at = now() - interval '20 minutes'
       WHERE id = ${job.id}::uuid`;
    expect(await run(accepted())).toMatchObject({
      claimed: 1,
      recovered: 1,
      sent: 1,
    });
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: job.id } }),
    ).toMatchObject({
      status: "sent",
      attempts: 2,
    });
    // The original worker finally reports back: its fenced update must not apply.
    const late = await db.emailOutbox.updateMany({
      where: { id: job.id, claimToken: staleToken },
      data: { status: "failed" },
    });
    expect(late.count).toBe(0);
  });

  it("does not reclaim a live claim inside its lease", async () => {
    const [job] = await queue();
    await db.$executeRaw`
      UPDATE email_outbox SET status = 'processing', attempts = 1,
             claim_token = gen_random_uuid(), claimed_at = now()
       WHERE id = ${job.id}::uuid`;
    expect(await run(accepted())).toMatchObject({ claimed: 0 });
  });

  it("fails a stale claim whose final attempt never reported back", async () => {
    const [job] = await queue();
    await db.$executeRaw`
      UPDATE email_outbox SET status = 'processing', attempts = max_attempts,
             claim_token = gen_random_uuid(), claimed_at = now() - interval '1 hour'
       WHERE id = ${job.id}::uuid`;
    const fetchImpl = accepted();
    expect(await run(fetchImpl)).toMatchObject({ failed: 1, claimed: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(
      await db.emailOutbox.findUniqueOrThrow({ where: { id: job.id } }),
    ).toMatchObject({
      status: "failed",
      lastError: "lease_expired_after_final_attempt",
    });
  });

  it("bounds each batch", async () => {
    await queue(7);
    expect(await run(accepted(), { batchSize: 3 })).toMatchObject({
      claimed: 3,
      sent: 3,
    });
    expect(await db.emailOutbox.count({ where: { status: "pending" } })).toBe(
      4,
    );
  });
});

describe("abuse counter expiry", () => {
  it("purges only expired buckets", async () => {
    await db.rateLimitBucket.createMany({
      data: [
        {
          key: "global",
          windowStart: new Date(Date.now() - 7_200_000),
          count: 3,
          expiresAt: new Date(Date.now() - 1000),
        },
        {
          key: "global",
          windowStart: new Date(),
          count: 1,
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      ],
    });
    expect(await purgeExpiredRateLimits(db)).toBe(1);
    expect(await db.rateLimitBucket.count()).toBe(1);
  });
});
