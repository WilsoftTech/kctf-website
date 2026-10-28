import { after } from "next/server";
import { getDb } from "@/server/db";
import { runOutbox } from "@/server/outbox/run";
import { paymentsConfig } from "@/server/payments/config";
import { handlePesapalIpn } from "@/server/payments/webhooks";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const deps = { readConfig: paymentsConfig, getDb };
function respond({ status, body }: { status: number; body: object }) {
  if (status === 200) after(() => runOutbox({ batchSize: 3 }));
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
// Pesapal IPN, registered as GET (query string) or POST (JSON or form body).
export async function GET(request: Request) {
  return respond(
    await handlePesapalIpn(new URL(request.url).searchParams, deps),
  );
}
export async function POST(request: Request) {
  let params = new URLSearchParams();
  try {
    const text = (await request.text()).slice(0, 4096);
    params = text.trim().startsWith("{")
      ? new URLSearchParams(
          Object.entries(JSON.parse(text) as Record<string, unknown>).map(
            ([k, v]) => [k, String(v)],
          ),
        )
      : new URLSearchParams(text);
  } catch {
    // Invalid bodies are rejected by the handler's format checks.
  }
  return respond(await handlePesapalIpn(params, deps));
}
