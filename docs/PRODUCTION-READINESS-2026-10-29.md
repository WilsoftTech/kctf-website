# Production-readiness corrections — 29 October 2026

This document supersedes earlier descriptions of quotas, worker ordering and payment lifecycle handling. Earlier dated verification reports remain historical evidence. These changes do not deploy the site, migrate an application database, enable payments, install a scheduler or configure alerts.

## Source and dependency remediation

Current refs were fetched before work. `77df2385fdd9e373d1cdd08d256d558cc0ced679` is an ancestor of the newer complete integration `0c19effc1246f67bdac3e2efbbf1d46601dcc619`. The dedicated `fix/production-readiness` branch starts from that integration, preserving the database, payments, enquiries, SEO and carousel stack. Automatic Vercel deployment is disabled for this fix branch as well as the previously protected branches; GitHub Actions stays enabled.

The runtime audit found vulnerable `zod@4.1.11` inside `@vercel/functions → @vercel/oidc → @vercel/cli-config`. The compatible upstream versions available during investigation still pinned that version. A narrowly scoped npm override installs `zod@4.6.7` only under `@vercel/cli-config`; the lockfile is committed. `@vercel/functions` and `attachDatabasePool(pool)` remain in use, preserving the Fluid compute pool lifecycle. Tests exercise the CLI config schema, the attached PostgreSQL pool and the application validation paths with the replacement. No forced audit fix or suppressed advisory is used.

The [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) concerns excessive allocation during collection validation. Dependency presence was established; a remotely exploitable path through this application's Vercel CLI-config use was not established. Removal of the vulnerable version is still required. Run `npm audit --omit=dev` and `npm ls zod` to verify the installed graph; CI now runs the runtime audit too.

## Bounded workers and recovery capacity

`GET` or `POST /api/outbox/run` requires `Authorization: Bearer <CRON_SECRET>` (minimum 32 characters). Missing configuration returns 503, wrong authorization 401. `GET /api/outbox/status` uses the same authentication. Both endpoints use `Cache-Control: no-store` and expose no donor or enquiry contents.

The HTTP worker retains `maxDuration = 60`. Its absolute parent budget starts **before authentication**, defaults to 50 seconds and cannot exceed 50 seconds. Email and payment phases start concurrently with child caps of 45 and 35 seconds. Payment authentication, all subsequent provider requests, JSON response reading and database work use the same remaining deadline, rather than restarting a timeout for every request. HTTP requests receive an AbortSignal, cap at 8 seconds in budgeted work and reserve 4 seconds for completion. An injected client that ignores cancellation is still bounded by an abort race. Prisma operations cannot be cancelled through its adapter; PostgreSQL pool acquisition, queries and statements are bounded at 3 seconds, and interactive transactions have a 1-second acquisition / 5-second execution cap. The host's remaining 10-second margin covers response/completion overhead; deployments must retain support for a 60-second Node invocation.

Before each claim, workers require 16 seconds remaining. Email claims one row at a time with `FOR UPDATE SKIP LOCKED`; it does not strand a preclaimed batch. A job claimed before a deadline but not sent is returned to pending without consuming an attempt. A send that may have reached the provider retains its attempt and stable idempotency key. Claim-token fencing, 10-minute stale email recovery, exponential retry backoff and exhausted-job visibility are retained. Payment reconciliation has an atomic per-donation claim, 120-second stale-claim recovery and token-fenced release. Financial snapshots additionally use a version comparison inside the commit. A process killed by the host leaves recoverable claims; the next worker marks run records older than two minutes as `interrupted`.

Defaults / runtime variables:

| Variable                  | Default | Allowed values / effect                                                                          |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `WORKER_BUDGET_MS`        | `50000` | Integer 20000–50000; combined invocation budget                                                  |
| `WORKER_EMAIL_BATCH`      | `50`    | Integer 1–100; maximum email jobs per invocation                                                 |
| `WORKER_PAYMENT_BATCH`    | `20`    | Integer 1–100; maximum payment checks per invocation                                             |
| `WORKER_INTERVAL_SECONDS` | `300`   | Integer 60–86400; CLI watch interval and monitoring expectation, **does not change Vercel Cron** |

Batch limits are ceilings, not throughput promises. Budgets are cooperative around unabortable database completion, which can use the host safety margin; an invocation that exhausts its parent budget is never labelled healthy. A phase that stops for its deadline reports `partial`; later invocations pick up untouched work. Reconciliation errors and email retries/failures report `degraded`, not success. Configuration failures or rejected phases report `failed`. HTTP responses are 200 healthy, 207 partial, 503 degraded/failed; scheduler tooling must inspect both status and JSON and monitor partial runs. `worker_runs` retains sanitized summaries for 30 days. A full batch with more backlog can be healthy for that batch; queue metrics reveal the remaining work.

### Select and verify a schedule before launch

[Vercel's current plan documentation](https://vercel.com/docs/cron-jobs/usage-and-pricing) limits Hobby Cron to once daily, with imprecise timing. The committed `17 6 * * *` remains a compatible fallback. It is insufficient for prompt recovery on its own. On Pro/Enterprise, an operator can change the cron entry to `*/5 * * * *`; verify actual invocation records after a separately authorized deployment. Keep `WORKER_INTERVAL_SECONDS=300` for that schedule. If deliberately using daily recovery only, set it to `86400` and accept the longer recovery time; do not describe that as frequent processing.

On any plan, an external scheduler can call the authenticated worker every five minutes, or a trusted Node host can run:

```bash
npm run worker -- run
npm run worker -- status
npm run worker -- watch --interval-seconds 300 --runs 12
```

Use a service supervisor to restart the bounded watch command and alert on nonzero exit; alternatively invoke `worker run` from external cron. Load the intended environment securely. Do not put bearer secrets in public URLs or scheduler logs. Concurrent invocations are safe; excessive concurrency still consumes hosting and database capacity. `outbox run` remains an email-only recovery command; `payments reconcile` remains payment-only. Neither alone records a combined scheduled run.

Capacity planning example, **not a measured production load**: 50 email jobs every five minutes offers up to 600 jobs/hour when providers and queries are fast. That exceeds the current enquiry accepted quota (100/hour), and gives a 500-job outage backlog roughly ten runs (~50 minutes) to recover before accounting for new arrivals. Each successful online donation adds two jobs; the theoretical maximum donation quota can add another 600 jobs/hour. For that sustained upper bound, configure 100 email jobs and a one-minute external/Pro schedule, then measure actual throughput and database load. Under repeated 8-second provider timeouts, deadlines reduce throughput sharply; repair the outage rather than increasing time limits. Payment reconciliation interleaves open checkouts and settled financial checks; its batch must also scale with the count of historical donations because settled payments are revisited without an age cutoff. Monitor lag and increase frequency/batch or dedicate supervised workers before backlog exceeds the targets below.

No external schedule, hosted invocation or alert integration has been activated or verified by this change.

### Monitoring and operator actions

`worker status` / the protected status endpoint exposes pending count, oldest pending age, failed jobs, reconciliation failure count and oldest failed-check time, stale runs and the latest run summary. It returns 503 / nonzero exit when alert conditions exist. Poll from an authenticated external monitor and route failures to the responsible operator; this repository does not send alerts itself.

Default alert conditions are pending ≥100, oldest pending >15 minutes, any failed email job, any reconciliation failure, any financial review/dispute requiring attention, an unfinished run older than two minutes, a non-healthy latest run, or no completed run within twice the expected interval. These are initial operating targets; confirm them against agreed traffic and notification expectations.

1. Check scheduler invocation logs and `npm run worker -- status`. A running invocation can transiently make status unhealthy; retry after its 60-second host window before paging for that signal alone.
2. For email errors: `npm run outbox -- failed`, repair credentials/domain/provider connectivity, then `npm run outbox -- requeue <job-id>` and `npm run worker -- run`. Resend deduplication is limited to 24 hours; review uncertain old sends before requeuing. Provider acceptance is not inbox delivery.
3. For reconciliation failures: `npm run payments -- review`, compare provider and internal reference/amount/currency/mode, repair read permissions/connectivity, and run `npm run payments -- reconcile --limit 20`. Inspect the next combined run and status. Claims expire safely; do not manually clear another live worker's token.
4. For a financial identity mismatch, impossible aggregate or >500 adjustments per kind, preserve provider evidence and event/reference IDs in restricted records. Fix the mapping or arrange a reviewed, targeted backfill using authoritative complete data and the same identity/version checks. Never force totals from a partial list or clear `needs_review` merely to silence an alert. Provider redelivery is safe; unmatched non-KCTF events are acknowledged without changing donations.

## Abuse-limit semantics

Origin, content type, streamed byte bounds, strict validation and honeypots precede database access. Schema-invalid requests consume neither quota. Each enquiry, donation and draft scope then has its own cheap pre-verification admission counters: **20 attempts/minute per trusted network identity and 1000/minute globally**. These bound replay lookups and Turnstile calls. Denied admission rolls back the admission counters and makes no verification call. Rotating email addresses does not bypass them. On non-Vercel hosts, untrusted/spoofed forwarding headers are ignored and callers share the `unknown` network admission bucket; configure edge rate limiting for better availability on such hosts, rather than trusting arbitrary headers. On Vercel, `TRUSTED_PROXY=vercel` assumes Vercel owns and overwrites the connecting-address headers.

After admission, an existing idempotency key is resolved without a second verification or accepted charge. A new online request must pass Turnstile. Accepted counters are checked and incremented **inside the same transaction as the new record and outbox job**, using atomic PostgreSQL upserts in consistent lock order. Quota denial, uniqueness races and failed transactions roll back every accepted counter.

| Scope           | Accepted global   | Per email       | Per trusted IP        |
| --------------- | ----------------- | --------------- | --------------------- |
| Online enquiry  | 100/hour          | 3/hour          | 5/10 minutes          |
| Draft copy      | Separate 100/hour | Separate 3/hour | Separate 5/10 minutes |
| Donation intent | 300/hour          | 6/hour          | 10/10 minutes         |

Invalid Turnstile tokens and verification outages consume **admission only**, never accepted quotas. Sequential or concurrent idempotent retries consume admission but no additional accepted quota. A committed donation intent consumes accepted quota even if its later hosted checkout request fails; retry its original key rather than creating another intent. Draft copies have no Turnstile and cannot consume online enquiry quotas. Invalid distributed traffic can still exhaust the short pre-verification global gate; that is the deliberate verification-cost bound, not exhaustion of the hourly accepted budget. Infrastructure/edge protection remains appropriate for volumetric attacks. Shared counters expire within two windows and are purged; no raw IP/email is stored in them.

## Webhook boundaries and acknowledgements

The shared binary reader counts actual streamed bytes, ignores misleading small `Content-Length`, cancels on overflow/deadline and never parses a truncated prefix. Stripe is capped at **262144 bytes (256 KiB)**; Pesapal POST at **4096 bytes (4 KiB)**. Stripe HMAC is verified over the exact bytes, including non-ASCII sequences and any BOM, before fatal UTF-8 decoding and JSON parsing. Malformed UTF-8, non-object JSON and invalid Pesapal form escapes are rejected. No raw payload, secret or signature is logged. Ingress reading shares the webhook's 25-second request budget and an 8-second read cap.

Stripe supports the existing four `checkout.session.*` events plus `charge.refunded`, `charge.refund.updated`, `refund.created`, `refund.updated`, `refund.failed`, and `charge.dispute.created`, `.updated`, `.closed`, `.funds_withdrawn`, `.funds_reinstated`. Configure these subscriptions in the correct test/live endpoint externally. Signatures and mode are checked. Processing/provider failures return 5xx for retry; invalid bodies/signatures return 400; successfully handled duplicates/irrelevant events return 200.

Pesapal IPN remains an unsigned **prompt**, matched to the known tracking ID and merchant reference, then verified via authenticated `GetTransactionStatus`. Valid notifications preserve Pesapal's HTTP-200 acknowledgement shape with body `status: 200` or `500`; malformed/oversized input is rejected before processing. A forged payload cannot directly mark a donation paid or reversed. See [Pesapal status documentation](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/gettransactionstatus).

## Financial lifecycle and recovery

Stripe event payloads never supply accounting totals. Authenticated reads retrieve the event's charge/refund/dispute to find the PaymentIntent, verify the internal donation binding, then retrieve the PaymentIntent and **all** refund/dispute pages (100/page, bounded at five pages per kind). Checkout linkage is additionally proved if a financial event arrives before the internal PaymentIntent is linked. Metadata ID/reference, original amount, currency, provider and test/live mode must agree. A truncated/invalid/mismatched snapshot is never applied as a healthy aggregate.

`collectedMinor` preserves the original gross collection; `refundedMinor` counts successful refunds only; `pendingRefundMinor` tracks pending/requires-action refunds separately. `refundState` is none/partial/full. `disputeState` and `disputedMinor` remain separate from refunds and reversals; won/closed disputes release the disputed amount, lost disputes remain recorded as disputed loss. Do not subtract both refund and dispute amounts blindly: they can overlap. These fields do not claim a net bank settlement or account for provider fees. Partial and full refunds preserve the original succeeded payment and settlement history; they do not turn it into an unpaid donation. The status page distinguishes these financial updates from email state.

`payment_adjustments` appends unique provider/status/amount observations, retaining earlier observations when a refund or dispute changes state. `payment_events` deduplicates webhook deliveries in the same transaction as the financial update. Concurrent snapshots compare `financialVersion` captured **before** network access; a losing stale snapshot rolls back the event and returns retryable failure. Out-of-order events fetch current state, so an older dispute event cannot reopen a won dispute. Periodic reconciliation revisits settled donations to repair missed events; open/recent failed checkouts are also reconciled. Failures remain counted until a successful recovery check. This is eventual reconciliation, not proof that a provider snapshot cannot change immediately after reading it.

Refund/dispute events and financial reconciliation never queue “donation received” acknowledgements. If they arrive before checkout confirmation, original collection is recorded without creating receipt jobs, and later checkout delivery does not create them. Existing unsent donation emails are blocked if refunded, refund pending, reversed, actively disputed or flagged for financial review. Emails already accepted by the provider cannot be recalled. A concurrent financial change after a sender's final database check is an inherent at-least-once notification race; financial records remain authoritative. Public `acknowledgement` status reports queued/processing/sent/failed/not_queued independently from payment state; `sent` means provider acceptance, not inbox delivery or tax receipt.

Pesapal status code 3 is recorded as a reversal with gross collection retained, `reversedMinor`, an append-only reversal observation and `pesapal_reversal_review`. Its status API does not provide reliable partial-refund accounting. A [refund request acknowledgement is not execution confirmation](https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/refund-request). No code here calls a refund endpoint. An operator must compare the merchant dashboard/statement and confirmed provider reference, distinguish refund from reversal, and account for overlap before recording a verified refund:

```bash
# Accounting dry run; use the correct target database and mode.
npm run payments -- record-pesapal-refund --reference KCTF-D-XXXXXXXX --provider-reference VERIFIED_REFERENCE --amount-minor 1000 --mode test --operator OPERATOR_SLUG --reason provider_confirmed_refund
# Repeat the reviewed command with --execute only after verification.
```

The command locks the donation row, checks provider/mode/amount/reference, rejects refunds above the gross collection, deduplicates the same confirmed reference, and stores the operator/reason codes in the ledger. Use pseudonymous operator slugs and reason codes, not personal data or secrets. It does not issue a refund or send a donation email. Reversal review is deliberately not cleared automatically: both reversal and refund totals can describe overlapping events. Keep evidence in restricted financial records and escalate unresolved differences; do not infer a partial refund from a full-reversal status code.

Official Stripe references used: [PaymentIntent retrieval](https://docs.stripe.com/api/payment_intents/retrieve), [refunds and statuses](https://docs.stripe.com/refunds), [complete refund listing](https://docs.stripe.com/api/refunds/list), [dispute listing](https://docs.stripe.com/api/disputes/list), [charge retrieval](https://docs.stripe.com/api/charges/retrieve). Real provider interoperability still requires authorized sandbox verification; local doubles do not prove it.

## Additive migration and safe release order

`20261029120000_readiness_financial_workers` adds financial/reconciliation columns, `payment_adjustments`, `worker_runs`, indexes and monetary checks. It deletes no existing donations, payment events or outbox records. Existing succeeded/reversed rows are backfilled with the original gross amount; reversed rows also gain reversal amount/review. Historic provider adjustments are not invented: reconcile after upgrading. Old reversals lack a new ledger observation until authoritative review; backfilled counters retain their existing evidence.

1. Review SQL and backup/recovery policy. Apply all committed migrations to disposable/staging first; tests use `migrate deploy` and drift detection.
2. In a separately authorized release, apply this additive migration to the intended database **before** deploying code that selects the new columns. Use `npm run db:status`, then the existing guarded `npm run db:deploy -- --target <direct-host>`. Never use `migrate dev`, reset or test commands against production.
3. Configure worker variables/CRON secret and provider read permissions/subscriptions in the correct environment. Keep payment/live-approval flags unchanged until the foundation approves activation.
4. Deploy only with separate authorization. Verify protected status, observed scheduler invocations, old-record reconciliation, checkout/enquiry sandbox paths and alert routing. Re-enable Git deployment only for the intended release branch.
5. Roll application code back if necessary while retaining the additive schema and ledger; do not drop financial history. Recheck reconciliation after any rollback.

Financial adjustments inherit the unresolved donation-financial-record retention decision and are not purged by enquiry retention. Worker summaries have no submission content and are purged after 30 days by successful worker maintenance. No production database, external scheduler, alerts, real refund, real dispute or live payment was modified during this work.

## Verification evidence

Changed implementation files are grouped below; no carousel images, headline, navigation, SEO implementation or project heroes were replaced.

- Dependencies/automation: `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `vercel.json`, `.env.example`.
- Database: `prisma/schema.prisma`, `prisma/migrations/20261029120000_readiness_financial_workers/migration.sql`, `src/server/db.ts`.
- Shared bounds: `src/server/execution-budget.ts`, `src/server/http/body.ts`.
- Submission quotas: `src/server/enquiries/abuse.ts`, `submit.ts`, `turnstile.ts`; `src/server/payments/create.ts`.
- Payment lifecycle: `src/server/payments/common.ts`, `stripe.ts`, `pesapal.ts`, `webhooks.ts`, `state.ts`, `status.ts`, `reconcile.ts`, new `financial.ts` and `manual.ts`; `scripts/payments.ts`.
- Workers: `src/server/outbox/worker.ts`, `run.ts`, `resend.ts`; new `src/server/workers/auth.ts`, `run.ts`, `status.ts`; new `scripts/worker.ts`.
- Routes: `src/app/api/outbox/run/route.ts`, new `src/app/api/outbox/status/route.ts`, `src/app/api/enquiries/route.ts`, `src/app/api/payments/stripe/webhook/route.ts`, `src/app/api/payments/pesapal/ipn/route.ts`.
- Payment display: `src/components/donate/donation-status.tsx`, `src/lib/donation-response.ts`.
- User-requested location-only photo captions: `src/components/sections/hero-carousel.tsx`, `hero.tsx`, `program-explorer.tsx`, `src/components/ui/primitives.tsx`, `src/app/donate/give/page.tsx`, `src/content/site.ts`. Full legal attribution remains on `/credits` through the footer link; source metadata is retained.
- Tests: new `tests/unit/readiness.test.ts`, `workers.test.ts`, updated `routes.test.ts`; new `tests/integration/readiness.test.ts`, updated `helpers.ts`; diagnostic capture in `tests/e2e/global-setup.ts`. Existing browser assertions are retained apart from the caption assertions in `hero-carousel.spec.ts` and `donation.spec.ts`, which now require the user's location-only presentation and still verify full `/credits` attribution. The keyboard test now tabs directly out of the hero because caption links were removed.
- Documentation: `README.md`, this report, `docs/VERIFICATION.md`, `DATABASE.md`, `DEPLOYMENT.md`, `DONATIONS.md`, `HERO-CAROUSEL.md`, `OPERATIONS.md`, `PRIVACY-RETENTION.md`, `RELEASE.md`.

See the dated entry in [VERIFICATION.md](VERIFICATION.md) for commands and actual local outcomes, and the final handoff for the exact pushed commit and its GitHub Actions run. Do not treat older passing feature-stack CI as verification of these changes. Production activation still requires real-service sandbox checks, credentials/merchant eligibility, approved privacy/retention, migrations, scheduling and alert delivery verification.
