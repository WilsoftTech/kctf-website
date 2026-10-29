// Hosting-independent worker: run under an external cron or supervised Node process.
// No scheduler is installed or activated by this command's existence.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { runBackgroundWorker, workerSettings } =
  await import("@/server/workers/run");
const { backgroundStatus } = await import("@/server/workers/status");
const { getDb, disconnectDb } = await import("@/server/db");
const { safeErrorCode } = await import("@/server/log");
const [command = "run", ...args] = process.argv.slice(2);
function positive(name: string, fallback: number, max: number) {
  const index = args.indexOf(name);
  const value = index < 0 ? fallback : Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new Error(`Invalid ${name}`);
  return value;
}
let exitCode = 0;
try {
  if (command === "status") {
    const result = await backgroundStatus(getDb());
    console.log(JSON.stringify(result));
    if (!result.ok) exitCode = 1;
  } else if (command === "run" || command === "watch") {
    const interval = positive(
      "--interval-seconds",
      workerSettings().intervalSeconds,
      86400,
    );
    const runs = command === "watch" ? positive("--runs", 12, 10000) : 1;
    for (let i = 0; i < runs; i++) {
      const started = Date.now();
      const result = await runBackgroundWorker();
      console.log(JSON.stringify(result));
      if (!result.ok) exitCode = 1;
      if (i + 1 < runs)
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, interval * 1000 - (Date.now() - started)),
          ),
        );
    }
  } else
    throw new Error(
      "Use run, status, or watch [--interval-seconds 300] [--runs 12]",
    );
} catch (error) {
  console.error(safeErrorCode(error));
  exitCode = 1;
} finally {
  await disconnectDb();
}
process.exit(exitCode);
