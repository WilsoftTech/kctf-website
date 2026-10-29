import { after } from "next/server";
import { getDb } from "@/server/db";
import { runOutbox } from "@/server/outbox/run";
import { paymentsConfig } from "@/server/payments/config";
import { handlePesapalIpn, parsePesapalBody } from "@/server/payments/webhooks";
import { ExecutionBudget } from "@/server/execution-budget";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const deps = { readConfig: paymentsConfig, getDb };
function respond(
  { status, body }: { status: number; body: object },
  budget: ExecutionBudget,
) {
  if (status === 200)
    after(() => runOutbox({ batchSize: 3, budget: budget.child(20_000) }));
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
// Pesapal IPN, registered as GET (query string) or POST (JSON or form body).
export async function GET(request: Request) {
  const budget = new ExecutionBudget(25_000, request.signal);
  return respond(
    await handlePesapalIpn(new URL(request.url).searchParams, {
      ...deps,
      budget,
    }),
    budget,
  );
}
export async function POST(request: Request) {
  const budget = new ExecutionBudget(25_000, request.signal);
  const params = await parsePesapalBody(request, budget);
  if (!params) return Response.json({ error: "invalid_body" }, { status: 400 });
  return respond(await handlePesapalIpn(params, { ...deps, budget }), budget);
}
