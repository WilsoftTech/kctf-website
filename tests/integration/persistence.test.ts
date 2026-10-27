import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PRIVACY_NOTICE_VERSION } from "@/content/privacy";
import { submitEnquiry } from "@/server/enquiries/submit";
import { request } from "../support/fixtures";
import {
  db,
  enquiryInput,
  resetDatabase,
  submitDeps,
  turnstileOk,
} from "./helpers";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe("database invariants", () => {
  it("runs sessions in UTC, as the Prisma pg adapter requires (set by migration)", async () => {
    const [{ TimeZone }] = await db.$queryRaw<
      { TimeZone: string }[]
    >`SHOW TimeZone`;
    expect(TimeZone).toBe("UTC");
  });
});

describe("durable enquiry persistence", () => {
  it("saves the enquiry and its outbox job before reporting success", async () => {
    const input = enquiryInput(1);
    const res = await submitEnquiry(request(input), submitDeps());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ state: "received", replay: false });
    expect(res.body.state === "received" && res.body.reference).toMatch(
      /^KCTF-[0-9A-F]{8}$/,
    );
    expect(res.body.message).not.toMatch(/sent|delivered|emailed/i);
    expect(res.queued).toBe(true);
    const saved = await db.enquiry.findUniqueOrThrow({
      where: { idempotencyKey: input.idempotencyKey },
      include: { outbox: true },
    });
    expect(saved).toMatchObject({
      name: input.name,
      email: input.email,
      topic: "general",
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    });
    expect(saved.outbox).toHaveLength(1);
    expect(saved.outbox[0]).toMatchObject({
      kind: "staff-notification",
      status: "pending",
      attempts: 0,
    });
  });

  it("rolls back the enquiry when the outbox insert fails", async () => {
    await db.$executeRawUnsafe(`
      CREATE FUNCTION test_fail_outbox() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'synthetic outbox failure'; END $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(
      "CREATE TRIGGER test_fail_outbox BEFORE INSERT ON email_outbox FOR EACH ROW EXECUTE FUNCTION test_fail_outbox()",
    );
    try {
      const res = await submitEnquiry(request(enquiryInput(2)), submitDeps());
      expect(res.status).toBe(503);
      expect(res.body.state).toBe("unconfirmed");
      expect(await db.enquiry.count()).toBe(0);
      expect(await db.emailOutbox.count()).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        "DROP TRIGGER test_fail_outbox ON email_outbox",
      );
      await db.$executeRawUnsafe("DROP FUNCTION test_fail_outbox()");
    }
  });

  it("replays a retried submission without a duplicate or a second Turnstile check", async () => {
    const input = enquiryInput(3);
    const first = await submitEnquiry(request(input), submitDeps());
    const fetchImpl = turnstileOk();
    const retry = await submitEnquiry(
      request({ ...input, token: "" }),
      submitDeps(fetchImpl as typeof fetch),
    );
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ state: "received", replay: true });
    expect(retry.body.state === "received" && retry.body.reference).toBe(
      first.body.state === "received" && first.body.reference,
    );
    expect(retry.queued).toBeFalsy();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await db.enquiry.count()).toBe(1);
    expect(await db.emailOutbox.count()).toBe(1);
  });

  it("refuses to reuse a key for different content", async () => {
    const input = enquiryInput(4);
    await submitEnquiry(request(input), submitDeps());
    const res = await submitEnquiry(
      request({ ...input, message: `${input.message} Changed afterwards.` }),
      submitDeps(),
    );
    expect(res.status).toBe(409);
    expect(res.body.state).toBe("conflict");
    expect(await db.enquiry.count()).toBe(1);
  });

  it("saves exactly once when identical requests race", async () => {
    const input = enquiryInput(5);
    // Three, because each racing request also counts against the per-email limit (3/hour).
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        submitEnquiry(request(input), submitDeps()),
      ),
    );
    expect(results.every((r) => r.body.state === "received")).toBe(true);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await db.enquiry.count()).toBe(1);
    expect(await db.emailOutbox.count()).toBe(1);
  });

  it.each([
    ["failed verification", { success: false }, 400],
    [
      "another hostname",
      { success: true, hostname: "foreign.example", action: "enquiry" },
      400,
    ],
    [
      "another action",
      { success: true, hostname: "kctf.example", action: "login" },
      400,
    ],
  ])("saves nothing on %s", async (_label, answer, status) => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json(answer));
    const res = await submitEnquiry(
      request(enquiryInput(6)),
      submitDeps(fetchImpl),
    );
    expect(res.status).toBe(status);
    expect(await db.enquiry.count()).toBe(0);
  });

  it("saves nothing when Turnstile is unavailable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("synthetic outage"));
    const res = await submitEnquiry(
      request(enquiryInput(7)),
      submitDeps(fetchImpl),
    );
    expect(res.status).toBe(503);
    expect(res.body.state).toBe("unavailable");
    expect(await db.enquiry.count()).toBe(0);
  });
});

describe("shared abuse limits", () => {
  it("limits repeated enquiries from one email address across instances", async () => {
    const statuses = [];
    for (let i = 0; i < 4; i++)
      statuses.push(
        (
          await submitEnquiry(
            request(enquiryInput(10, { idempotencyKey: crypto.randomUUID() })),
            submitDeps(),
          )
        ).status,
      );
    expect(statuses).toEqual([201, 201, 201, 429]);
  });

  it("limits a trusted client IP and stores only keyed digests", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++)
      statuses.push(
        (
          await submitEnquiry(
            request(enquiryInput(20 + i), { "x-real-ip": "192.0.2.77" }),
            submitDeps(),
          )
        ).status,
      );
    expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    const keys = (await db.rateLimitBucket.findMany())
      .map((b) => b.key)
      .join(" ");
    expect(keys).not.toContain("192.0.2.77");
    expect(keys).not.toContain("example.com");
    const buckets = await db.rateLimitBucket.findMany();
    expect(
      buckets.every((b) => b.expiresAt.getTime() - Date.now() < 3 * 3600_000),
    ).toBe(true);
  });
});
