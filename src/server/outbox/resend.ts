// Minimal Resend REST client. Every send carries a stable Idempotency-Key per outbox job,
// so a retry after an uncertain result (timeout, lost response, reclaimed lease) is
// deduplicated by Resend for as long as Resend retains the key (24 hours at the time of
// writing). Outside that window a retry can produce a second email; see docs/OPERATIONS.md.

export type SendResult =
  | { kind: "accepted"; providerMessageId: string | null }
  | { kind: "retryable"; code: string; httpStatus?: number }
  | { kind: "permanent"; code: string; httpStatus?: number };

import { fetchJson, type ExecutionBudget } from "@/server/execution-budget";
const SAFE_CODE = /^[a-z0-9_]{1,60}$/;

export async function sendWithResend({
  apiUrl,
  apiKey,
  idempotencyKey,
  payload,
  fetchImpl = fetch,
  timeoutMs = 10_000,
  budget,
}: {
  apiUrl: string;
  apiKey: string;
  idempotencyKey: string;
  payload: object;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  budget?: ExecutionBudget;
}): Promise<SendResult> {
  let response: Response;
  let body: { id?: unknown; name?: unknown } = {};
  try {
    const result = await fetchJson(
      fetchImpl,
      apiUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      },
      timeoutMs,
      budget,
    );
    response = result.response;
    body = result.body;
  } catch (error) {
    // The provider may or may not have accepted the message: retry under the same key.
    const name = (error as { name?: string })?.name;
    return {
      kind: "retryable",
      code: name === "TimeoutError" ? "provider_timeout" : "provider_network",
    };
  }
  if (response.ok)
    return {
      kind: "accepted",
      providerMessageId:
        typeof body.id === "string" ? body.id.slice(0, 128) : null,
    };
  const providerCode =
    typeof body.name === "string" && SAFE_CODE.test(body.name)
      ? body.name
      : `http_${response.status}`;
  const status = response.status;
  // 409: concurrent request with the same key is still in flight, or key/payload mismatch.
  if (status === 408 || status === 409 || status === 429 || status >= 500)
    return { kind: "retryable", code: providerCode, httpStatus: status };
  return { kind: "permanent", code: providerCode, httpStatus: status };
}
