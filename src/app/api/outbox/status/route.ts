import { getDb } from "@/server/db";
import { workerAuthentication } from "@/server/workers/auth";
import { backgroundStatus } from "@/server/workers/status";
import { log, safeErrorCode } from "@/server/log";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;
export async function GET(request: Request) {
  const auth = workerAuthentication(request);
  if (auth !== 200)
    return Response.json(
      { error: auth === 401 ? "Unauthorised." : "Not configured." },
      { status: auth, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const result = await backgroundStatus(getDb());
    return Response.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    log("error", "worker_status_failed", { code: safeErrorCode(error) });
    return Response.json(
      { ok: false, alerts: ["database_unavailable"] },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
