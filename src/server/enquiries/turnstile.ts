// Cloudflare Turnstile server-side verification: the token must be valid, issued for this
// site's hostname and for the expected action (`enquiry` or `donation`). Tokens are single-use and never logged.
export type TurnstileOutcome = "valid" | "invalid" | "unavailable";
import { fetchJson, type ExecutionBudget } from "@/server/execution-budget";

export async function verifyTurnstile({
  token,
  secret,
  hostname,
  verifyUrl,
  remoteIp,
  action = "enquiry",
  fetchImpl = fetch,
  budget,
}: {
  token: string;
  secret: string;
  hostname: string;
  verifyUrl: string;
  remoteIp?: string;
  action?: "enquiry" | "donation";
  fetchImpl?: typeof fetch;
  budget?: ExecutionBudget;
}): Promise<TurnstileOutcome> {
  if (!token) return "invalid";
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set("remoteip", remoteIp);
    const { response, body: result } = await fetchJson(
      fetchImpl,
      verifyUrl,
      {
        method: "POST",
        body,
      },
      10_000,
      budget,
    );
    if (!response.ok) return "unavailable";
    return result.success === true &&
      result.hostname === hostname &&
      result.action === action
      ? "valid"
      : "invalid";
  } catch {
    return "unavailable";
  }
}
