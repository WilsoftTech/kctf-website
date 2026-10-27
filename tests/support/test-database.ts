// Disposable PostgreSQL for integration and browser tests. By default an embedded server
// is started in .test-db/ and deleted afterwards. TEST_DATABASE_URL may point to another
// disposable database (for example a throwaway Neon branch); it is refused if it looks
// like an application database. Committed migrations are applied with
// `prisma migrate deploy` and checked for drift, exactly as a release applies them.
import { spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

function assertDisposable(url: string) {
  const target = new URL(url);
  if (!/test/i.test(target.pathname.slice(1)))
    throw new Error(
      "TEST_DATABASE_URL must name a database containing `test`.",
    );
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const other = process.env[key];
    if (!other) continue;
    const o = new URL(other);
    if (o.hostname === target.hostname && o.pathname === target.pathname)
      throw new Error(
        `TEST_DATABASE_URL must not be the same database as ${key}.`,
      );
  }
}

function prisma(args: string[], url: string) {
  return spawnSync(
    process.execPath,
    [require.resolve("prisma/build/index.js"), ...args],
    {
      encoding: "utf8",
      // Only the disposable database is visible to the CLI.
      env: {
        ...process.env,
        DIRECT_URL: url,
        DATABASE_URL: url,
        SHADOW_DATABASE_URL: "",
        SITE_ENVIRONMENT: "test",
      },
    },
  );
}

export async function startTestDatabase(): Promise<{
  url: string;
  stop: () => Promise<void>;
}> {
  let url = process.env.TEST_DATABASE_URL;
  let stop = async () => {};
  if (url) {
    assertDisposable(url);
  } else {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    const dir = path.resolve(".test-db", `pg-${process.pid}-${Date.now()}`);
    await mkdir(path.dirname(dir), { recursive: true });
    const port = await freePort();
    const pg = new EmbeddedPostgres({
      databaseDir: dir,
      user: "kctf_test",
      password: "kctf_test",
      port,
      // We remove the directory ourselves; Windows can briefly hold file locks.
      persistent: true,
      // Synchronous I/O avoids orphaned io_worker processes on Windows (PostgreSQL 18).
      postgresFlags: ["-c", "io_method=sync"],
      onLog: () => {},
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("kctf_test");
    url = `postgresql://kctf_test:kctf_test@127.0.0.1:${port}/kctf_test`;
    stop = async () => {
      await pg.stop();
      await rm(dir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 250,
      });
    };
  }

  const deploy = prisma(["migrate", "deploy"], url);
  if (deploy.status !== 0) {
    await stop();
    throw new Error(
      `prisma migrate deploy failed:\n${deploy.stdout}\n${deploy.stderr}`,
    );
  }
  // Exit code 2 means the migrated database differs from schema.prisma (missing migration).
  const drift = prisma(
    [
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ],
    url,
  );
  if (drift.status !== 0) {
    await stop();
    throw new Error(
      `Schema drift between migrations and schema.prisma:\n${drift.stdout}\n${drift.stderr}`,
    );
  }
  return { url, stop };
}
