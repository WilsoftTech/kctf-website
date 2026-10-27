// Operational logging with an allowlist. Form contents, email addresses, names, tokens,
// secrets, connection strings and IP addresses must never be passed here. Fields are
// restricted to identifiers, counts and short error codes; unknown error messages are
// reduced to a class name because driver/provider messages can embed secrets or input.

type Value = string | number | boolean | null | undefined;
const SAFE_FIELDS = new Set([
  "enquiryId",
  "outboxId",
  "attempt",
  "maxAttempts",
  "status",
  "code",
  "httpStatus",
  "claimed",
  "sent",
  "retried",
  "failed",
  "recovered",
  "lost",
  "durationMs",
  "deleted",
  "limit",
  "mode",
  "missing",
  "replay",
]);

export function safeErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(code))
      return code;
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string" && /^[A-Za-z]{1,40}$/.test(name)) return name;
  }
  return "unknown_error";
}

export function log(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, Value> = {},
) {
  const entry: Record<string, Value> = { level, event };
  for (const [key, value] of Object.entries(fields))
    if (SAFE_FIELDS.has(key) && value !== undefined) entry[key] = value;
  const line = JSON.stringify({ time: new Date().toISOString(), ...entry });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
