import { after } from "next/server";
import { getDb } from "@/server/db";
import { runOutbox } from "@/server/outbox/run";
import { paymentsConfig } from "@/server/payments/config";
import { handleStripeWebhook } from "@/server/payments/webhooks";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
// Stripe webhook endpoint. The handler reads the raw body itself for signature checks.
export async function POST(request: Request) {
  const { status, body } = await handleStripeWebhook(request, {
    readConfig: paymentsConfig,
    getDb,
  });
  // A confirmed donation queues its emails; try them once the response is sent.
  if (status === 200) after(() => runOutbox({ batchSize: 3 }));
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
