export function enquiriesEnabled() {
  return (
    process.env.ENQUIRIES_ENABLED === "true" &&
    !!process.env.RESEND_API_KEY &&
    !!process.env.ENQUIRY_FROM &&
    !!process.env.SITE_URL &&
    !!process.env.TURNSTILE_SECRET_KEY &&
    !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  );
}
// A small per-process circuit against bursts. Turnstile is required for public delivery;
// this map is NOT a distributed quota and does not persist personal information.
const buckets = new Map<string, { count: number; until: number }>();
export function rateLimit(key: string, now = Date.now()) {
  for (const [k, v] of buckets) {
    if (v.until <= now) buckets.delete(k);
  }
  const previous = buckets.get(key);
  if (previous && previous.count >= 5) return false;
  if (!previous && buckets.size >= 5000) return false;
  buckets.set(key, {
    count: (previous?.count || 0) + 1,
    until: previous?.until || now + 60000,
  });
  return true;
}
