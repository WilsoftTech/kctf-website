// Shared abuse controls stored in Postgres so limits hold across serverless instances.
// Keys are HMAC-SHA256 digests under ABUSE_HASH_SECRET: raw IP and email addresses are
// never stored, and the digests cannot be reversed by enumerating the IPv4 space.
// Buckets expire within hours and are purged by the outbox worker.
import { createHmac } from "node:crypto";
import type { TrustedProxy } from "@/server/config";
import type { Database } from "@/server/db";

export type Limit = { key: string; limit: number; windowSeconds: number };

export const LIMITS = {
  ip: { limit: 5, windowSeconds: 600 },
  email: { limit: 3, windowSeconds: 3600 },
  global: { limit: 100, windowSeconds: 3600 },
} as const;

/**
 * Client IP according to the hosting platform's documented proxy behaviour.
 * - `vercel`: Vercel's edge overwrites `x-real-ip`/`x-forwarded-for` with the connecting
 *   client address, so the value cannot be spoofed by the visitor.
 * - `none`: no trusted proxy is declared, so forwarded headers are ignored entirely and
 *   per-IP limits are skipped (email and global limits still apply).
 */
export function clientIp(headers: Headers, trustedProxy: TrustedProxy) {
  if (trustedProxy !== "vercel") return undefined;
  const value =
    headers.get("x-real-ip") || headers.get("x-forwarded-for")?.split(",")[0];
  const ip = value?.trim();
  return ip && ip.length <= 45 && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : undefined;
}

export function abuseKey(kind: string, value: string, secret: string) {
  return `${kind}:${createHmac("sha256", secret).update(value).digest("hex")}`;
}

/** Separate counters for donation checkouts, so payments never use up enquiry limits. */
export const DONATION_LIMITS = {
  ip: { limit: 10, windowSeconds: 600 },
  email: { limit: 6, windowSeconds: 3600 },
  global: { limit: 300, windowSeconds: 3600 },
} as const;

export function limitsFor(
  { ip, email }: { ip?: string; email: string },
  secret: string,
  scope: "enquiry" | "donation" = "enquiry",
): Limit[] {
  // Enquiry keys keep their original, unprefixed names.
  const prefix = scope === "donation" ? "pay-" : "";
  const limits = scope === "donation" ? DONATION_LIMITS : LIMITS;
  return [
    ...(ip ? [{ key: abuseKey(`${prefix}ip`, ip, secret), ...limits.ip }] : []),
    {
      key: abuseKey(`${prefix}email`, email.toLowerCase(), secret),
      ...limits.email,
    },
    { key: `${prefix}global`, ...limits.global },
  ];
}

/** Atomically counts this attempt against every limit; false if any limit is exceeded. */
export async function consumeLimits(db: Database, limits: Limit[]) {
  let allowed = true;
  for (const { key, limit, windowSeconds } of limits) {
    const [row] = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO rate_limit_buckets (key, window_start, count, expires_at)
      VALUES (${key},
              date_bin(make_interval(secs => ${windowSeconds}), now(), TIMESTAMPTZ '2000-01-01'),
              1,
              date_bin(make_interval(secs => ${windowSeconds}), now(), TIMESTAMPTZ '2000-01-01')
                + make_interval(secs => ${windowSeconds * 2}))
      ON CONFLICT (key, window_start)
      DO UPDATE SET count = rate_limit_buckets.count + 1
      RETURNING count`;
    if (row.count > limit) allowed = false;
  }
  return allowed;
}
