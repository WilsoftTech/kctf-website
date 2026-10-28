import { siteConfig } from "@/lib/seo";
import { getDb } from "@/server/db";
import { startDonation } from "@/server/payments/create";
import { paymentsConfig } from "@/server/payments/config";
export const runtime = "nodejs";
export const maxDuration = 30;
// Starts an online donation and returns the provider's hosted checkout URL.
export async function POST(request: Request) {
  const { status, body } = await startDonation(request, {
    siteOrigin: siteConfig.origin,
    readConfig: paymentsConfig,
    getDb,
  });
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
