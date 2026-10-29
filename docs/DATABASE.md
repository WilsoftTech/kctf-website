# Database: Neon PostgreSQL with Prisma

**29 October 2026 update:** additive migration `20261029120000_readiness_financial_workers` adds donation financial totals/version/reconciliation claims, append-only `payment_adjustments` and sanitized `worker_runs`. It backfills original gross/reversal amounts without deleting existing rows; provider adjustment history must be reconciled. Apply the migration before deploying code that selects the new columns. `attachDatabasePool` remains active; connection/query/statement caps are now 3 seconds, interactive transactions 1-second acquisition/5-second execution. See [migration and recovery order](PRODUCTION-READINESS-2026-10-29.md#additive-migration-and-safe-release-order). No application/production database was migrated by this task.

Added 27 October 2026. The website stores online enquiries, their email-outbox jobs and short-lived abuse counters in Neon PostgreSQL through Prisma ORM 7 (`prisma-client` generator, `@prisma/adapter-pg` driver adapter, committed SQL migrations).

## Schema

| Table                | Purpose                                                                                                                                                                                                                                                                                                                            | Personal data                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `enquiries`          | One row per saved enquiry: name, email, topic, message, privacy-notice version, `created_at`, a unique client `idempotency_key` and a SHA-256 `request_hash` of the content.                                                                                                                                                       | Yes                                    |
| `email_outbox`       | Email jobs for exactly one enquiry or one donation (CHECK constraint; `unique(enquiry_id, kind)`, `unique(donation_id, kind)`), status `pending → processing → sent \| failed`, attempts, backoff, claim lease, provider message id, sanitised error code. Cascades on enquiry deletion.                                           | No (references the enquiry)            |
| `donations`          | One row per online donation attempt: reference, idempotency key, request hash, status-token digest, provider, method, test/live mode, amount in ISO minor units, currency, status, donor name/email, optional message, provider session and payment IDs, checkout URL, short status reason, timestamps. Separate from `enquiries`. | Yes                                    |
| `payment_events`     | Processed provider events (`unique(provider, event_id)`): type, donation, outcome code. No payloads.                                                                                                                                                                                                                               | No                                     |
| `rate_limit_buckets` | Fixed-window counters keyed by HMAC digests (`ip:…`, `email:…`, `global`) with an `expires_at`; purged by the worker.                                                                                                                                                                                                              | No raw identifiers; keyed digests only |

Source of truth: `prisma/schema.prisma`. Migrations: `prisma/migrations/`.

| Migration                               | Change                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261027120000_enquiry_persistence`    | Enums, the three tables, unique and lookup indexes, cascading foreign key.                                                                           |
| `20261027120100_utc_session_timezone`   | `ALTER DATABASE … SET timezone TO 'UTC'`. Prisma's pg adapter writes and reads timestamps as UTC; non-UTC sessions would skew scheduling.            |
| `20261027130000_donation_enquiry_topic` | `ALTER TYPE enquiry_topic ADD VALUE 'donation'`. Additive and safe to deploy before the code; stores no payment data.                                |
| `20261028120000_enquiry_channel`        | `enquiry_channel` enum and `enquiries.channel` (default `online`).                                                                                   |
| `20261028180000_donation_payments`      | Payment enums, `donations`, `payment_events`, nullable `email_outbox.donation_id` (and nullable `enquiry_id`), indexes, CHECK constraints. Additive. |

There are no CMS tables. See `docs/CMS-ROADMAP.md`.

## Connections

| Variable              | Used by                                                                                        | Neon value                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`        | The application (`src/server/db.ts`), the outbox and retention CLIs                            | **Pooled** connection string (host contains `-pooler`), `sslmode=require` |
| `DIRECT_URL`          | The Prisma CLI through `prisma.config.ts` (`migrate deploy`, `migrate status`, `migrate diff`) | **Direct** connection string for the same database                        |
| `SHADOW_DATABASE_URL` | Optional; `prisma migrate dev` only                                                            | A separate, disposable database. Never production.                        |

Prisma 7 has no `directUrl` in the schema; the CLI uses `datasource.url` from `prisma.config.ts`, which is set to `DIRECT_URL`, or to `DATABASE_URL_UNPOOLED` (the name `neon env pull` uses) when `DIRECT_URL` is empty. The application connects with `DATABASE_URL` through `@prisma/adapter-pg` (node-postgres over TCP), which works with Neon's pooled endpoint from Node.js hosts. `src/server/db.ts` creates the `pg` pool itself and registers it with `attachDatabasePool` from `@vercel/functions`, as Neon recommends for node-postgres on Vercel Fluid compute; the call does nothing on other hosts. Switching to `@prisma/adapter-neon` later is a one-file change in `src/server/db.ts`.

The client is a lazily created singleton (five connections per instance, five-second connection timeout). Builds never connect; email-draft mode connects only when draft saving is configured (`readDraftConfig` in `src/server/config.ts`). `enquiries.channel` records whether an enquiry was submitted online or saved when the visitor prepared an email draft; draft copies have no outbox job.

`prisma.config.ts` loads `.env`/`.env.local` with `@next/env`, so the CLI and the app read the same files. It also refuses `migrate dev`, `migrate reset` and `db push` while `SITE_ENVIRONMENT=production`, and refuses a `SHADOW_DATABASE_URL` that matches `DIRECT_URL` or `DATABASE_URL`.

## Neon setup

1. Create a Neon project in a region the foundation approves. Note it in `docs/RELEASE.md`.
2. Use the default branch for production. Create a separate branch (for example `development`) for local work and, if wanted, `preview`/`staging` branches. Never point development or tests at the production branch.
3. For each branch, copy the **pooled** string into `DATABASE_URL` and the **direct** string into `DIRECT_URL` for that environment only.
4. Use the database owner role created by Neon for migrations. The migrations need table/enum creation and `ALTER DATABASE` on their own database.

The repository is linked to Neon project `orange-breeze-85323397` with the Neon CLI (`neon init`, 28 October 2026). `neon.ts` declares the project's services (Postgres only) and branch policy: new non-default branches expire after 7 days, except the long-lived `development` branch. `.neon` records the linked organisation, project and branch and is gitignored. `neon env pull` writes `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct) and `NEON_BRANCH` into `.env.local` for the linked branch. Local work uses the `development` branch (`neon checkout development`), created from production on 28 October 2026 after the migrations were applied there. `neon checkout` rewrites only the variables it pulls: remove any old `DIRECT_URL` from `.env.local` so the CLI cannot reach another branch.

### Development seed data

`npm run db:seed` upserts four clearly fictitious enquiries (one per topic, `example.com` addresses) into the linked database. Their outbox jobs are already `sent` (three) or `failed` (one), so the outbox worker never emails them. It is idempotent and refuses `SITE_ENVIRONMENT=production|staging` and the Neon `production` branch. Production holds no seed data.

## Safe migration workflow

### Changing the schema (development only)

```bash
# .env.local points DATABASE_URL/DIRECT_URL at a Neon *development* branch
# and SHADOW_DATABASE_URL at a separate disposable database (or omit it and let Prisma create one).
npm run db:migrate:dev -- --name describe_change --create-only   # write SQL, do not apply
# review prisma/migrations/<timestamp>_describe_change/migration.sql
npm run db:migrate:dev                                           # apply to the development branch
npm run test:integration                                         # applies all migrations to a fresh disposable DB and checks drift
```

Commit the migration folder with the schema change. Never edit an applied migration; add a new one.

### Applying migrations to staging or production

Migrations are **never** applied by a build, deploy hook or test. An operator applies them deliberately:

```bash
# Environment contains the TARGET's DIRECT_URL only (e.g. a shell with production secrets loaded).
npm run db:status                                   # inspect: which migrations are pending
npm run db:deploy                                   # prints the target host and status, then stops
npm run db:deploy -- --target <host-as-printed>     # applies committed migrations with prisma migrate deploy
```

Before production: apply to staging first, take or confirm a Neon restore point, review pending SQL, and deploy the application version that expects the new schema only after the migration succeeds. This release's migrations only add objects and set the timezone; they do not modify existing data.

Destructive commands (`migrate reset`, `db push --accept-data-loss`) are not part of any workflow here and must never target a branch holding real enquiries.

## Tests

`npm run test:integration` and `npm run test:e2e` start an embedded PostgreSQL 18 server in `.test-db/`, apply the committed migrations with `prisma migrate deploy`, check for drift against `schema.prisma`, and delete the server afterwards. To use another disposable database instead (for example a throwaway Neon branch), set `TEST_DATABASE_URL`; it is refused unless the database name contains `test` and differs from `DATABASE_URL`/`DIRECT_URL`. Tests never read `.env.local` database settings.

On Windows the embedded server runs with `io_method=sync` to avoid orphaned I/O worker processes.
