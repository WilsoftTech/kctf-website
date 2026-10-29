import { after } from "next/server";
import { siteConfig } from "@/lib/seo";
import { enquiryConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { submitEnquiry } from "@/server/enquiries/submit";
import { runOutbox } from "@/server/outbox/run";
import { ExecutionBudget } from "@/server/execution-budget";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const budget = new ExecutionBudget(50_000, request.signal);
  const { status, body, queued } = await submitEnquiry(request, {
    siteOrigin: siteConfig.origin,
    readConfig: enquiryConfig,
    getDb,
  });
  // Fast path: try the notification once the visitor has their answer. If this does
  // not finish, the scheduled worker picks the job up; the enquiry is already saved.
  if (queued)
    after(() => runOutbox({ batchSize: 3, budget: budget.child(35_000) }));
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
