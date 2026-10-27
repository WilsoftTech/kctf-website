// Prisma client singleton over node-postgres. DATABASE_URL is Neon's *pooled* connection
// string (host contains `-pooler`); migrations use DIRECT_URL via prisma.config.ts.
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { readDatabaseUrl } from "@/server/config";

export type Database = PrismaClient;

export function createDb(connectionString: string): Database {
  const adapter = new PrismaPg({
    connectionString,
    // Small per-instance pool: Neon's PgBouncer pooler multiplexes across instances.
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
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
