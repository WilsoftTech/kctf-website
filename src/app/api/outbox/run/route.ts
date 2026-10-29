import { workerAuthentication } from "@/server/workers/auth";
import { runBackgroundWorker } from "@/server/workers/run";
import { ExecutionBudget } from "@/server/execution-budget";
import { log, safeErrorCode } from "@/server/log";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Parent deadline 50s, phase caps 45s/35s, with reserves for DB and response work.
export const maxDuration = 60;
function json(body: object, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
// Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`. POST is accepted for
// other schedulers. Without a configured secret the endpoint is disabled.
async function handle(request: Request) {
  const budget = new ExecutionBudget(50_000, request.signal);
  const auth = workerAuthentication(request);
  if (auth !== 200)
    return json(
      {
        error:
          auth === 401 ? "Unauthorised." : "Worker trigger is not configured.",
      },
      auth,
    );
  try {
    const result = await runBackgroundWorker({ budget });
    return json(
      result,
      result.ok ? 200 : result.status === "partial" ? 207 : 503,
    );
  } catch (error) {
    log("error", "worker_failed", { code: safeErrorCode(error) });
    return json({ ok: false, status: "failed" }, 503);
  }
}
export const GET = handle;
export const POST = handle;
