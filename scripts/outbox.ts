// Operator CLI for the email outbox. Loads .env/.env.local like Next.js.
//   npm run outbox -- run [--batch 10] [--max-batches 20]
//   npm run outbox -- status
//   npm run outbox -- failed
//   npm run outbox -- requeue <job-id …> | --all-failed
// Output contains identifiers, counts and error codes only — never enquiry content.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const { runOutbox } = await import("@/server/outbox/run");
const { getDb, disconnectDb } = await import("@/server/db");
const { outboxStatus, requeueFailed } = await import("@/server/outbox/worker");

const [command = "run", ...args] = process.argv.slice(2);
const option = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  const value = i >= 0 ? Number(args[i + 1]) : fallback;
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer.`);
  return value;
};

let exitCode = 0;
try {
  if (command === "run") {
    const batchSize = option("--batch", 10);
    const maxBatches = option("--max-batches", 20);
    for (let i = 0; i < maxBatches; i++) {
      const result = await runOutbox({ batchSize, purge: i === 0 });
      console.log(JSON.stringify(result));
      if (!result.ok) {
        exitCode = 1;
        break;
      }
      if (result.claimed === 0) break;
    }
  } else if (command === "status") {
    console.table(await outboxStatus(getDb()));
  } else if (command === "failed") {
    const failed = await getDb().emailOutbox.findMany({
      where: { status: "failed" },
      select: {
        id: true,
        enquiryId: true,
        attempts: true,
        lastError: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    console.table(failed);
  } else if (command === "requeue") {
    const ids = args.filter((a) => !a.startsWith("--"));
    if (!ids.length && !args.includes("--all-failed"))
      throw new Error(
        "Pass job ids, or --all-failed to requeue every failed job.",
      );
    const count = await requeueFailed(getDb(), ids);
    console.log(
      `Requeued ${count} failed job(s). Run \`npm run outbox -- run\` to send them.`,
    );
  } else {
    throw new Error(
      `Unknown command "${command}". Use run, status, failed or requeue.`,
    );
  }
} catch (error) {
  console.error((error as Error).message);
  exitCode = 1;
} finally {
  await disconnectDb();
}
process.exit(exitCode);
