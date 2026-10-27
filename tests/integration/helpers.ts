import { inject, vi } from "vitest";
import { createDb, type Database } from "@/server/db";
import type { DeliveryConfig } from "@/server/config";
import type { SubmitDeps } from "@/server/enquiries/submit";
import { onlineConfig, origin } from "../support/fixtures";

export const db: Database = createDb(inject("testDatabaseUrl"));

export async function resetDatabase() {
  await db.$executeRawUnsafe(
    "TRUNCATE email_outbox, enquiries, rate_limit_buckets RESTART IDENTITY CASCADE",
  );
}

export const delivery: DeliveryConfig = {
  databaseUrl: inject("testDatabaseUrl"),
  resendApiKey: onlineConfig.resendApiKey,
  from: onlineConfig.from,
  to: onlineConfig.to,
  resendApiUrl: "https://api.resend.com/emails",
};

/** A Turnstile double that approves tokens for the configured host and action. */
export function turnstileOk() {
  return vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("siteverify"))
      return Response.json({
        success: true,
        hostname: "kctf.example",
        action: "enquiry",
      });
    throw new Error(`Unexpected request to ${String(url)}`);
  });
}

export function submitDeps(
  fetchImpl: typeof fetch = turnstileOk() as typeof fetch,
): SubmitDeps {
  return {
    siteOrigin: origin,
    readConfig: () => ({ mode: "online", issues: [], config: onlineConfig }),
    getDb: () => db,
    fetchImpl,
  };
}

export function enquiryInput(
  n: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    name: `Synthetic Visitor ${n}`,
    email: `visitor${n}@example.com`,
    topic: "general",
    message: `Synthetic enquiry number ${n} used only for automated tests.`,
    consent: true,
    website: "",
    token: `synthetic-token-${n}`,
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  };
}
