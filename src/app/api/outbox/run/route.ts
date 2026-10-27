import { createHash, timingSafeEqual } from "node:crypto";
import { readWorkerSecret } from "@/server/config";
import { runOutbox } from "@/server/outbox/run";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Worst case per run: 5 jobs × 10s provider timeout, inside a 60s function limit.
export const maxDuration = 60;
function json(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
function authorised(header: string | null, secret: string) {
  // Compare fixed-length digests so neither length nor content leaks through timing.
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(header ?? ""), digest(`Bearer ${secret}`));
}
// Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`. POST is accepted for
// other schedulers. Without a configured secret the endpoint is disabled.
async function handle(request: Request) {
  const secret = readWorkerSecret();
  if (!secret) return json({ error: "Worker trigger is not configured." }, 503);
  if (!authorised(request.headers.get("authorization"), secret))
    return json({ error: "Unauthorised." }, 401);
  const result = await runOutbox({ batchSize: 5, purge: true });
  return json(result, result.ok ? 200 : 503);
}
export const GET = handle;
export const POST = handle;
