/** One absolute deadline covers authentication, every provider call and DB bookkeeping.
 * DB calls cannot be aborted through Prisma; bounded pool/statement/transaction
 * timeouts and a completion reserve cover that limitation (see server/db.ts). */
export const DB_COMPLETION_RESERVE_MS = 4_000;
export const MIN_WORK_SLOT_MS = 16_000;

export class ExecutionBudget {
  readonly deadline: number;
  readonly signal: AbortSignal;
  constructor(
    ms: number,
    parent?: ExecutionBudget | AbortSignal,
    private readonly now = Date.now,
  ) {
    const duration = Math.max(
      1,
      Math.min(ms, parent instanceof ExecutionBudget ? parent.remaining() : ms),
    );
    this.deadline = now() + duration;
    const timeout = AbortSignal.timeout(Math.ceil(duration));
    this.signal = parent
      ? AbortSignal.any([
          parent instanceof ExecutionBudget ? parent.signal : parent,
          timeout,
        ])
      : timeout;
  }
  remaining() {
    return Math.max(0, this.deadline - this.now());
  }
  canStart(minimumMs = MIN_WORK_SLOT_MS) {
    return !this.signal.aborted && this.remaining() >= minimumMs;
  }
  child(ms: number) {
    return new ExecutionBudget(ms, this, this.now);
  }
  requestSignal(timeoutMs: number) {
    const available = this.remaining() - DB_COMPLETION_RESERVE_MS;
    if (available <= 0 || this.signal.aborted)
      throw new DOMException("Execution budget exhausted", "TimeoutError");
    return AbortSignal.any([
      this.signal,
      AbortSignal.timeout(
        Math.max(1, Math.ceil(Math.min(timeoutMs, available))),
      ),
    ]);
  }
}

/** Also bounds injected/third-party clients which ignore AbortSignal. Native fetch
 * still receives the signal so sockets and response streams are cancelled. */
export async function abortable<T>(
  work: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () =>
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([work(), aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export async function fetchJson(
  fetchImpl: typeof fetch,
  input: string | URL,
  init: RequestInit,
  timeoutMs: number,
  budget?: ExecutionBudget,
) {
  const signal = budget
    ? budget.requestSignal(Math.min(8000, timeoutMs))
    : AbortSignal.timeout(timeoutMs);
  return abortable(async () => {
    const response = await fetchImpl(input, { ...init, signal });
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        body = parsed as Record<string, unknown>;
    } catch (error) {
      if (signal.aborted) throw error;
    }
    return { response, body };
  }, signal);
}
