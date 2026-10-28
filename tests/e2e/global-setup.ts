// Browser-test environment: disposable PostgreSQL, local Turnstile/Resend test doubles
// and a production build of the site on http://localhost:3100. No external service is
// contacted and no real email is sent. The site key is deliberately supplied only at
// runtime (not at build) to prove it is not inlined into the bundle.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { freePort, startTestDatabase } from "../support/test-database";

const require = createRequire(import.meta.url);
export const E2E_PORT = 3100;
const next = require.resolve("next/dist/bin/next");

function providerDoubles(): Server {
  const emails: unknown[] = [];
  return createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/siteverify") {
        const token = new URLSearchParams(body).get("response");
        if (token === "e2e-outage") {
          res.statusCode = 500;
          return res.end("{}");
        }
        return res.end(
          JSON.stringify({
            success: token !== "e2e-reject",
            hostname: "localhost",
            action: "enquiry",
          }),
        );
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
