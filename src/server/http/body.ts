import { abortable } from "@/server/execution-budget";

/** Bounded binary reader shared by public submissions and signed webhooks. */
export async function readLimitedBytes(
  request: Pick<Request, "body" | "headers"> & { signal?: AbortSignal },
  limit: number,
  signal = request.signal,
): Promise<{ bytes: Uint8Array } | { tooLarge: true }> {
  if (Number(request.headers.get("content-length") || 0) > limit) {
    void request.body?.cancel().catch(() => {});
    return { tooLarge: true };
  }
  const reader = request.body?.getReader();
  if (!reader) return { bytes: new Uint8Array() };
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = signal
        ? await abortable(() => reader.read(), signal)
        : await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        void reader.cancel().catch(() => {});
        return { tooLarge: true };
      }
      parts.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return { bytes };
}

export async function readLimitedText(request: Request, limit: number) {
  const body = await readLimitedBytes(request, limit);
  return "tooLarge" in body
    ? body
    : { text: new TextDecoder("utf-8", { fatal: true }).decode(body.bytes) };
}
