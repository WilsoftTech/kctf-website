import { after } from "next/server";
import { siteConfig } from "@/lib/seo";
import { enquiryConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { submitEnquiry } from "@/server/enquiries/submit";
import { runOutbox } from "@/server/outbox/run";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const { status, body, queued } = await submitEnquiry(request, {
    siteOrigin: siteConfig.origin,
    readConfig: enquiryConfig,
    getDb,
  });
  // Fast path: try the notification once the visitor has their answer. If this does
  // not finish, the scheduled worker picks the job up; the enquiry is already saved.
  if (queued) after(() => runOutbox({ batchSize: 3 }));
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
