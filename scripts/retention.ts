// Enquiry retention CLI. Dry run by default.
//   npm run retention                          # report what the configured policy would delete
//   npm run retention -- --days 365            # dry run against a proposed period
//   npm run retention -- --execute             # delete; needs ENQUIRY_RETENTION_DAYS and
//                                              # RETENTION_POLICY_APPROVED=true
//   … --include-undelivered                    # also delete enquiries whose notification never sent
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { readRetentionConfig } = await import("@/server/config");
const { getDb, disconnectDb } = await import("@/server/db");
const { planRetention, executeRetention } = await import("@/server/retention");

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const includeUndelivered = args.includes("--include-undelivered");
const daysIndex = args.indexOf("--days");
const retention = readRetentionConfig();

let exitCode = 0;
try {
  let days = retention.days;
  if (daysIndex >= 0) {
    if (execute)
      throw new Error(
        "--days is for dry runs only. Deletion uses the approved ENQUIRY_RETENTION_DAYS.",
      );
    days = Number(args[daysIndex + 1]);
    if (!Number.isInteger(days) || days < 1)
      throw new Error("--days must be a positive integer.");
  }
  if (!days) {
    console.log(
      "No retention period is configured (ENQUIRY_RETENTION_DAYS). Nothing will be deleted.",
    );
    console.log("Use --days <n> for a dry run against a proposed period.");
  } else if (!execute) {
    const plan = await planRetention(getDb(), { days, includeUndelivered });
    console.log(
      JSON.stringify(
        { mode: "dry-run", ...plan, cutoff: plan.cutoff.toISOString() },
        null,
        2,
      ),
    );
    console.log("Dry run only. Nothing was deleted.");
  } else {
    if (!retention.approved || !retention.days)
      throw new Error(
        `Deletion is blocked until the policy is configured and approved: ${retention.issues.join(" ")}`,
      );
    const result = await executeRetention(getDb(), {
      days: retention.days,
      includeUndelivered,
    });
    console.log(
      JSON.stringify(
        {
          mode: "execute",
          ...result,
          plan: { ...result.plan, cutoff: result.plan.cutoff.toISOString() },
        },
        null,
        2,
      ),
    );
  }
} catch (error) {
  console.error((error as Error).message);
  exitCode = 1;
} finally {
  await disconnectDb();
}
process.exit(exitCode);
