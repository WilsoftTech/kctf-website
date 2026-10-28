// Guarded `prisma migrate deploy`. Prints the target, shows `migrate status`, and applies
// committed migrations only when --target matches the direct host (DIRECT_URL, or Neon's
// DATABASE_URL_UNPOOLED). Never runs as part of a build; migrations are applied
// deliberately by an operator.
//   npm run db:deploy -- --target <direct-host>
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());
const require = createRequire(import.meta.url);
const prisma = (...args: string[]) =>
  spawnSync(
    process.execPath,
    [require.resolve("prisma/build/index.js"), ...args],
    {
      stdio: "inherit",
      env: process.env,
    },
  ).status ?? 1;

const args = process.argv.slice(2);
const target = args[args.indexOf("--target") + 1];
let url: URL;
try {
  url = new URL(
    process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || "",
  );
} catch {
  console.error(
    "DIRECT_URL (or DATABASE_URL_UNPOOLED) is not set to a valid connection URL.",
  );
  process.exit(1);
}
console.log(
  `Target: ${url.hostname}${url.pathname} as ${decodeURIComponent(url.username)}`,
);
if (url.hostname.includes("-pooler"))
  console.warn(
    "Warning: the direct URL looks like a pooled Neon host. Use the direct host for migrations.",
  );

prisma("migrate", "status");
if (args.indexOf("--target") < 0 || target !== url.hostname) {
  console.error(
    "\nNot applying. Review the status above, then rerun with --target <host> exactly as printed.",
  );
  process.exit(1);
}
process.exit(prisma("migrate", "deploy"));
