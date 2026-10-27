// Synthetic test data only. No real people, addresses or credentials.
import type { EnquiryConfig } from "@/server/config";

export const origin = "https://kctf.example";

export const valid = {
  name: "Synthetic Visitor",
  email: "visitor@example.com",
  topic: "general",
  message: "A synthetic enquiry used only for automated tests.",
  consent: true,
  website: "",
  token: "synthetic-turnstile-token",
  idempotencyKey: "0b8a3c1e-5d4f-4a7b-9c2e-1f0a2b3c4d5e",
};

export function request(
  data: unknown = valid,
  headers: Record<string, string> = {},
) {
  return new Request(`${origin}/api/enquiries`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: typeof data === "string" ? data : JSON.stringify(data),
  });
}

export const onlineConfig: EnquiryConfig = {
  environment: "test",
  siteOrigin: origin,
  siteHostname: "kctf.example",
  databaseUrl: "postgresql://synthetic:synthetic@localhost:5432/synthetic",
  resendApiKey: "re_synthetic_key",
  from: "KCTF Website <website@kctf.example>",
  to: ["staff@kctf.example"],
  resendApiUrl: "https://api.resend.com/emails",
  turnstileSiteKey: "synthetic-site-key",
  turnstileSecret: "synthetic-turnstile-secret",
  abuseHashSecret: "synthetic-abuse-hash-secret-0123456789",
  trustedProxy: "vercel",
  retentionDays: 30,
  turnstileVerifyUrl:
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
};

/** A complete, valid environment for online enquiries (synthetic values). */
export const onlineEnv: Record<string, string> = {
  SITE_ENVIRONMENT: "production",
  SITE_URL: origin,
  SITE_INDEXING: "index",
  ENQUIRIES_ENABLED: "true",
  DATABASE_URL:
    "postgresql://synthetic:synthetic@ep-synthetic-pooler.example.neon.tech/kctf?sslmode=require",
  RESEND_API_KEY: "re_synthetic_key",
  ENQUIRY_FROM: "KCTF Website <website@kctf.example>",
  ENQUIRY_TO: "staff@kctf.example",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "synthetic-site-key",
  TURNSTILE_SECRET_KEY: "synthetic-turnstile-secret",
  ABUSE_HASH_SECRET: "synthetic-abuse-hash-secret-0123456789",
  TRUSTED_PROXY: "vercel",
  ENQUIRY_RETENTION_DAYS: "30",
  RETENTION_POLICY_APPROVED: "true",
};
