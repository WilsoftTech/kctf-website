import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";
import { submitEnquiry } from "@/server/enquiries/submit";
import { request } from "../support/fixtures";
import { db, enquiryInput, resetDatabase, submitDeps } from "./helpers";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

const require = createRequire(import.meta.url);

// Asynchronous: the in-process Resend double must keep serving while the CLI runs.
function cli(args: string[], env: Record<string, string>) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(
        process.execPath,
        [
          require.resolve("tsx/cli"),
          "--conditions=react-server",
          "scripts/outbox.ts",
          ...args,
        ],
        {
          env: {
            ...process.env,
            SITE_ENVIRONMENT: "test",
            DATABASE_URL: inject("testDatabaseUrl"),
            RESEND_API_KEY: "re_synthetic_cli_key",
            ENQUIRY_FROM: "KCTF Website <website@kctf.example>",
            ENQUIRY_TO: "staff@kctf.example",
            ...env,
          },
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    },
  );
}

describe("outbox CLI", () => {
  it("sends pending jobs through the provider and prints no personal data", async () => {
    await submitEnquiry(request(enquiryInput(300)), submitDeps());
    const received: string[] = [];
    const resend = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push(req.headers["idempotency-key"] as string);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ id: "msg_cli" }));
      });
    });
    await new Promise<void>((r) => resend.listen(0, "127.0.0.1", r));
    const { port } = resend.address() as { port: number };
    try {
      const out = await cli(["run"], {
        RESEND_API_URL: `http://127.0.0.1:${port}/emails`,
      });
      expect(out.status).toBe(0);
      expect(out.stdout).toContain('"sent":1');
      expect(out.stdout + out.stderr).not.toContain("visitor300@example.com");
      expect(out.stdout + out.stderr).not.toContain(
        "Synthetic enquiry number 300",
      );
    } finally {
      resend.close();
    }
    expect(received).toHaveLength(1);
    expect(await db.emailOutbox.count({ where: { status: "sent" } })).toBe(1);

    const status = await cli(["status"], {});
    expect(status.status).toBe(0);
    expect(status.stdout).toContain("sent");
  });

  it("refuses to run without delivery configuration", async () => {
    const out = await cli(["run"], { RESEND_API_KEY: "" });
    expect(out.status).toBe(1);
    expect(out.stdout).toContain("not_configured");
  });

  it("requires explicit ids or --all-failed to requeue", async () => {
    const out = await cli(["requeue"], {});
    expect(out.status).toBe(1);
    expect(out.stderr).toContain("--all-failed");
  });
});
