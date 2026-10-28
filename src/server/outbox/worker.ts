// Outbox worker. Jobs are claimed in bounded batches with FOR UPDATE SKIP LOCKED, so
// concurrent workers never claim the same job at the same time. Each claim records a
// claim_token; every completion update is fenced on it, so a worker whose lease expired
// cannot overwrite the result of the worker that recovered the job. Delivery is
// at-least-once with provider-side idempotency — not exactly-once.
import { randomUUID } from "node:crypto";
import type { DeliveryConfig } from "@/server/config";
import type { Database } from "@/server/db";
import { log, safeErrorCode } from "@/server/log";
import {
  buildDonationEmail,
  buildStaffNotification,
} from "@/server/outbox/notification";
import { sendWithResend } from "@/server/outbox/resend";

export const DEFAULT_BATCH_SIZE = 10;
/** Must comfortably exceed batchSize × provider timeout (10 × 10s). */
export const DEFAULT_LEASE_SECONDS = 600;
const BASE_DELAY_MS = 60_000;
const MAX_DELAY_MS = 6 * 60 * 60_000;

export type OutboxSummary = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  recovered: number;
  lost: number;
};

/** Exponential backoff with up to 20% jitter: 1, 2, 4 … minutes, capped at 6 hours. */
export function retryDelayMs(attempt: number, random = Math.random) {
  const base = Math.min(
    BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
    MAX_DELAY_MS,
  );
  return Math.round(base * (1 + random() * 0.2));
}

type ClaimedJob = {
  id: string;
  enquiryId: string | null;
  donationId: string | null;
  kind: string;
  attempts: number;
  maxAttempts: number;
  previous: string;
};

export async function processOutbox(
  deps: { db: Database; delivery: DeliveryConfig; fetchImpl?: typeof fetch },
  {
    batchSize = DEFAULT_BATCH_SIZE,
    leaseSeconds = DEFAULT_LEASE_SECONDS,
    providerTimeoutMs = 10_000,
  }: {
    batchSize?: number;
    leaseSeconds?: number;
    providerTimeoutMs?: number;
  } = {},
): Promise<OutboxSummary> {
  const { db, delivery } = deps;
  const limit = Math.max(1, Math.min(batchSize, 50));
  const summary: OutboxSummary = {
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    recovered: 0,
    lost: 0,
  };

  // Stale claims whose final attempt never reported back become visible failures.
  const exhausted = await db.$executeRaw`
    UPDATE email_outbox
       SET status = 'failed', last_error = 'lease_expired_after_final_attempt',
           claim_token = NULL, claimed_at = NULL, updated_at = now()
     WHERE status = 'processing'
       AND claimed_at < now() - make_interval(secs => ${leaseSeconds})
       AND attempts >= max_attempts`;
  summary.failed += exhausted;

  const token = randomUUID();
  const jobs = await db.$queryRaw<ClaimedJob[]>`
    WITH due AS (
      SELECT id, status AS previous
        FROM email_outbox
       WHERE attempts < max_attempts
         AND ((status = 'pending' AND next_attempt_at <= now())
           OR (status = 'processing'
               AND claimed_at < now() - make_interval(secs => ${leaseSeconds})))
       ORDER BY next_attempt_at, id
       LIMIT ${limit}
       FOR UPDATE SKIP LOCKED
    )
    UPDATE email_outbox o
       SET status = 'processing', claim_token = ${token}::uuid, claimed_at = now(),
           attempts = o.attempts + 1, updated_at = now()
      FROM due
     WHERE o.id = due.id
 RETURNING o.id, o.enquiry_id AS "enquiryId", o.donation_id AS "donationId", o.kind, o.attempts,
           o.max_attempts AS "maxAttempts", due.previous::text AS previous`;
  summary.claimed = jobs.length;

  for (const job of jobs) {
    if (job.previous === "processing") {
      summary.recovered++;
      log("warn", "outbox_stale_claim_recovered", {
        outboxId: job.id,
        attempt: job.attempts,
      });
    }
    const fenced = { id: job.id, claimToken: token };
    // Each job belongs to exactly one enquiry or one (verified, succeeded) donation.
    let payload: object | undefined;
    let missing = "enquiry_missing";
    if (job.enquiryId) {
      const enquiry = await db.enquiry.findUnique({
        where: { id: job.enquiryId },
      });
      if (enquiry) payload = buildStaffNotification(enquiry, delivery);
    } else if (job.donationId) {
      missing = "donation_missing";
      const donation = await db.donation.findUnique({
        where: { id: job.donationId },
      });
      // Only a confirmed donation is ever announced, even if a job exists.
      if (donation?.status === "succeeded")
        payload = buildDonationEmail(job.kind, donation, delivery);
      else if (donation) missing = "donation_not_succeeded";
    }
    if (!payload) {
      await db.emailOutbox.updateMany({
        where: fenced,
        data: {
          status: "failed",
          lastError: missing,
          claimToken: null,
          claimedAt: null,
        },
      });
      summary.failed++;
      continue;
    }

    let result: Awaited<ReturnType<typeof sendWithResend>>;
    try {
      result = await sendWithResend({
        apiUrl: delivery.resendApiUrl,
        apiKey: delivery.resendApiKey,
        idempotencyKey: `kctf-outbox/${job.id}`,
        payload,
        fetchImpl: deps.fetchImpl,
        timeoutMs: providerTimeoutMs,
      });
    } catch (error) {
      result = { kind: "retryable", code: safeErrorCode(error) };
    }

    let data;
    if (result.kind === "accepted") {
      data = {
        status: "sent" as const,
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
        lastError: null,
      };
    } else if (result.kind === "retryable" && job.attempts < job.maxAttempts) {
      data = {
        status: "pending" as const,
        nextAttemptAt: new Date(Date.now() + retryDelayMs(job.attempts)),
        lastError: result.code,
      };
    } else {
      data = { status: "failed" as const, lastError: result.code };
    }
    const updated = await db.emailOutbox.updateMany({
      where: fenced,
      data: { ...data, claimToken: null, claimedAt: null },
    });
    if (updated.count === 0) {
      // Our lease expired and another worker took over; its result stands.
      summary.lost++;
      log("warn", "outbox_claim_lost", {
        outboxId: job.id,
        attempt: job.attempts,
      });
      continue;
    }
    if (data.status === "sent") summary.sent++;
    else if (data.status === "pending") summary.retried++;
    else summary.failed++;
    log(data.status === "failed" ? "error" : "info", `outbox_${data.status}`, {
      outboxId: job.id,
      enquiryId: job.enquiryId ?? undefined,
      donationId: job.donationId ?? undefined,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
      code: result.kind === "accepted" ? undefined : result.code,
      httpStatus: result.kind === "accepted" ? undefined : result.httpStatus,
    });
  }
  return summary;
}

/** Abuse counters are short-lived; delete expired windows so they are not kept indefinitely. */
export async function purgeExpiredRateLimits(db: Database) {
  return db.$executeRaw`DELETE FROM rate_limit_buckets WHERE expires_at < now()`;
}

export async function outboxStatus(db: Database) {
  const rows = await db.$queryRaw<
    { status: string; count: bigint; oldest: Date | null }[]
  >`SELECT status::text AS status, count(*) AS count, min(created_at) AS oldest
      FROM email_outbox GROUP BY status ORDER BY status`;
  return rows.map((r) => ({
    status: r.status,
    count: Number(r.count),
    oldest: r.oldest,
  }));
}

/** Returns failed jobs to the queue with a fresh attempt budget. Operator action only. */
export async function requeueFailed(db: Database, ids?: string[]) {
  const result = await db.emailOutbox.updateMany({
    where: { status: "failed", ...(ids?.length ? { id: { in: ids } } : {}) },
    data: {
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(),
      claimToken: null,
      claimedAt: null,
    },
  });
  return result.count;
}
