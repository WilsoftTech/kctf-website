import { siteConfig } from "@/lib/seo";
import { getDb } from "@/server/db";
import { paymentsConfig } from "@/server/payments/config";
import { donationStatus } from "@/server/payments/status";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
// Public, token-keyed status for the donation status page. No donor details.
export async function GET(request: Request) {
  const { status, body } = await donationStatus(new URL(request.url), {
    siteOrigin: siteConfig.origin,
    readConfig: paymentsConfig,
    getDb,
  });
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
