// Browser-test environment: disposable PostgreSQL, local Turnstile/Resend/Stripe/Pesapal
// test doubles and a production build of the site on http://localhost:3100. No external
// service is contacted, no real email is sent and no payment is made: payments run in
// test mode against the local doubles, and tests intercept the hosted checkout pages. The site key is deliberately supplied only at
// runtime (not at build) to prove it is not inlined into the bundle.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { freePort, startTestDatabase } from "../support/test-database";

const require = createRequire(import.meta.url);
export const E2E_PORT = 3100;
export const E2E_STRIPE_WEBHOOK_SECRET = "whsec_E2eSyntheticSecret000";
const next = require.resolve("next/dist/bin/next");

function providerDoubles(): Server {
  const emails: unknown[] = [];
  // Stripe Checkout Sessions and Pesapal orders, keyed by id; tests change their state
  // through the /__stripe and /__pesapal helpers.
  const sessions = new Map<string, Record<string, unknown>>();
  const orders = new Map<string, Record<string, unknown>>();
  return createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      const url = new URL(req.url ?? "/", "http://doubles");
      if (req.url === "/siteverify") {
        const token = new URLSearchParams(body).get("response") ?? "";
        // The in-page widget stub appends ":<action>" to the token it issues.
        const [value, action = "enquiry"] = token.split(":");
        if (value === "e2e-outage") {
          res.statusCode = 500;
          return res.end("{}");
        }
        return res.end(
          JSON.stringify({
            success: value !== "e2e-reject",
            hostname: "localhost",
            action,
          }),
        );
      }
      if (url.pathname === "/v1/checkout/sessions" && req.method === "POST") {
        const params = new URLSearchParams(body);
        const key = req.headers["idempotency-key"];
        const existing = [...sessions.values()].find((s) => s.__key === key);
        if (existing) return res.end(JSON.stringify(existing));
        const id = `cs_test_E2e${String(sessions.size + 1).padStart(8, "0")}`;
        const session = {
          __key: key,
          id,
          url: `https://checkout.stripe.com/c/pay/${id}`,
          status: "open",
          payment_status: "unpaid",
          amount_total: Number(
            params.get("line_items[0][price_data][unit_amount]"),
          ),
          currency: params.get("line_items[0][price_data][currency]"),
          client_reference_id: params.get("client_reference_id"),
          metadata: {
            donation_reference: params.get("metadata[donation_reference]"),
          },
          success_url: params.get("success_url"),
          cancel_url: params.get("cancel_url"),
          livemode: false,
          payment_intent: null,
        };
        sessions.set(id, session);
        return res.end(JSON.stringify(session));
      }
      const stripe = url.pathname.match(
        /^\/v1\/checkout\/sessions\/([^/]+)(\/expire)?$/,
      );
      if (stripe) {
        const session = sessions.get(stripe[1]);
        if (!session) {
          res.statusCode = 404;
          return res.end(
            JSON.stringify({ error: { code: "resource_missing" } }),
          );
        }
        if (stripe[2]) {
          if (session.status !== "open") {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: { code: "not_open" } }));
          }
          session.status = "expired";
        }
        return res.end(JSON.stringify(session));
      }
      // Test helpers: GET /__stripe/<id> reads, POST /__stripe/<id> merges fields.
      const stripeHelper = url.pathname.match(/^\/__stripe\/(.+)$/);
      if (stripeHelper) {
        const session = sessions.get(stripeHelper[1]) ?? {};
        if (req.method === "POST") Object.assign(session, JSON.parse(body));
        return res.end(JSON.stringify(session));
      }
      if (url.pathname === "/pesapal/Auth/RequestToken")
        return res.end(
          JSON.stringify({
            token: "e2e.pesapal.token",
            expiryDate: new Date(Date.now() + 300_000).toISOString(),
            error: null,
            status: "200",
          }),
        );
      if (url.pathname === "/pesapal/Transactions/SubmitOrderRequest") {
        const order = JSON.parse(body);
        const trackingId = crypto.randomUUID();
        orders.set(trackingId, {
          merchant_reference: order.id,
          amount: order.amount,
          currency: order.currency,
          callback_url: order.callback_url,
          status_code: 0,
          payment_status_description: "INVALID",
          payment_method: "MTN",
          confirmation_code: "E2ECONF1",
        });
        return res.end(
          JSON.stringify({
            order_tracking_id: trackingId,
            merchant_reference: order.id,
            redirect_url: `https://cybqa.pesapal.com/pesapaliframe/PesapalIframe3/Index/?OrderTrackingId=${trackingId}`,
            error: null,
            status: "200",
          }),
        );
      }
      if (url.pathname === "/pesapal/Transactions/GetTransactionStatus") {
        const order = orders.get(url.searchParams.get("orderTrackingId") ?? "");
        return res.end(
          JSON.stringify(
            order
              ? { ...order, error: null, status: "200" }
              : { error: { code: "not_found" }, status: "404" },
          ),
        );
      }
      const pesapalHelper = url.pathname.match(/^\/__pesapal\/(.+)$/);
      if (pesapalHelper) {
        const order = orders.get(pesapalHelper[1]) ?? {};
        if (req.method === "POST") Object.assign(order, JSON.parse(body));
        return res.end(JSON.stringify(order));
      }
      if (req.url === "/emails" && req.method === "POST") {
        emails.push(JSON.parse(body));
        return res.end(JSON.stringify({ id: `e2e_${emails.length}` }));
      }
      if (req.url === "/__emails")
        return res.end(JSON.stringify({ count: emails.length }));
      res.statusCode = 404;
      res.end("{}");
    });
  });
}

async function waitFor(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function stopProcess(child: ChildProcess) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32")
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  else child.kill("SIGTERM");
}

export default async function globalSetup() {
  const database = await startTestDatabase();
  const doubles = providerDoubles();
  const doublesPort = await freePort();
  await new Promise<void>((r) => doubles.listen(doublesPort, "127.0.0.1", r));
  const doublesUrl = `http://127.0.0.1:${doublesPort}`;
  // Inherited by Playwright workers for assertions against the doubles and test database.
  process.env.E2E_DOUBLES_URL = doublesUrl;
  process.env.E2E_DATABASE_URL = database.url;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SITE_ENVIRONMENT: "test",
    SITE_URL: `http://localhost:${E2E_PORT}`,
    SITE_INDEXING: "noindex",
    ENQUIRIES_ENABLED: "true",
    DATABASE_URL: database.url,
    RESEND_API_KEY: "re_e2e_synthetic_key",
    ENQUIRY_FROM: "KCTF Website <website@kctf.example>",
    ENQUIRY_TO: "staff@kctf.example",
    TURNSTILE_SECRET_KEY: "e2e-synthetic-secret",
    ABUSE_HASH_SECRET: "e2e-synthetic-abuse-hash-secret-000000",
    TRUSTED_PROXY: "none",
    // Synthetic test values only; not an approved retention policy.
    ENQUIRY_RETENTION_DAYS: "30",
    RETENTION_POLICY_APPROVED: "true",
    TURNSTILE_VERIFY_URL: `${doublesUrl}/siteverify`,
    RESEND_API_URL: `${doublesUrl}/emails`,
    // Online donations in provider test mode, against the local doubles only.
    DONATION_PAYMENTS_ENABLED: "true",
    PAYMENTS_MODE: "test",
    STRIPE_SECRET_KEY: "sk_test_E2eSyntheticKey000000",
    STRIPE_WEBHOOK_SECRET: E2E_STRIPE_WEBHOOK_SECRET,
    STRIPE_CURRENCIES: "USD,EUR",
    STRIPE_API_URL: doublesUrl,
    PESAPAL_CONSUMER_KEY: "e2e-synthetic-consumer-key",
    PESAPAL_CONSUMER_SECRET: "e2e-synthetic-consumer-secret",
    PESAPAL_IPN_ID: "11111111-2222-4333-8444-555555555555",
    PESAPAL_API_URL: `${doublesUrl}/pesapal`,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
  };
  const build = spawnSync(process.execPath, [next, "build"], {
    env,
    encoding: "utf8",
  });
  if (build.status !== 0) {
    doubles.close();
    await database.stop();
    throw new Error(`next build failed:\n${build.stdout}\n${build.stderr}`);
  }
  const server = spawn(
    process.execPath,
    [next, "start", "--port", String(E2E_PORT)],
    {
      env: {
        ...env,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "e2e-runtime-site-key",
        // Synthetic, well-formed Maps Embed key. Browser tests intercept every Google
        // request, so nothing reaches Google.
        GOOGLE_MAPS_EMBED_API_KEY: `AIza${"e2e".repeat(11)}xx`,
      },
      stdio: "ignore",
    },
  );
  try {
    await waitFor(`http://localhost:${E2E_PORT}/robots.txt`, 60_000);
  } catch (error) {
    stopProcess(server);
    doubles.close();
    await database.stop();
    throw error;
  }

  return async () => {
    stopProcess(server);
    await new Promise((r) => doubles.close(r));
    await database.stop();
  };
}
