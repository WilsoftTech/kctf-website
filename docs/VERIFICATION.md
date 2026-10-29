# Verification report

## Production-readiness corrections and location captions: 29 October 2026

Dedicated branch `fix/production-readiness`, based on the complete integration `0c19effc1246f67bdac3e2efbbf1d46601dcc619` (which includes the earlier `77df238` carousel revision). Refs were refreshed again before handoff; those two remote heads were unchanged. [Implementation, file inventory, migration, environment and recovery instructions](PRODUCTION-READINESS-2026-10-29.md) supersede older operational descriptions. Earlier results below are retained as dated evidence.

Actual local checks on Windows, 29 October 2026:

| Command                    | Result                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                   | Passed, fresh install and Prisma generation; 583 packages, zero reported vulnerabilities. An initial Windows native-module file lock required stopping this checkout's local dev processes before retrying.                                          |
| `npm audit --omit=dev`     | Passed, **0 vulnerabilities** on the final installed graph.                                                                                                                                                                                          |
| `npm ls zod`               | Passed; all installed Zod instances resolve to **4.6.7**, including the scoped Vercel CLI-config override.                                                                                                                                           |
| `npm test`                 | **271 passed**, 9 files; no skipped unit tests.                                                                                                                                                                                                      |
| `npm run typecheck`        | Passed (`next typegen` and TypeScript).                                                                                                                                                                                                              |
| `npm run lint`             | Passed; final run has no errors or warnings.                                                                                                                                                                                                         |
| `npm run format:check`     | Passed.                                                                                                                                                                                                                                              |
| `npm run test:integration` | **109 passed**, 6 files, disposable embedded PostgreSQL; migrations applied with `migrate deploy` and checked for schema drift. No application/production database used; safety guards retained.                                                     |
| `npm run test:e2e`         | **128 passed, 32 existing intentional viewport-matrix skips**, desktop Chromium and Pixel 7 emulation, local production build/disposable database/local provider doubles. Final run includes location-only captions and full `/credits` attribution. |
| `npm run build`            | Passed, standalone optimized production build after the final browser run; 18 static pages generated, dynamic APIs retained.                                                                                                                         |
| `git diff --check`         | Passed.                                                                                                                                                                                                                                              |

Focused regressions cover shared deadlines (including response-body stalls), partial/degraded HTTP results, parallel email/payment work during provider timeouts, untouched pending jobs, concurrent/stale/fenced claims, invalid bot attempts preserving accepted quotas, atomic quota admission and idempotent races, exact-byte Stripe signatures and bounded streamed bodies, malformed UTF-8/form/JSON, partial/full/pending/failed refunds, disputes and won/lost outcomes, duplicate/out-of-order and pre-checkout financial events, missed-event reconciliation, incomplete pagination, identity mismatches, Pesapal reversal history and concurrent operator-accounting deduplication, protected status metrics and alert thresholds. Vercel pool attachment and CLI-schema compatibility are exercised with the dependency override.

The browser suite continues to cover fresh-visit/reload autoplay, pause/play, arrows/selectors/wrapping, focus/hover, reduced motion, no JavaScript, offscreen/visibility suspension, image failures, responsive layout/overflow, project single-image hero, navigation, donation links, Stripe/Pesapal checkout doubles, enquiry retries, SEO and automated axe checks. Caption assertions were changed specifically for the user's later request: image captions contain only locations, have no inline source links, and all five complete legal credits remain on `/credits` through the footer. No workflow or assertion was disabled to obtain a pass.

An initial full browser run had one desktop checkout-start failure (503/unconfirmed UI; 127 passed, 1 failed, 32 skipped). Its server error code was not captured, so the cause is not established. Diagnostic capture was added without weakening that test. The focused reproduction passed, then two complete reruns passed, including the final caption revision. A standalone build attempt was temporarily not executed because automatic approval review hit an account usage limit; after its stated retry time, approval worked and the standalone build passed. These earlier failures/blocks are not reported as successful checks.

The `Website checks` GitHub Actions workflow repeats install, runtime audit, TypeScript, ESLint, formatting, unit, integration, browser and production-build checks on the pushed commit. Exact commit SHA, workflow URL and observed final CI result are reported in the handoff; old feature-stack CI is not used as proof for this revision.

No real-provider sandbox interoperability, live payment, refund, dispute, real email, production migration, deployment, external scheduler or delivered alert was exercised. Browser checks use Chromium emulation rather than physical mobile devices, Safari/Firefox or a full assistive-technology audit. Production activation remains conditional on the external setup in the recovery guide.

## Homepage hero carousel: 29 October 2026

Autoplay follow-up, 29 October 2026: added a real-time browser regression check that visits and reloads the homepage without clicking Play, moving the pointer or overriding browser clocks. Both desktop and Pixel 7 contexts automatically advanced from photograph one to two after approximately seven seconds on each visit. The existing autoplay default was already correct; no application behaviour was changed. `npm run test:e2e -- hero-carousel.spec.ts` passed **21 tests with 1 intentional viewport-matrix skip**, including the hover/focus, explicit pause, reduced-motion and visibility safeguards. ESLint and formatting also passed. The production build and TypeScript validation are included in the browser setup.

The new autoplay checks also passed in [CI run 40838701756](https://github.com/WilsoftTech/kctf-website/actions/runs/40838701756), but that full run failed an existing contact-map CSP assertion (127 passed, 1 failed, 32 skipped). The assertion accepted an unrelated `script-src eval` event before the expected `frame-src` event. The test now filters for frame-policy violations, removes its listener/iframe, and deliberately injects an unrelated script event to cover the race. The targeted production-build desktop/mobile rerun (`npm run test:e2e -- seo.spec.ts --grep "CSP still blocks"`) passed both tests. The application CSP is unchanged.

The final [GitHub CI run 40839851204](https://github.com/WilsoftTech/kctf-website/actions/runs/40839851204), commit `f11fcfe`, passed all checks: TypeScript, ESLint, formatting, 238 unit tests, 77 integration tests, **128 browser tests passed with 32 intentional skips**, and the final production build. Both real-time initial-visit/reload autoplay tests passed again.

Branch: `feat/homepage-hero-carousel`, based on local `1dcc5d9` (the fetched `origin/main` was already an ancestor). Existing photographs elsewhere are unchanged. The user subsequently authorised integration of the full feature stack into `main` on 29 October 2026; see [RELEASE.md](RELEASE.md). Deployment remains unauthorised, with automatic Vercel deployment disabled for both `main` and the carousel branch.

Completed locally on Windows with Node.js 24:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: final local production build with the checkout’s normal `.env.local` settings passed after the test suite; all 18 static pages generated successfully.
- `npm run format:check`: passed. Added `endOfLine: auto` to respect existing Windows CRLF and Linux LF checkouts without reformatting unrelated files.
- `npm test`: 238 passed across 7 unit-test files.
- `npm run test:integration`: 77 passed across 5 files, using disposable PostgreSQL. The restricted sandbox initially blocked Windows user lookup; the normal local-process run passed.
- `npm run test:e2e -- hero-carousel.spec.ts`: initial focused run, 18 passed, desktop Chromium 1440×900 and Pixel 7 emulation.
- `npm run test:e2e`: final full regression, **126 passed, 32 intentionally skipped, 0 failed**, including a production build, axe scans, navigation, donation and enquiry flows against local doubles. The final carousel coverage also checks 320×568, 768×1024 and 1024×768 layouts and keyboard Play followed by tabbing out. Skips cover viewport-specific or identical server-markup cases.
- Additional Playwright diagnostic with JavaScript disabled in Desktop Chrome and Pixel 7 contexts: first image successfully decoded, exactly one hero photograph preload (the logo also has its own preload), controls hidden, server-rendered headline/copy and working secondary CTA to `/get-involved`. No-JavaScript primary CTA navigation to `/programmes` is covered by the suite.
- All five downloaded asset SHA-256 hashes match the source provenance record.
- [GitHub Actions run 40836283015](https://github.com/WilsoftTech/kctf-website/actions/runs/40836283015), implementation commit `4c170ff`: **passed** on Ubuntu/Node 24. Completed install, TypeScript, lint, formatting, 238 unit tests, 77 integration tests, 126 browser tests (32 intentional skips), and the final production build. A following documentation-only commit records these results.
- Visual review of all five hero slides at desktop and mobile sizes: readable text, consistent branding, active credits, clear CTAs and controls. The desktop padding was refined to keep controls within a 900px-tall hero. Screenshot outputs are in ignored `test-results/`.

Focused browser checks: five distinct new image paths, all five selectors, arrows and five-to-one wrapping; a complete autoplay loop, hover and explicit pause/play; headline node identity and document-position stability; keyboard focus retention and visible outlines; keyboard pause and explicit Play; offscreen suspension; Page Visibility suspension; reduced-motion manual navigation with no drift/parallax; first-image-only server markup; no-JavaScript CTA navigation and hidden controls; slow-loading replacement retains the current photograph; individual, first and all-image failures; all five credits and licences; 44px targets, no overflow or CTA/control collision; existing project hero uses only its original `ishasha-lions.jpg` photograph.

Tab visibility is exercised with a simulated Page Visibility event in headless Chromium. No physical device, Safari/Firefox or assistive-technology session is claimed. No real donation, email or external form submission is made; the existing full suite uses local payment/enquiry doubles.

Image provenance, verification limits and selection substitutions: [HERO-CAROUSEL.md](HERO-CAROUSEL.md), [raw source metadata and hashes](hero-photo-sources.json). Two community-focused photographs depict tree planting and cooperative dance; the canoe livelihoods scene replaces the unavailable suitable village-dialogue image. Agriculture is not labelled as a verified sustainable method. No AI imagery, EACH photography or existing site photograph is used in the carousel.

## Donation-payments branch: 28 October 2026

Branch `feature/donation-payments` (from `feature/seo-discoverability`), verified locally on Windows 11. **All payment tests are mocked:** Stripe and Pesapal are local doubles (stateful fakes of the documented endpoints), and browser tests intercept the hosted checkout pages. No Stripe or Pesapal sandbox was contacted, because no credentials exist. No real payment, charge or email was made. Nothing was deployed or merged.

| Check                                     | Command                    | Result                                                                                                                      |
| ----------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Prettier                                  | `npm run format:check`     | Passed                                                                                                                      |
| TypeScript                                | `npm run typecheck`        | Passed                                                                                                                      |
| ESLint                                    | `npm run lint`             | Passed                                                                                                                      |
| Unit tests                                | `npm test`                 | 238 passed (7 files; 76 new in `payments.test.ts`)                                                                          |
| Database integration tests                | `npm run test:integration` | 77 passed (5 files; 38 new in `payments.test.ts`), embedded PostgreSQL 18, all migrations applied plus a schema drift check |
| Browser tests (desktop 1440×900, Pixel 7) | `npm run test:e2e`         | 107 passed, 31 skipped (viewport-specific), 0 failed; includes axe scans of `/donate/give`                                  |
| GitHub Actions (`Website checks`)         | push of `e8c9b5c`          | Passed: `npm ci`, typecheck, lint, unit tests, build (run 40752704584)                                                      |
| Production build (default settings)       | `npm run build`            | Passed; `/donate/give` and `/donate/give/status` dynamic                                                                    |

Coverage of the new work:

- **Unit (mocked):** amount parsing and limits per currency, decimals for UGX and two-decimal currencies, Stripe's UGX minor-unit rule; strict schema rejecting card, CVV, PIN, OTP, minor-amount and recurring fields; configuration gates (off by default, test mode refused in production, live mode only with production and approval, key/mode mismatch, half-configured providers reported, test-double URLs refused outside dev/test, no secrets in public options); Stripe signature verification (valid, rotated, missing, malformed, wrong secret, tampered body, reformatted JSON, stale); Checkout Session mapping including delayed failures; Stripe and Pesapal adapters (request shape, idempotency key, token reuse, error classification, timeouts, status codes 0–3); state-machine rules and mismatch reasons; early rejection of origin, size, amount and currency before any database access; forged and wrong-mode webhooks; malformed IPNs.
- **Integration (real PostgreSQL, mocked providers):** donation recorded before the provider call; replay without a second session; key reuse conflict; uncertain provider call recovered with the same Stripe idempotency key; refused checkout marked failed; Turnstile rejection saves nothing; separate donation rate limits; confirmation only after re-reading the session (a webhook claiming "paid" while Stripe says open changes nothing); duplicate and 5 concurrent deliveries queue exactly two emails; a later expiry or failure cannot undo success; success after expiry accepted; amount, currency, reference, donation-ID and mode mismatches go to `needs_review` with no email; provider read failure returns 503 without recording the event; unknown sessions recorded as unmatched; forged event rejected; token-only status with no donor data, 404 for bad tokens, polling throttle; cancellation expires the Stripe session but cannot cancel a paid one; reconciliation of missed webhooks and orphaned attempts; Pesapal IPN as a prompt only, wrong reference ignored, failure then later success, amount mismatch, status timeout then reconciliation, two-day close-out; donation emails escaped, `[TEST]`-marked and "not a tax receipt"; no email for unconfirmed donations; outbox owner CHECK constraint; a donation enquiry creates no donation or payment job.
- **Browser (production build, mocked providers):** desktop split of about 55/45; stacked mobile layout with 44px+ targets and no horizontal overflow; headline and fallback guidance without JavaScript; reduced motion (no CSS animation, no GSAP transform); keyboard operation of method, currency and amount; inline errors with focus on the first invalid field; no card, PIN or OTP inputs; full card flow (redirect to the intercepted Stripe page, success URL alone shows "Waiting", signed webhook, page updates to confirmed, two outbox jobs); cancel flow; double-click starts one checkout; full Mobile Money flow (phone-approval guidance, IPN, confirmed). Updated CTA tests: every Donate button goes to `/donate/give`, and "Discuss a donation" goes to `/donate#give`. All existing enquiry tests still pass.
- **Visual review:** desktop and mobile screenshots of `/donate/give` (default, Mobile Money with errors), `/donate` and `/contact`, using synthetic test-mode settings.

Not verified, blocked by missing credentials or out of scope: Stripe test-mode Checkout and `stripe listen` webhook forwarding against a real Stripe account; the Pesapal sandbox (real token, order, IPN registration and status); live payments of any kind; real Resend delivery; screen readers and physical devices.

---

## SEO branch: 28 October 2026

Branch `feature/seo-discoverability` (from `feature/donations-page`), verified locally on Windows 11 with Node.js 24.22.1. Nothing was deployed, merged, submitted to a search engine or sent to Google: browser tests intercept every Google Maps request.

| Check                                     | Command                                                                                                              | Result                                                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prettier                                  | `npm run format:check`                                                                                               | Passed                                                                                                                                                     |
| TypeScript                                | `npm run typecheck`                                                                                                  | Passed                                                                                                                                                     |
| ESLint                                    | `npm run lint`                                                                                                       | Passed                                                                                                                                                     |
| Unit tests                                | `npm test`                                                                                                           | 152 passed (6 files)                                                                                                                                       |
| Database integration tests                | `npm run test:integration`                                                                                           | 35 passed (4 files)                                                                                                                                        |
| Browser tests (desktop 1440×900, Pixel 7) | `npm run test:e2e`                                                                                                   | 84 passed, 28 skipped (viewport-specific or markup-identical on mobile)                                                                                    |
| Production build (default settings)       | `npm run build`                                                                                                      | Passed; `/llms.txt` static, `/contact`, `/donate` and `/privacy` dynamic                                                                                   |
| Production-mode output (local only)       | build with `SITE_ENVIRONMENT=production SITE_URL=https://kctf.example SITE_INDEXING=index SITE_AI_TRAINING=disallow` | robots, sitemap (12 HTTPS URLs, `lastmod` only on `/privacy`), `llms.txt`, canonical, verification tag and headers inspected; no `localhost` in built HTML |

New coverage:

- **Unit:** unique titles (65 characters or fewer) and descriptions (70–160 characters) on every sitemap route; canonical, Open Graph (site name, locale, image alt) and X card per page; the route list matches the sitemap; HTTPS-only sitemap URLs with no guessed `lastmod`; staging, preview and Vercel-preview `noindex` with an empty sitemap and a 404 `llms.txt`; AI-training opt-out leaves search crawlers allowed; verification tokens validated and only rendered when indexable; `Organization` contains no unverified properties; breadcrumb positions and URLs; JSON-LD escaping; Maps URL encoding and embed-key validation.
- **Browser:** each public page has one `h1`, server-rendered content and parseable JSON-LD with exactly one `Organization` and one `WebSite`, unique `@id`s, and breadcrumbs whose last item equals the canonical URL and matches the visible trail. FAQ markup equals the visible questions and answers on `/about` and `/donate`. Unknown URLs return 404 with `noindex`. `/api/*` carries `X-Robots-Tag`. The map makes no Google request before the click, loads from the keyboard, has a titled lazy iframe, is permitted by CSP, and keeps its box size (no layout shift). A map that never loads shows guidance while the email link and enquiry form still work. CSP blocks a non-embed Google Maps frame and keeps `frame-ancestors 'none'` and `X-Frame-Options: DENY`. axe scans of all previous routes, including `/contact` with the map section, found no violations.
- **Performance (lab):** measured before and after with `scripts/measure-vitals.ts`; results and caveats are in `docs/SEO.md` §6.

Not verified: the real Google Maps embed (no key exists), search-console verification and indexing, social-preview rendering on real platforms, field Core Web Vitals, screen readers and physical devices.

---

## Donations branch: 27 October 2026

Branch `feature/donations-page` (from `production-readiness-neon-outbox`), verified locally on Windows 11. No test contacted Neon, Resend or Cloudflare, no real email was sent, and no payment was initiated. Nothing was deployed or merged.

| Check                                     | Command                    | Result                                                                                      |
| ----------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| TypeScript                                | `npm run typecheck`        | Passed                                                                                      |
| ESLint                                    | `npm run lint`             | Passed                                                                                      |
| Prettier                                  | `npm run format:check`     | Passed                                                                                      |
| Unit tests                                | `npm test`                 | 129 passed (5 files)                                                                        |
| Database integration tests                | `npm run test:integration` | 35 passed (4 files), including the new migration applied to an empty database without drift |
| Browser tests (desktop 1440×900, Pixel 7) | `npm run test:e2e`         | 59 passed, 11 skipped (viewport-specific tests)                                             |
| Production build (default settings)       | `npm run build`            | Passed; `/donate` is dynamic, like `/contact`                                               |

New coverage: the `donation` topic is accepted while unknown topics and payment fields (amount, currency) are rejected. The donation staff notification has a "Donation" subject and a no-payment statement. A donation enquiry is persisted with its topic and an outbox job, and its message says that no payment was made or taken. In the browser, a donation enquiry from `/donate` is saved, notified and shows no payment-success wording, and a failed donation enquiry never reports success. Every donation CTA on the homepage links to `/donate`. The desktop header Donate button is keyboard-operable, at least 44px tall and marked `aria-current` on `/donate`. The mobile menu Donate CTA navigates and closes the dialog. The small-screen header hides the pill. FAQ items open from the keyboard. The page has no card or amount inputs. There is no horizontal overflow on `/`, `/donate` or `/contact` on mobile, and axe finds no violations on `/donate` at both viewports. Header layout at 1024px and 1280px and page layout at 390px were also checked from screenshots.

Not verified: real Neon, Resend and Turnstile behaviour (as below), screen readers, physical devices and OS reduced-motion mode.

---

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
