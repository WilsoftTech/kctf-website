// Enquiry retention. Nothing here runs on a schedule: deletion happens only when an
// operator runs `npm run retention -- --execute` with an approved, configured period.
// Enquiries whose staff notification has not been sent are held back by default so a
// record is never deleted before anyone has seen it.
import type { Database } from "@/server/db";

export type RetentionPlan = {
  days: number;
  cutoff: Date;
  eligible: number;
  heldBackUndelivered: number;
};

function eligibleFilter(includeUndelivered: boolean) {
  return includeUndelivered
    ? {}
    : { outbox: { every: { status: "sent" as const } } };
}

export async function planRetention(
  db: Database,
  {
    days,
    includeUndelivered = false,
  }: { days: number; includeUndelivered?: boolean },
): Promise<RetentionPlan> {
  const [{ cutoff }] = await db.$queryRaw<{ cutoff: Date }[]>`
    SELECT now() - make_interval(days => ${days}) AS cutoff`;
  const old = { createdAt: { lt: cutoff } };
  const [eligible, all] = await Promise.all([
    db.enquiry.count({
      where: { ...old, ...eligibleFilter(includeUndelivered) },
    }),
    db.enquiry.count({ where: old }),
  ]);
  return { days, cutoff, eligible, heldBackUndelivered: all - eligible };
}

/** Deletes in bounded batches; outbox rows cascade with their enquiry. */
export async function executeRetention(
  db: Database,
  {
    days,
    includeUndelivered = false,
    batchSize = 500,
  }: { days: number; includeUndelivered?: boolean; batchSize?: number },
) {
  const plan = await planRetention(db, { days, includeUndelivered });
  const where = {
    createdAt: { lt: plan.cutoff },
    ...eligibleFilter(includeUndelivered),
  };
  let deleted = 0;
  while (true) {
    const batch = await db.enquiry.findMany({
      where,
      select: { id: true },
      take: batchSize,
      orderBy: { createdAt: "asc" },
    });
    if (!batch.length) break;
    const { count } = await db.enquiry.deleteMany({
      // Re-apply the filter in case a job was requeued since the batch was read.
      where: { ...where, id: { in: batch.map((e) => e.id) } },
    });
    deleted += count;
  }
  const expiredLimits =
    await db.$executeRaw`DELETE FROM rate_limit_buckets WHERE expires_at < now()`;
  return { plan, deleted, expiredLimits };
}
