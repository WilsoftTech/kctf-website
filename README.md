# KCTF Website

The website of **Kigezi Community Transformation Foundation**, Rukungiri, Uganda. Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 and GSAP, with Neon PostgreSQL (Prisma 7) for enquiry persistence and Resend for staff email notifications. No CMS or user accounts yet.

## Architecture

```text
Browser ── /contact form ──► POST /api/enquiries
                               │ origin, size, JSON, schema, honeypot
                               │ idempotent replay lookup
                               │ shared rate limits (Postgres)
                               │ Cloudflare Turnstile (hostname + action)
                               ▼
                       Neon PostgreSQL ── one transaction ──► enquiries + email_outbox
                               │                                   ▲
                               │ after(), Vercel Cron, CLI          │ claim (SKIP LOCKED), fence, retry
                               ▼                                   │
                        outbox worker ──── Idempotency-Key ──► Resend ──► staff inbox (Reply-To: visitor)
```

- Public pages are static except `/contact`, `/donate` and `/privacy`, which render per request so configuration changes apply without a rebuild.
- Public content is separated from presentation behind `src/content/repository.ts` so a future CMS can replace the static source.
- Server-only code lives in `src/server/` and imports `server-only`.

```text
prisma/
  schema.prisma            Enquiries, email outbox, abuse counters
  migrations/              Committed SQL migrations
prisma.config.ts           Prisma CLI config (DIRECT_URL, safety guards)
public/brand, public/images Approved logo; credited western Uganda photography
scripts/
  dev.mjs                  Development adapter for `next dev` / `next start`
  outbox.ts                Outbox CLI: run, status, failed, requeue
  retention.ts             Dry-run-first retention cleanup
  db-deploy.ts             Guarded `prisma migrate deploy`
  measure-vitals.ts        Lab LCP/CLS/transfer measurement against a running build
src/
  app/                     Pages, metadata routes (robots, sitemap, OG image, llms.txt), /api/enquiries, /api/outbox/run
  components/              Layout (header, mega menu, mobile dialog, footer, page header), motion, sections (incl. contact map), SEO (JSON-LD, breadcrumbs), UI
  content/                 Static content, privacy notice version, content repository boundary
  lib/                     Site origin/indexing config, SEO and structured-data helpers, Maps URLs, API response contract
  server/                  Config validation, Prisma client, enquiry pipeline, outbox, retention, logging
  validation/              Shared Zod enquiry schema
  generated/prisma/        Generated Prisma client (git-ignored; built on install)
tests/
  unit/                    No database or network
  integration/             Real PostgreSQL (disposable)
  e2e/                     Playwright: production build, desktop + mobile, axe scans
docs/                      Database, operations, deployment, SEO, privacy/retention, CMS roadmap, verification, release
vercel.json                Daily outbox cron
```

## Local setup from a clean checkout

Requires Node.js 22.9+ (Node 24 LTS recommended) and npm.

```bash
npm ci                 # installs dependencies and generates the Prisma client
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

With the defaults the site runs fully in **email-draft mode**: the contact form validates and opens a prefilled draft in the visitor's email app; nothing is stored unless draft saving is configured (below). No credentials are needed. On Windows, if PowerShell blocks `npm.ps1`, use `npm.cmd`.

To work on online enquiries locally, run `neon checkout development` (writes `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for the Neon **development** branch into `.env.local`), then `npm run db:seed` for sample data. Schema changes use `npm run db:migrate:dev`. Use Turnstile's published test keys or the local doubles described in `docs/DEPLOYMENT.md`. Never point local work at production.

## Environment configuration

Every variable is listed, grouped and commented in `.env.example`; `docs/DEPLOYMENT.md` has the full table of what is required where and whether it is read at **build** or **runtime**. In short:

- **Build and runtime (must match):** `SITE_ENVIRONMENT`, `SITE_URL`, `SITE_INDEXING`. A production build fails if `SITE_URL` is not a public `https` origin. Only `SITE_ENVIRONMENT=production` with `SITE_INDEXING=index` is indexable; staging, preview and unconfigured builds are `noindex`, with robots, sitemap, meta tags, `X-Robots-Tag` and canonical/JSON-LD URLs all agreeing.
- **Build, optional:** `SITE_AI_TRAINING` (opt out of AI-training crawlers), `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` (public tokens, rendered only when indexable).
- **Runtime:** database, Resend, Turnstile (both keys; the site key is passed to the form by the server, not inlined), abuse secret, proxy trust, cron secret, retention, and the optional public `GOOGLE_MAPS_EMBED_API_KEY` for the contact map.
- **CLI only:** `DIRECT_URL`, `SHADOW_DATABASE_URL`.

## Neon and migrations

See `docs/DATABASE.md`. Summary:

- `DATABASE_URL` = Neon pooled connection for the app; `DIRECT_URL` (or Neon's `DATABASE_URL_UNPOOLED`) = direct connection for the Prisma CLI.
- Development data: `npm run db:seed` adds four fictitious enquiries; it refuses production.
- Schema changes: `npm run db:migrate:dev -- --name <change> --create-only` on a development branch, review the SQL, apply, commit.
- Staging/production: `npm run db:status`, then `npm run db:deploy -- --target <direct host>`. Migrations are never applied by builds or tests, and `migrate dev`/`reset`/`db push` are refused when `SITE_ENVIRONMENT=production`.

## Enquiries and email delivery

See `docs/OPERATIONS.md`. Summary:

- **Modes:** `email-draft` (switched off), `online` (fully configured), `unavailable` (switched on but misconfigured, shows direct contact details, never silently falls back to drafts).
- **Saved drafts:** in email-draft mode, "Prepare email enquiry" also saves a copy (`channel = email_draft`, no outbox job, nobody is notified) when `DATABASE_URL`, `ABUSE_HASH_SECRET`, `ENQUIRY_RETENTION_DAYS` and `RETENTION_POLICY_APPROVED=true` are set. The shared rate limits are the only abuse control, since draft mode has no Turnstile. The draft always opens, even if saving fails.
- **Online:** the enquiry and its outbox job are saved in one transaction; the visitor is told it was **received and saved** with a reference, not that an email was sent. A client idempotency key, enforced by a unique index, makes retries after uncertain results safe.
- **Notification:** Resend sends from the verified `ENQUIRY_FROM` to `ENQUIRY_TO` with the visitor as Reply-To only, in text and escaped HTML.
- **Abuse controls:** origin check, 16 KB streamed cap, strict validation, honeypot, Turnstile (hostname and action), shared Postgres rate limits keyed by HMAC digests. Forwarded IP headers are trusted only with `TRUSTED_PROXY=vercel`.
- **Logs** contain identifiers, counts and error codes only.

## Donations

See `docs/DONATIONS.md`. Two separate flows:

- **Online giving (`/donate/give`):** one-time gifts by card through **Stripe Checkout** or by Mobile Money (MTN MoMo, Airtel Money) through **Pesapal**'s hosted checkout. Both are hosted pages; the site never handles card numbers, PINs or OTPs. **Off by default** (`DONATION_PAYMENTS_ENABLED`), test mode by default, and live mode only in production with `PAYMENTS_LIVE_APPROVED=true`. An unconfigured method is shown as unavailable. A donation counts as paid only after the server re-reads the provider's status and verifies the amount, currency and reference. Uganda is not a Stripe-supported country, so live card payments need an eligible receiving account (see "Provider eligibility" in `docs/DONATIONS.md`).
- **Donation enquiries (`/donate#give`, "Discuss a donation"):** the existing enquiry form with the `donation` topic, stored and notified like other enquiries. Never a payment.

The Donate buttons (header, mobile menu, homepage, footer) lead to `/donate/give`; "Discuss a donation" leads to `/donate#give`. Operator commands: `npm run payments -- status | reconcile | review | pesapal-ipn`. Local Stripe webhook forwarding: `stripe listen --forward-to localhost:3000/api/payments/stripe/webhook`.

## Search, structured data and the contact map

See `docs/SEO.md`. Summary:

- **Metadata:** every page sets a unique title and description, a canonical URL on `SITE_URL`, and complete Open Graph and X/Twitter data through `metadata()` in `src/lib/seo.ts`. Next merges metadata shallowly, so pages must not set partial `openGraph` objects.
- **Structured data:** one `Organization` and one `WebSite` (stable `@id`s) on every page, `BreadcrumbList` matching the visible breadcrumbs, and `FAQPage` on `/about` and `/donate` for visible questions only. No registration, tax status, coordinates, hours, ratings or social profiles are claimed.
- **Sitemap and robots:** generated from `content.getPublicRoutes()`. `lastmod` appears only where a real date is known (the privacy notice). Non-production deployments are fully `noindex` with an empty sitemap.
- **AI search:** search and answer-engine crawlers are allowed. Training crawlers are allowed unless `SITE_AI_TRAINING=disallow`. `/llms.txt` is an experimental, non-standard summary with canonical links. No ranking, indexing or AI-citation outcome is promised.
- **Contact map:** click-to-load Maps Embed API iframe showing an **approximate** address search (no exact office pin is confirmed), with the written address and keyless Google Maps search and directions links always available. CSP allows only the embed path.
- **Owner actions** (Search Console, Bing Webmaster Tools, Business Profile eligibility, optional IndexNow) are listed in `docs/SEO.md` §8.

## Outbox processing and recovery

```bash
npm run outbox -- run        # process pending jobs (loops bounded batches)
npm run outbox -- status     # counts by status
npm run outbox -- failed     # failed jobs with error codes (no personal data)
npm run outbox -- requeue <job-id> | --all-failed
```

Jobs run after each submission or confirmed donation, from Vercel Cron (`GET /api/outbox/run` with `Authorization: Bearer $CRON_SECRET`; daily in `vercel.json`, more often where the plan allows) and from the CLI. Claiming uses `FOR UPDATE SKIP LOCKED` with a fenced claim token, retries back off exponentially up to 8 attempts, stale claims are recovered after 10 minutes, and exhausted jobs stay visible as `failed` while the enquiry remains saved. Each scheduled run first reconciles up to 10 open donations with their provider. Delivery is at least once with Resend idempotency (24-hour window), **not exactly once**.

## Retention

See `docs/PRIVACY-RETENTION.md`. No retention period has been approved, so none is configured. Donation records are financial records, are never deleted by the enquiry retention command, and still need their own approved period. Online collection stays off until `ENQUIRY_RETENTION_DAYS` and `RETENTION_POLICY_APPROVED=true` are set. `npm run retention` is a dry run by default; `--execute` deletes only with an approved period and holds back enquiries whose notification has not been sent. Nothing deletes automatically.

## Verification commands

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test                    # unit tests: no database, no network
npm run test:integration    # disposable embedded PostgreSQL (or TEST_DATABASE_URL)
npx playwright install chromium   # once
npm run test:e2e            # rebuilds .next with test settings, then desktop + mobile browser tests and axe scans
npm run build               # rebuild with your own settings afterwards
npx tsx scripts/measure-vitals.ts http://localhost:3000   # optional: lab performance check against `npm start`
```

No test contacts Neon, Resend, Cloudflare, Google, Stripe or Pesapal, and no real email or payment is made: payment tests use local provider doubles. Results of the latest run are in `docs/VERIFICATION.md`.

## Production release

Follow `docs/DEPLOYMENT.md` (step-by-step) and resolve the open decisions in `docs/RELEASE.md` first. In outline: approve privacy and retention → create Neon, Resend and Turnstile resources → set production variables with `ENQUIRIES_ENABLED=false` → apply migrations deliberately → deploy and check indexing → enable online enquiries → authorised live test.

## Content and branding

The homepage uses five new, locally optimised western Uganda photographs in an accessible background carousel (7-second autoplay, 1.2-second crossfades). Slide data and individual credits live in `src/content/hero-slides.ts`; `/credits` includes every slide. Text stays server-rendered and stable, reduced motion defaults to paused, and project heroes keep their single image. See [carousel behaviour and provenance](docs/HERO-CAROUSEL.md), [source metadata](docs/hero-photo-sources.json), and [checks actually performed](docs/VERIFICATION.md). These are illustrative regional photographs, not evidence of KCTF activities or partnerships.

Edit `src/content/site.ts` for contacts, mission, programmes, targets and photo credits, and `src/content/donate.ts` for the giving page, donation page and homepage donation copy; page narratives are in `src/app/**/page.tsx`; theme and responsive rules in `src/app/globals.css`. The approved logo is unaltered at `public/brand/kctf-logo.png`; in the header it shows white over the transparent hero header and in full colour once the header turns solid. Photographs are illustrative, not evidence of KCTF activities; keep credits beside photographs and on `/credits`. Font licences are in `docs/licenses/`.

The design source reference is **WilsoftTech/Each-herbarium** at commit `d590ed9584d74c6c466234436fd22e804e9f4bc7`, used read-only. See `docs/DESIGN-SOURCE.md`.

## Known limitations

- Online donations are implemented but off: no Stripe or Pesapal credentials exist, no provider sandbox has been exercised (only local doubles), and live Stripe needs an eligible account outside Uganda (see `docs/DONATIONS.md`). Only one-time gifts are supported.
- Online enquiries are not active until the foundation approves the privacy notice and a retention period, and Neon, Resend and Turnstile are configured. Integration with the real services has not been tested.
- Email delivery is at least once; duplicates are possible outside Resend's 24-hour idempotency window, and bounces are not tracked.
- With only the daily Vercel Cron, failed notifications are retried daily; more frequent scheduling needs a suitable plan or an external scheduler.
- Per-IP limits only apply on Vercel (`TRUSTED_PROXY=vercel`).
- No staff UI for enquiries; access and deletion requests are handled by an administrator (see `docs/PRIVACY-RETENTION.md`).
- Accessibility is checked with automated axe scans and keyboard tests, not a full manual or screen-reader audit.
- The contact map is an approximate address search until the foundation confirms an exact office pin. The real Google embed has not been loaded: tests intercept Google requests, and no key exists yet.
- Search visibility is unverified: nothing has been submitted to Google or Bing, and the site is not deployed. Performance figures are local lab measurements, not field data.

## Future CMS

A later phase will add authenticated editing for pages, programmes, projects, articles, media, partners, team and settings, with Administrator/Editor/Reviewer roles and a Draft → Review → Published → Archived workflow. Nothing of this exists yet. See `docs/CMS-ROADMAP.md`.
