// Accept both Next's CLI and the managed preview service's Vite-style flags.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const production = process.argv.includes("--production");
const args = process.argv
  .slice(2)
  .filter((a) => a !== "--production")
  .flatMap((a) =>
    a === "--host" ? ["--hostname"] : a === "--strictPort" ? [] : [a],
  );
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    production ? "start" : "dev",
    ...args,
  ],
  { stdio: "inherit", env: process.env },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 1));
