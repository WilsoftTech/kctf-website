// Prisma CLI configuration. The CLI (migrate, status, diff) uses DIRECT_URL — Neon's
// non-pooled connection. The application uses the pooled DATABASE_URL in src/server/db.ts.
import nextEnv from "@next/env";
import { defineConfig } from "prisma/config";

// Load .env / .env.local the same way Next.js does, so the CLI and app agree.
nextEnv.loadEnvConfig(process.cwd());

const directUrl = process.env.DIRECT_URL || undefined;
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL || undefined;
const args = process.argv.slice(2).join(" ");

// Development-only commands can reset or rewrite a database. Refuse them for production.
const destructive = /\bmigrate (dev|reset)\b|\bdb push\b/.test(args);
if (destructive && process.env.SITE_ENVIRONMENT === "production")
  throw new Error(
    "Refusing a development migration command while SITE_ENVIRONMENT=production. Use `npm run db:deploy` after reviewing `npm run db:status`.",
  );

function database(url: string | undefined) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port}${u.pathname}`;
  } catch {
    return url;
  }
}
// A shadow database is wiped by `migrate dev`; it must never be an application database.
if (
  shadowDatabaseUrl &&
  [directUrl, process.env.DATABASE_URL]
    .map(database)
    .includes(database(shadowDatabaseUrl))
)
  throw new Error(
    "SHADOW_DATABASE_URL must point to a separate, disposable database.",
  );

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Optional so `prisma generate` works without credentials (CI, fresh checkouts).
  datasource: { url: directUrl, shadowDatabaseUrl },
});
