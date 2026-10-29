// Prisma client singleton over node-postgres. DATABASE_URL is Neon's *pooled* connection
// string (host contains `-pooler`); migrations use DIRECT_URL via prisma.config.ts.
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { readDatabaseUrl } from "@/server/config";

export type Database = PrismaClient;

export function createDb(connectionString: string): Database {
  const pool = new Pool({
    connectionString,
    // Small per-instance pool: Neon's PgBouncer pooler multiplexes across instances.
    max: 5,
    connectionTimeoutMillis: 3_000,
    query_timeout: 3_000,
    statement_timeout: 3_000,
    idleTimeoutMillis: 10_000,
  });
  // On Vercel Fluid compute, keeps the instance alive until idle connections are closed
  // (Neon's recommendation for node-postgres there). A no-op on other hosts.
  attachDatabasePool(pool);
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  return new PrismaClient({
    adapter,
    transactionOptions: { maxWait: 1_000, timeout: 5_000 },
  });
}

// Reuse one client across hot reloads and warm serverless invocations.
const globalForDb = globalThis as unknown as { kctfDb?: Database };

/** Lazily connects, so builds and email-draft mode never need DATABASE_URL. */
export function getDb(): Database {
  globalForDb.kctfDb ??= createDb(readDatabaseUrl());
  return globalForDb.kctfDb;
}

export async function disconnectDb() {
  await globalForDb.kctfDb?.$disconnect();
  globalForDb.kctfDb = undefined;
}
