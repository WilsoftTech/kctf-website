# Verification report

## Production-readiness branch: 27 October 2026

Branch `production-readiness-neon-outbox`, verified locally on Windows 11 with Node.js 24.22.1. Database tests used an embedded PostgreSQL 18.4 server created and deleted by the test harness. No test contacted Neon, Resend or Cloudflare; Turnstile and Resend were replaced by local doubles or mocks, and no real email was sent. CI was not investigated (out of scope).

| Check                                     | Command                                                                 | Result                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Fresh install from lockfile               | `npm ci`                                                                | Passed: 545 packages, Prisma client generated, 0 vulnerabilities          |
| Runtime dependency audit                  | `npm audit --omit=dev`                                                  | 0 vulnerabilities                                                         |
| TypeScript                                | `npm run typecheck`                                                     | Passed                                                                    |
| ESLint                                    | `npm run lint`                                                          | Passed                                                                    |
| Prettier                                  | `npm run format:check`                                                  | Passed                                                                    |
| Unit tests                                | `npm test`                                                              | 123 passed (5 files)                                                      |
| Database integration tests                | `npm run test:integration`                                              | 34 passed (4 files)                                                       |
| Browser tests (desktop 1440×900, Pixel 7) | `npm run test:e2e`                                                      | 40 passed                                                                 |
| Production build (default settings)       | `npm run build`                                                         | Passed; `/contact`, `/privacy` and API routes dynamic, other pages static |
| Production build, invalid `SITE_URL`      | `SITE_ENVIRONMENT=production SITE_URL=http://localhost:3000 next build` | Failed as intended: "SITE_URL must use https."                            |

### What the suites cover

- **Migrations:** every integration and browser run applies the committed migrations to an empty database with `prisma migrate deploy` and fails on drift from `schema.prisma`. A test confirms sessions run in UTC through the migration.
- **Persistence:** enquiry and outbox job saved together; success returned only after commit; forced outbox failure rolls the enquiry back; responses never claim email delivery.
- **Duplicates:** same-key retries replay without a second Turnstile check; key reuse with different content returns 409; racing identical requests save once; double clicks send one request; a response lost after the server saved is retried safely (one row).
- **Outbox:** provider acceptance; 5xx, 429, 408, 409, network and timeout retries under one stable idempotency key; permanent 4xx failure; backoff respected; retry exhaustion leaves an observable `failed` job and the enquiry intact; requeue; four concurrent workers over 12 jobs send each exactly once; stale-claim recovery with the late worker fenced out; exhausted stale claims fail; batch bounds; CLI run/status/requeue guards with no personal data in output.
- **Configuration:** `SITE_URL` acceptance and rejection (https, credentials, port, path/query/fragment, localhost, loopback, private and IP hosts, single labels); environment/indexing matrix; robots, sitemap, metadata base and canonical agree for production, staging and preview; enquiry modes (email-draft, online, unavailable for each missing or invalid setting, never silent draft fallback); retention gate; test doubles refused outside development/test; no secret values in issue messages; worker secret strength.
- **Request boundary:** origin (foreign and missing), content type, declared and streamed body size, invalid UTF-8, malformed JSON, schema, honeypot, Turnstile failure/hostname/action/outage; shared per-email and trusted-IP rate limits storing only keyed digests; forwarded headers ignored without a trusted proxy.
- **Email content:** verified sender, visitor as Reply-To only, no visitor text in the subject, HTML escaping, plain-text part.
- **Retention:** dry runs do not delete; undelivered enquiries held back unless included; cascade to outbox rows; CLI refuses deletion without a configured and approved period and refuses ad-hoc `--days` for deletion.
- **Worker endpoint:** disabled without `CRON_SECRET`; rejects missing, wrong and non-Bearer credentials; runs a bounded batch when authorised.
- **Logs:** non-allowlisted fields (email, message, IP, token) dropped; errors reduced to codes.
- **Browser:** successful enquiry with reference, focus on the status message, form reset and notification handed to the local provider double; field errors with focus; failed verification; unavailable service with a working `mailto:` fallback; lost-response recovery; double-click guard; no-JavaScript guidance and disabled controls; guidance removed after hydration; site key supplied only at runtime reaches the widget; desktop mega menu on hover, keyboard (ArrowDown, Escape, focus return) and click-through; mobile dialog open/Escape/focus return and navigation; no horizontal overflow on mobile Contact; noindex agreement across robots, sitemap, meta, `X-Robots-Tag` and canonical on a non-production build.
- **Accessibility:** axe-core (WCAG 2.0/2.1 A and AA rules) found no violations on `/`, `/about`, `/programmes`, `/projects`, `/projects/community-lion-conservation`, `/get-involved`, `/contact` and `/privacy` at both viewports.

### Not verified (blocked or out of scope)

- **Neon:** no Neon project or credentials were available. Pooled/direct connections, `npm run db:deploy` against Neon and Neon's UTC default are **not verified**; the same migrations and queries were verified on PostgreSQL 18.4.
- **Resend:** no API key or verified domain. Real acceptance, the 24-hour idempotency behaviour, deliverability and Reply-To in a real inbox are **not verified**.
- **Cloudflare Turnstile:** the real widget and siteverify were not exercised; browser tests used an in-page stub and a local siteverify double.
- **Vercel:** cron invocation, `after()` on the platform, `x-real-ip` behaviour and function duration limits are **not verified**.
- Physical devices, screen readers, Lighthouse/performance and OS reduced-motion mode were not tested. Automated axe scans are not a WCAG conformance claim.
- No deployment, merge or publication was performed. EACH was not accessed or modified.

---

## Initial delivery (historical)

_The results below are historical evidence from the initial delivery. They describe that revision, not the production-readiness branch above._

Date: 27 October 2026.

## Automated local checks

| Check                    | Result                                                        |
| ------------------------ | ------------------------------------------------------------- |
| Production build         | Passed — all public routes generated or configured as dynamic |
| TypeScript               | Passed                                                        |
| ESLint                   | Passed                                                        |
| Vitest                   | 20 tests passed                                               |
| Runtime dependency audit | 0 known vulnerabilities reported by npm audit                 |
| Prettier                 | Passed                                                        |

The enquiry tests cover strict validation, excessive content, malformed JSON, foreign origins, unsupported content types, incomplete configuration, anti-bot failure, hostname mismatch, provider acceptance/failure/timeouts and burst expiry. Provider calls are mocked. No real message was sent.

## Browser review

Reviewed the production build with the managed browser:

- Homepage cinematic hero, local photography, KCTF logo and responsive typography.
- Desktop programme mega-menu opens and Escape closes it.
- Navigation to Contact and all other public routes works.
- About, Programmes, Projects, lion project detail, Get Involved, Privacy, Terms, Accessibility and Credits: expected titles/headings, no failed loaded images and no desktop horizontal overflow.
- Invalid enquiry submission shows field-specific errors and moves focus to the name field.
- Responsive homepage reviewed in 390 × 844 mobile and 768 × 1024 tablet browser frames.
- Production mobile menu opens as a full-screen native dialog; Escape closes it. Selecting Contact navigates and closes the dialog.
- Mobile Contact has no horizontal overflow (375px content area within the 390px frame) and displays validation feedback.

The responsive frame harness temporarily permitted same-origin framing for local QA. The harness was removed and the delivered configuration restores `DENY` / `frame-ancestors 'none'`; the final production build was rerun. No framing exception is shipped.

Development-mode controls did not reliably hydrate in this managed browser preview even after a compatible CLI adapter and development script-policy changes. All documented interactive browser checks therefore use the production build. The README leads with the verified `npm run build` / `npm start` workflow; `npm run dev` is also supplied for standard local editing. Development-mode interactivity on the user's own Windows browser remains unverified.

## Scope and limits

- No browser-rendered EACH comparison or pixel-perfect parity claim. The design adaptation is grounded in pinned EACH source and design tokens.
- Mobile/tablet review used real browser frames, not physical devices. Only the homepage and Contact received explicit mobile review.
- Keyboard Escape, focus on invalid fields and native dialog behaviour were reviewed; this is not a complete screen-reader or WCAG audit.
- Reduced-motion handling is implemented in CSS and GSAP media matching; OS-level reduced-motion mode was not separately exercised.
- No Lighthouse scores or measured production performance claim.
- No live Resend/Turnstile credentials, domain, inbox delivery or production-host behaviour verified.
- Foundation registration, approvals and final privacy/retention policy remain launch confirmations.
- Original EACH repository untouched. No deployment or publication performed.
