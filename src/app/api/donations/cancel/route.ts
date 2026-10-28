import { siteConfig } from "@/lib/seo";
import { getDb } from "@/server/db";
import { paymentsConfig } from "@/server/payments/config";
import { cancelDonation } from "@/server/payments/status";
export const runtime = "nodejs";
export const maxDuration = 30;
// The donor confirmed they do not want to continue: close the hosted checkout.
export async function POST(request: Request) {
  const { status, body } = await cancelDonation(request, {
    siteOrigin: siteConfig.origin,
    readConfig: paymentsConfig,
    getDb,
  });
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
