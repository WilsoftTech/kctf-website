// Operator CLI for online donations. Loads .env/.env.local like Next.js.
//   npm run payments -- status                     counts by provider, mode and status
//   npm run payments -- reconcile [--limit 50]     re-check open donations with providers
//   npm run payments -- review                     donations that need an operator
//   npm run payments -- pesapal-ipn                show what would be registered (dry run)
//   npm run payments -- pesapal-ipn --execute      register the IPN URL with Pesapal and
//                                                  print the ipn_id for PESAPAL_IPN_ID
// Output contains references, statuses, counts and codes only — never donor details.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { getDb, disconnectDb } = await import("@/server/db");
const { reconcilePayments } = await import("@/server/payments/reconcile");
const { PESAPAL_API_URLS } = await import("@/server/payments/config");

const [command = "status", ...args] = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  const value = i >= 0 ? Number(args[i + 1]) : fallback;
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer.`);
  return value;
};

let exitCode = 0;
try {
  if (command === "status") {
    const rows = await getDb().donation.groupBy({
      by: ["provider", "mode", "status"],
      _count: { _all: true },
      orderBy: [{ provider: "asc" }, { mode: "asc" }, { status: "asc" }],
    });
    console.table(
      rows.map((r) => ({
        provider: r.provider,
        mode: r.mode,
        status: r.status,
        count: r._count._all,
      })),
    );
  } else if (command === "reconcile") {
    const result = await reconcilePayments({ limit: option("--limit", 50) });
    console.log(JSON.stringify(result));
    if (!result.ok) exitCode = 1;
  } else if (command === "review") {
    console.table(
      await getDb().donation.findMany({
        where: {
          OR: [
            { status: "needs_review" },
            { financialReviewReason: { not: null } },
            { reconcileFailures: { gt: 0 } },
            { disputeState: { notIn: ["none", "won", "warning_closed"] } },
          ],
        },
        select: {
          reference: true,
          provider: true,
          mode: true,
          amountMinor: true,
          currency: true,
          statusReason: true,
          providerSessionId: true,
          updatedAt: true,
          collectedMinor: true,
          refundedMinor: true,
          reversedMinor: true,
          disputeState: true,
          disputedMinor: true,
          financialReviewReason: true,
          reconcileFailures: true,
          lastReconcileError: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
    );
  } else if (command === "record-pesapal-refund") {
    const textOption = (name: string) => {
      const i = args.indexOf(name);
      return i < 0 ? undefined : args[i + 1];
    };
    const { recordPesapalRefund } = await import("@/server/payments/manual");
    console.log(
      JSON.stringify(
        await recordPesapalRefund(
          getDb(),
          {
            reference: textOption("--reference"),
            providerReference: textOption("--provider-reference"),
            amountMinor: option("--amount-minor", 0),
            mode: textOption("--mode"),
            operator: textOption("--operator"),
            reason: textOption("--reason"),
          },
          args.includes("--execute"),
        ),
      ),
    );
  } else if (command === "pesapal-ipn") {
    // Registration is a one-off per environment. It uses the credentials and mode in the
    // loaded environment and never runs without --execute.
    const mode = process.env.PAYMENTS_MODE === "live" ? "live" : "test";
    const site = process.env.SITE_URL;
    const key = process.env.PESAPAL_CONSUMER_KEY;
    const secret = process.env.PESAPAL_CONSUMER_SECRET;
    if (!site || !key || !secret)
      throw new Error(
        "Set SITE_URL, PESAPAL_CONSUMER_KEY and PESAPAL_CONSUMER_SECRET first.",
      );
    const api = PESAPAL_API_URLS[mode];
    const url = new URL("/api/payments/pesapal/ipn", site).href;
    console.log(`Pesapal ${mode} API: ${api}`);
    console.log(`IPN URL to register (GET): ${url}`);
    if (!url.startsWith("https://"))
      throw new Error("The IPN URL must be a public https URL.");
    if (!args.includes("--execute")) {
      console.log("Dry run. Re-run with --execute to register it.");
    } else {
      const auth = await fetch(`${api}/Auth/RequestToken`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ consumer_key: key, consumer_secret: secret }),
      }).then((r) => r.json() as Promise<{ token?: string }>);
      if (!auth.token) throw new Error("Pesapal authentication failed.");
      const registered = await fetch(`${api}/URLSetup/RegisterIPN`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ url, ipn_notification_type: "GET" }),
      }).then((r) => r.json() as Promise<{ ipn_id?: string }>);
      if (!registered.ipn_id)
        throw new Error("Pesapal did not return an ipn_id.");
      console.log(`PESAPAL_IPN_ID=${registered.ipn_id}`);
    }
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error((error as Error).message);
  exitCode = 1;
} finally {
  await disconnectDb();
}
process.exit(exitCode);
