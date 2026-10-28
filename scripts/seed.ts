// Development seed data. Inserts clearly fictitious enquiries (example.com addresses) with
// outbox jobs that are already `sent` or `failed`, plus one email-draft copy (no outbox
// job), so the outbox worker never emails them.
// Idempotent: fixed idempotency keys, upserted on every run. Refused for production,
// staging and the Neon `production` branch.
//   npm run db:seed
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { readDatabaseUrl } = await import("@/server/config");
const { getDb, disconnectDb } = await import("@/server/db");
const { requestHash } = await import("@/server/enquiries/submit");
const { STAFF_NOTIFICATION } = await import("@/server/outbox/notification");
const { PRIVACY_NOTICE_VERSION } = await import("@/content/privacy");

const environment = process.env.SITE_ENVIRONMENT ?? "development";
if (["production", "staging"].includes(environment))
  throw new Error(`Refusing to seed while SITE_ENVIRONMENT=${environment}.`);
if (process.env.NEON_BRANCH === "production")
  throw new Error(
    "Refusing to seed the Neon production branch. Run `neon checkout development` first.",
  );

const day = 24 * 60 * 60 * 1000;
type Seed = {
  idempotencyKey: string;
  name: string;
  email: string;
  topic: "general" | "volunteer" | "partnership" | "donation";
  message: string;
  daysAgo: number;
  /** null: an email-draft copy, which never has an outbox job. */
  outbox: "sent" | "failed" | null;
};
const seeds: Seed[] = [
  {
    idempotencyKey: "00000000-0000-4000-8000-000000000001",
    name: "Sample Visitor (seed)",
    email: "seed-general@example.com",
    topic: "general",
    message:
      "Sample enquiry for development. I would like to learn more about the foundation's plans in Rukungiri.",
    daysAgo: 6,
    outbox: "sent",
  },
  {
    idempotencyKey: "00000000-0000-4000-8000-000000000002",
    name: "Sample Volunteer (seed)",
    email: "seed-volunteer@example.com",
    topic: "volunteer",
    message:
      "Sample enquiry for development. I am interested in volunteering with community conservation activities.",
    daysAgo: 4,
    outbox: "sent",
  },
  {
    idempotencyKey: "00000000-0000-4000-8000-000000000003",
    name: "Sample Partner Organisation (seed)",
    email: "seed-partnership@example.com",
    topic: "partnership",
    message:
      "Sample enquiry for development. Our organisation would like to discuss a possible partnership.",
    daysAgo: 2,
    outbox: "sent",
  },
  {
    idempotencyKey: "00000000-0000-4000-8000-000000000004",
    name: "Sample Donor (seed)",
    email: "seed-donation@example.com",
    topic: "donation",
    message:
      "Sample enquiry for development. How can I support the foundation's proposed work?",
    daysAgo: 1,
    outbox: "failed",
  },
  {
    idempotencyKey: "00000000-0000-4000-8000-000000000005",
    name: "Sample Email Draft (seed)",
    email: "seed-draft@example.com",
    topic: "general",
    message:
      "Sample enquiry for development, saved when the visitor prepared an email draft.",
    daysAgo: 0,
    outbox: null,
  },
];

const target = new URL(readDatabaseUrl());
console.log(
  `Seeding ${target.hostname}${target.pathname}${process.env.NEON_BRANCH ? ` (Neon branch ${process.env.NEON_BRANCH})` : ""}`,
);

let exitCode = 0;
try {
  const db = getDb();
  for (const seed of seeds) {
    const createdAt = new Date(Date.now() - seed.daysAgo * day);
    const channel = seed.outbox ? "online" : "email-draft";
    const fields = {
      // Same hash the app stores; the form-only fields are not part of it.
      requestHash: requestHash({
        ...seed,
        channel,
        consent: true,
        website: "",
        token: "",
      }),
      name: seed.name,
      email: seed.email,
      topic: seed.topic,
      channel: seed.outbox ? ("online" as const) : ("email_draft" as const),
      message: seed.message,
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    };
    const enquiry = await db.enquiry.upsert({
      where: { idempotencyKey: seed.idempotencyKey },
      create: { idempotencyKey: seed.idempotencyKey, createdAt, ...fields },
      update: fields,
    });
    if (!seed.outbox) {
      console.log(`  ${seed.topic.padEnd(11)} ${enquiry.id}  email draft`);
      continue;
    }
    const job =
      seed.outbox === "sent"
        ? {
            status: "sent" as const,
            attempts: 1,
            sentAt: new Date(createdAt.getTime() + 60_000),
            providerMessageId: `seed_${seed.topic}`,
            lastError: null,
          }
        : {
            status: "failed" as const,
            attempts: 8,
            sentAt: null,
            providerMessageId: null,
            lastError: "seed_example_failure",
          };
    await db.emailOutbox.upsert({
      where: {
        enquiryId_kind: { enquiryId: enquiry.id, kind: STAFF_NOTIFICATION },
      },
      create: {
        enquiryId: enquiry.id,
        kind: STAFF_NOTIFICATION,
        createdAt,
        ...job,
      },
      update: job,
    });
    console.log(
      `  ${seed.topic.padEnd(11)} ${enquiry.id}  outbox ${job.status}`,
    );
  }
  const [enquiries, outbox] = await Promise.all([
    db.enquiry.count(),
    db.emailOutbox.groupBy({ by: ["status"], _count: true }),
  ]);
  console.log(
    `Done. enquiries: ${enquiries}; outbox: ${outbox.map((o) => `${o.status} ${o._count}`).join(", ")}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await disconnectDb();
}
process.exit(exitCode);
