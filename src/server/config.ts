// Validated, server-only configuration. Issue messages name variables and the rule they
// break, never their values, so they are safe to log and to show operators.
import "server-only";
import { z } from "zod";
import { readSiteConfig, type SiteEnvironment } from "@/lib/site-config";
import { log } from "@/server/log";

type Env = Record<string, string | undefined>;

export type TrustedProxy = "vercel" | "none";

/** What the outbox worker needs. Independent of the public form switch. */
export type DeliveryConfig = {
  databaseUrl: string;
  resendApiKey: string;
  from: string;
  to: string[];
  resendApiUrl: string;
};

export type EnquiryConfig = DeliveryConfig & {
  environment: SiteEnvironment;
  siteOrigin: string;
  siteHostname: string;
  turnstileSiteKey: string;
  turnstileSecret: string;
  abuseHashSecret: string;
  trustedProxy: TrustedProxy;
  retentionDays: number;
  turnstileVerifyUrl: string;
};

/**
 * - `online`: database-backed submission is fully configured.
 * - `email-draft`: online submission is deliberately switched off (ENQUIRIES_ENABLED≠true);
 *   the form prepares a draft in the visitor's own email app.
 * - `unavailable`: online submission is switched on but misconfigured. The form says so
 *   and offers direct email; it never silently degrades to draft mode.
 */
export type EnquiryMode = "online" | "email-draft" | "unavailable";
export type EnquiryConfigResult =
  | { mode: "online"; config: EnquiryConfig; issues: [] }
  | { mode: "email-draft" | "unavailable"; issues: string[] };

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const RESEND_API_URL = "https://api.resend.com/emails";

const email = z.email().max(254);
const mailbox = z
  .string()
  .trim()
  .refine((value) => {
    const match = value.match(/^(?:[^<>\r\n]{1,100}<([^<>\s]+)>|([^<>\s]+))$/);
    return !!match && email.safeParse(match[1] ?? match[2]).success;
  });

function isLoopbackUrl(value: string) {
  try {
    const { hostname } = new URL(value);
    return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  } catch {
    return false;
  }
}

function environmentOf(env: Env): SiteEnvironment | undefined {
  try {
    return readSiteConfig(env).environment;
  } catch {
    return undefined;
  }
}

/** Local test doubles (Turnstile/Resend) are accepted only in development and test. */
function testOverride(
  env: Env,
  key: "TURNSTILE_VERIFY_URL" | "RESEND_API_URL",
  issues: string[],
): string | undefined {
  const value = env[key];
  if (!value) return undefined;
  const environment = environmentOf(env);
  if (!environment || !["development", "test"].includes(environment))
    issues.push(`${key} is only allowed in development and test.`);
  else if (!isLoopbackUrl(value))
    issues.push(`${key} must be a local (loopback) URL.`);
  else return value;
  return undefined;
}

export function readDatabaseUrl(env: Env = process.env): string {
  const value = env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not set.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL must be a postgresql:// URL.");
  const environment = environmentOf(env);
  if (
    (environment === "production" || environment === "staging") &&
    isLoopbackUrl(value)
  )
    throw new Error("DATABASE_URL must not point to a local database here.");
  return value;
}

export type RetentionConfig = {
  days: number | undefined;
  approved: boolean;
  issues: string[];
};

/** No default period: the foundation must supply and approve one. */
export function readRetentionConfig(env: Env = process.env): RetentionConfig {
  const issues: string[] = [];
  const raw = env.ENQUIRY_RETENTION_DAYS?.trim();
  let days: number | undefined;
  if (!raw) issues.push("ENQUIRY_RETENTION_DAYS is not set.");
  else if (!/^\d+$/.test(raw) || +raw < 1 || +raw > 3650)
    issues.push(
      "ENQUIRY_RETENTION_DAYS must be a whole number from 1 to 3650.",
    );
  else days = Number(raw);
  const approved = env.RETENTION_POLICY_APPROVED === "true";
  if (!approved)
    issues.push(
      "RETENTION_POLICY_APPROVED must be `true` once the foundation has approved the retention policy.",
    );
  return { days, approved, issues };
}

export function readDeliveryConfig(env: Env = process.env): {
  config?: DeliveryConfig;
  issues: string[];
} {
  const issues: string[] = [];
  let databaseUrl = "";
  try {
    databaseUrl = readDatabaseUrl(env);
  } catch (error) {
    issues.push((error as Error).message);
  }
  const resendApiKey = env.RESEND_API_KEY ?? "";
  if (!/^re_[A-Za-z0-9_]{8,}$/.test(resendApiKey))
    issues.push("RESEND_API_KEY must be a Resend API key (re_…).");
  const from = env.ENQUIRY_FROM?.trim() ?? "";
  if (!mailbox.safeParse(from).success)
    issues.push(
      "ENQUIRY_FROM must be a verified sender such as `KCTF Website <enquiries@example.org>`.",
    );
  const to = (env.ENQUIRY_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    !to.length ||
    to.length > 5 ||
    !to.every((a) => email.safeParse(a).success)
  )
    issues.push(
      "ENQUIRY_TO must list 1–5 staff email addresses, comma-separated.",
    );
  const resendApiUrl =
    testOverride(env, "RESEND_API_URL", issues) ?? RESEND_API_URL;
  if (issues.length) return { issues };
  return {
    issues,
    config: { databaseUrl, resendApiKey, from, to, resendApiUrl },
  };
}

export function readEnquiryConfig(env: Env = process.env): EnquiryConfigResult {
  const switchValue = env.ENQUIRIES_ENABLED ?? "";
  if (switchValue === "" || switchValue === "false")
    return { mode: "email-draft", issues: [] };
  if (switchValue !== "true")
    return {
      mode: "unavailable",
      issues: ["ENQUIRIES_ENABLED must be `true` or `false`."],
    };

  const issues: string[] = [];
  let environment: SiteEnvironment = "development";
  let siteOrigin = "";
  try {
    const site = readSiteConfig(env);
    environment = site.environment;
    siteOrigin = site.origin;
    if (!env.SITE_URL)
      issues.push("SITE_URL is required for online enquiries.");
  } catch (error) {
    issues.push((error as Error).message);
  }

  const delivery = readDeliveryConfig(env);
  issues.push(...delivery.issues);

  // Read on the server per request and passed to the form as a prop. No client code
  // references process.env.NEXT_PUBLIC_*, so the key is not inlined at build time.
  const turnstileSiteKey = env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const turnstileSecret = env.TURNSTILE_SECRET_KEY ?? "";
  if (!turnstileSiteKey)
    issues.push("NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set.");
  if (!turnstileSecret) issues.push("TURNSTILE_SECRET_KEY is not set.");

  const abuseHashSecret = env.ABUSE_HASH_SECRET ?? "";
  if (abuseHashSecret.length < 32)
    issues.push("ABUSE_HASH_SECRET must be at least 32 characters.");
  const trustedProxy = (env.TRUSTED_PROXY || "none") as TrustedProxy;
  if (!["vercel", "none"].includes(trustedProxy))
    issues.push("TRUSTED_PROXY must be `vercel` or `none`.");

  // Privacy gate: public collection stays off until retention is supplied and approved.
  const retention = readRetentionConfig(env);
  issues.push(...retention.issues);

  const turnstileVerifyUrl =
    testOverride(env, "TURNSTILE_VERIFY_URL", issues) ?? TURNSTILE_VERIFY_URL;

  if (issues.length || !delivery.config) return { mode: "unavailable", issues };
  return {
    mode: "online",
    issues: [],
    config: {
      ...delivery.config,
      environment,
      siteOrigin,
      siteHostname: new URL(siteOrigin).hostname,
      turnstileSiteKey,
      turnstileSecret,
      abuseHashSecret,
      trustedProxy,
      retentionDays: retention.days!,
      turnstileVerifyUrl,
    },
  };
}

let reported = "";
/** Reads enquiry configuration and logs misconfiguration once per distinct issue set. */
export function enquiryConfig(env: Env = process.env): EnquiryConfigResult {
  const result = readEnquiryConfig(env);
  if (result.mode === "unavailable") {
    const missing = result.issues.join(" ");
    if (missing !== reported) {
      reported = missing;
      log("error", "enquiry_config_invalid", { missing });
    }
  }
  return result;
}

/** Shared secret for the HTTP outbox trigger. Undefined disables the endpoint. */
export function readWorkerSecret(env: Env = process.env): string | undefined {
  const secret = env.CRON_SECRET;
  return secret && secret.length >= 32 ? secret : undefined;
}
