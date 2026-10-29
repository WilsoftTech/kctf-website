// Accounting annotation only. This module never calls a refund/provider endpoint.
import { z } from "zod";
import type { Database } from "@/server/db";
const inputSchema = z.object({
  reference: z.string().regex(/^KCTF-D-[0-9A-Z]{8}$/),
  providerReference: z.string().regex(/^[A-Za-z0-9:_-]{3,255}$/),
  amountMinor: z.number().int().positive(),
  mode: z.enum(["test", "live"]),
  operator: z.string().regex(/^[A-Za-z0-9_-]{3,64}$/),
  reason: z.string().regex(/^[a-z0-9_]{3,64}$/),
});
export async function recordPesapalRefund(
  db: Database,
  input: unknown,
  execute = false,
) {
  const data = inputSchema.parse(input);
  if (!execute) return { dryRun: true, ...data };
  return db.$transaction(async (tx) => {
    // One confirmed provider reference cannot be assigned concurrently to different
    // donations (even with different amounts). Serialize that identity before rows.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pesapal-refund/${data.providerReference}`}, 0))::text`;
    // Serialise accounting edits for this donation; no network I/O inside the lock.
    await tx.$queryRaw`SELECT id FROM donations WHERE reference = ${data.reference} FOR UPDATE`;
    const row = await tx.donation.findUniqueOrThrow({
      where: { reference: data.reference },
    });
    if (
      row.provider !== "pesapal" ||
      row.mode !== data.mode ||
      row.collectedMinor <= 0
    )
      throw new Error("manual_refund_wrong_payment");
    const existing = await tx.paymentAdjustment.findFirst({
      where: {
        provider: "pesapal",
        externalId: data.providerReference,
        kind: "refund",
      },
    });
    if (existing) {
      if (
        existing.donationId !== row.id ||
        existing.amountMinor !== data.amountMinor
      )
        throw new Error("manual_refund_reference_conflict");
      return { duplicate: true, reference: data.reference };
    }
    const refundedMinor = row.refundedMinor + data.amountMinor;
    if (refundedMinor > row.collectedMinor)
      throw new Error("manual_refund_exceeds_collection");
    await tx.paymentAdjustment.create({
      data: {
        donationId: row.id,
        provider: "pesapal",
        externalId: data.providerReference,
        kind: "refund",
        status: "succeeded",
        source: "operator",
        amountMinor: data.amountMinor,
        currency: row.currency,
        recordedBy: data.operator,
        reason: data.reason,
      },
    });
    await tx.donation.update({
      where: { id: row.id },
      data: {
        refundedMinor,
        refundState: refundedMinor === row.collectedMinor ? "full" : "partial",
        financialVersion: { increment: 1 },
        financialCheckedAt: new Date(),
        // Reversal/refund overlap must still be reviewed; never silently clear it.
      },
    });
    return { recorded: true, reference: data.reference, refundedMinor };
  });
}
