# Release notes and launch steps

## 28 October 2026: donation-payments branch `feature/donation-payments`

Branched from `feature/seo-discoverability`. Its first commit is the pre-existing, uncommitted "save email-draft enquiry copies" work, committed unchanged. Adds online giving at `/donate/give` (Stripe Checkout for cards, Pesapal hosted checkout for MTN MoMo/Airtel Money) with a server-confirmed status page, webhook and IPN handling, reconciliation, donation emails through the outbox, migration `20261028180000_donation_payments`, privacy notice `2026-10-28c`, shared form components (the contact and donation-enquiry forms were restyled with them), and tests with local provider doubles. **Payments are off by default; nothing has been charged.** Details: `docs/DONATIONS.md`.

Decisions for the foundation:

1. Card payments: identify a legitimately eligible Stripe account holder (Uganda is not Stripe-supported), or leave cards off.
2. Mobile Money: open and verify a Pesapal merchant account, confirming NGO eligibility, UGX limits, fees and settlement.
3. Approve the donation privacy wording and a retention period for donation records.
4. Approve the giving-page copy, suggested amounts and minimum/maximum gifts.
5. Confirm that acknowledgements must not be described as tax receipts until tax status is verified.

## 28 October 2026: SEO branch `feature/seo-discoverability`

Branched from `feature/donations-page`. Adds complete per-page metadata (canonical, Open Graph, X/Twitter, image alt text), unique titles and descriptions, `Organization`/`WebSite`/`BreadcrumbList`/`FAQPage` JSON-LD, visible breadcrumbs (including on the lion project hero), a "KCTF at a glance" section on `/about`, a sitemap with honest `lastmod`, an optional AI-training opt-out (`SITE_AI_TRAINING`), optional search-console verification tokens, an experimental `/llms.txt`, `noindex` on `/api/*`, a Vercel-preview indexing guard, a more helpful 404 page, header-logo and AVIF image optimisation, and a click-to-load Google map on `/contact`. The privacy notice gains an "Optional Google map" section, and `PRIVACY_NOTICE_VERSION` is now `2026-10-28`. No database migration. Details are in `docs/SEO.md`.

Decisions for the foundation:

1. Whether to opt out of AI-training crawlers (`SITE_AI_TRAINING`).
2. Whether to show an embedded map at all. If so, create a restricted Maps Embed API key (`GOOGLE_MAPS_EMBED_API_KEY`).
3. Confirm the exact office location, if one should be shown, before marking the pin as verified.
4. Approve the updated privacy notice text.
5. Who will own Google Search Console and Bing Webmaster Tools, and whether KCTF is eligible for a Google Business Profile.

## 27 October 2026: donations branch `feature/donations-page`

Adds `/donate` (enquiry-only), Donate CTAs in the header, mobile menu, homepage and footer, a `donation` enquiry topic (migration `20261027130000_donation_enquiry_topic`), donation-specific notification and confirmation wording, privacy-notice version `2026-10-27b`, and `docs/DONATIONS.md`. **No payments are taken.** Apply the migration with `npm run db:deploy` before deploying code that offers the topic in online mode.

Decisions for the foundation: review the `/donate` copy and FAQ, especially the statements on tax status and receiving details, and decide whether and how online payments should be pursued (requirements are in `docs/DONATIONS.md`).

## 27 October 2026: production-readiness branch `production-readiness-neon-outbox`

Adds Neon PostgreSQL persistence for enquiries (Prisma 7, committed migrations), a durable email outbox delivered through Resend, shared abuse limits, explicit site/indexing configuration, dry-run-first retention tooling, an updated privacy notice, a content repository boundary for a future CMS, and unit, integration and browser test suites. Nothing has been deployed, merged or published, and no real email has been sent.

Technical release steps are in `docs/DEPLOYMENT.md`; database procedures in `docs/DATABASE.md`.

### Organisational decisions still required

These are not technical defaults and must be decided by the foundation before online enquiries are enabled:

1. **Retention period** for stored enquiries (`ENQUIRY_RETENTION_DAYS`), and approval of it (`RETENTION_POLICY_APPROVED=true`). Also decide the matching practice for the staff inbox and Resend logs.
2. **Privacy notice approval**, including the provider list (Neon, Resend, Cloudflare Turnstile, the inbox provider), international processing and the request process. Bump `PRIVACY_NOTICE_VERSION` if the text changes.
3. **Neon region** and plan (history/backup window). Record them here.
4. **Final domain** for `SITE_URL`, and whether to index production (`SITE_INDEXING=index`).
5. **Sending domain and sender** for `ENQUIRY_FROM`, and the **staff inbox(es)** for `ENQUIRY_TO`.
6. **Who has database access** and who handles access/deletion requests.
7. **Vercel plan**, which determines outbox cron frequency (daily on Hobby).
8. **Authorisation for one live test** enquiry and email.

### Before public launch (carried forward)

- Confirm the foundation's final cleared name, registration/adoption status and wording. Until then, retain the proposed-status disclosures.
- Confirm project outreach locations, permissions, budget assumptions and any funding or partnerships before updating claims.
- Run mobile-device and assistive-technology checks on the intended host. Automated axe scans are not a WCAG certification.
- Obtain the owner's approval before any deployment or publication.

### Deliberately omitted

CMS, authentication, admin dashboard, payment collection, volunteer accounts, automated deletion and invented institutional achievements.

---

## Historical: initial delivery

_Superseded 27 October 2026 by the section above. Kept as a record._

This delivery is an independent source project. No Site was registered, no GitHub repository was created or modified, and nothing was deployed or published.

### Before public launch

- Confirm the foundation's final cleared name, registration/adoption status and wording. Until then, retain the proposed-status disclosures.
- Confirm project outreach locations, permissions, budget assumptions and any eventual funding or partnerships before updating claims.
- Approve the final domain and set `SITE_URL` before rebuilding.
- Approve the privacy/terms text, inbox retention period and staff access arrangements. The current privacy notice explicitly says a fixed inbox retention period has not been published.
- Configure verified email sending and Turnstile if direct web submissions are wanted. Email-draft mode is usable in the meantime.
- Run a real email test only with authorisation. Mocked provider tests do not prove deliverability.
- Run mobile-device and assistive-technology checks on the intended host, then performance/accessibility scans. Local source checks are not a certification of WCAG compliance.
- Obtain the user's approval before any deployment or publication.

### Hosting

Use a Node-compatible Next.js host such as Vercel or a Node server. This project includes server routes and is not a static export. Install with `npm ci`, build with `npm run build`, serve with `npm start`. Server environment variables must remain private. The repository does not contain real API keys.

### Deliberately omitted

CMS, authentication, database, payment collection, volunteer accounts and invented institutional achievements.
