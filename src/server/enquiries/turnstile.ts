// Cloudflare Turnstile server-side verification: the token must be valid, issued for this
// site's hostname and for the `enquiry` action. Tokens are single-use and never logged.
export type TurnstileOutcome = "valid" | "invalid" | "unavailable";

export async function verifyTurnstile({
  token,
  secret,
  hostname,
  verifyUrl,
  remoteIp,
  fetchImpl = fetch,
}: {
  token: string;
  secret: string;
  hostname: string;
  verifyUrl: string;
  remoteIp?: string;
  fetchImpl?: typeof fetch;
}): Promise<TurnstileOutcome> {
  if (!token) return "invalid";
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    const response = await fetchImpl(verifyUrl, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return "unavailable";
    const result = (await response.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
    };
    return result.success === true &&
      result.hostname === hostname &&
      result.action === "enquiry"
      ? "valid"
      : "invalid";
  } catch {
    return "unavailable";
  }
}
