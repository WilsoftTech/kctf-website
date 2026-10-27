import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { submitEnquiry } from "@/server/enquiries/submit";
import { executeRetention, planRetention } from "@/server/retention";
import { request } from "../support/fixtures";
import { db, enquiryInput, resetDatabase, submitDeps } from "./helpers";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

/** Three old enquiries (sent, pending, failed notification) and one recent one. */
async function seed() {
  for (let i = 0; i < 4; i++)
    await submitEnquiry(request(enquiryInput(200 + i)), submitDeps());
  const all = await db.enquiry.findMany({
    orderBy: { createdAt: "asc" },
    include: { outbox: true },
  });
  const [sent, pending, failed] = all;
  await db.$executeRaw`UPDATE enquiries SET created_at = now() - interval '400 days'
                        WHERE id IN (${sent.id}::uuid, ${pending.id}::uuid, ${failed.id}::uuid)`;
  await db.emailOutbox.update({
    where: { id: sent.outbox[0].id },
    data: { status: "sent" },
  });
  await db.emailOutbox.update({
    where: { id: failed.outbox[0].id },
    data: { status: "failed" },
  });
  return { sent, pending, failed, recent: all[3] };
}

describe("retention", () => {
  it("dry runs without deleting and holds back undelivered enquiries", async () => {
    await seed();
    const plan = await planRetention(db, { days: 365 });
    expect(plan).toMatchObject({
      days: 365,
      eligible: 1,
      heldBackUndelivered: 2,
    });
    expect(await db.enquiry.count()).toBe(4);
  });

  it("deletes only old, delivered enquiries and cascades their outbox rows", async () => {
    const { sent } = await seed();
    const result = await executeRetention(db, { days: 365, batchSize: 1 });
    expect(result.deleted).toBe(1);
    expect(await db.enquiry.findUnique({ where: { id: sent.id } })).toBeNull();
    expect(await db.emailOutbox.count({ where: { enquiryId: sent.id } })).toBe(
      0,
    );
    expect(await db.enquiry.count()).toBe(3);
  });

  it("deletes undelivered old enquiries only when explicitly included", async () => {
    await seed();
    expect(
      (await executeRetention(db, { days: 365, includeUndelivered: true }))
        .deleted,
    ).toBe(3);
    expect(await db.enquiry.count()).toBe(1);
  });
});

describe("retention CLI protections", () => {
  const require = createRequire(import.meta.url);
  const cli = (args: string[], env: Record<string, string> = {}) =>
    spawnSync(
      process.execPath,
      [
        require.resolve("tsx/cli"),
        "--conditions=react-server",
        "scripts/retention.ts",
        ...args,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: inject("testDatabaseUrl"),
          SITE_ENVIRONMENT: "test",
          ENQUIRY_RETENTION_DAYS: "",
          RETENTION_POLICY_APPROVED: "",
          ...env,
        },
      },
    );

  it("does nothing without a configured period", async () => {
    await seed();
    const out = cli([]);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain("Nothing will be deleted");
    expect(await db.enquiry.count()).toBe(4);
  });

  it("dry-runs by default even with an approved policy", async () => {
    await seed();
    const out = cli([], {
      ENQUIRY_RETENTION_DAYS: "365",
      RETENTION_POLICY_APPROVED: "true",
    });
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('"eligible": 1');
    expect(out.stdout).toContain("Nothing was deleted");
    expect(await db.enquiry.count()).toBe(4);
  });

  it("refuses to delete without approval", async () => {
    await seed();
    const out = cli(["--execute"], { ENQUIRY_RETENTION_DAYS: "365" });
    expect(out.status).toBe(1);
    expect(out.stderr).toContain("blocked");
    expect(await db.enquiry.count()).toBe(4);
  });

  it("refuses ad-hoc periods for deletion", async () => {
    await seed();
    const out = cli(["--execute", "--days", "1"], {
      ENQUIRY_RETENTION_DAYS: "365",
      RETENTION_POLICY_APPROVED: "true",
    });
    expect(out.status).toBe(1);
    expect(await db.enquiry.count()).toBe(4);
  });

  it("deletes with an approved, configured policy", async () => {
    await seed();
    const out = cli(["--execute"], {
      ENQUIRY_RETENTION_DAYS: "365",
      RETENTION_POLICY_APPROVED: "true",
    });
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('"deleted": 1');
    expect(out.stdout).not.toContain("example.com");
    expect(await db.enquiry.count()).toBe(3);
  });
});
