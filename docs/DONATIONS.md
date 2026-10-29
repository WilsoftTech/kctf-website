# Donations

**Superseding update, 29 October 2026:** [production-readiness corrections](PRODUCTION-READINESS-2026-10-29.md) adds exact-byte streamed webhook limits, accepted/admission quota separation, bounded concurrent recovery, authoritative Stripe partial/full refunds and disputes, Pesapal reversal review and manual verified-refund accounting. Original collection and email state remain distinct. The new additive migration must precede application release. This update supersedes older statements below about checkout-only Stripe events, open-only reconciliation and sequential scheduled processing. No provider refund/dispute is initiated by tests or the accounting command; real-provider sandbox interoperability remains unverified.

Enquiry-only page added 27 October 2026. Online giving added 28 October 2026 on branch `feature/donation-payments`.

**Status: online giving is built, but switched off by default and has not taken a real payment.** The foundation has chosen **Stripe for cards** and **Pesapal for Mobile Money**. Both stay unavailable until merchant credentials are supplied, and live Stripe also needs an eligible receiving account (see [Provider eligibility](#provider-eligibility)). Donation enquiries keep working whatever the payment configuration is.

## Routes: payments and enquiries are separate

| Route                                | What it is                                                                                                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/donate/give`                       | **Online giving.** Split-screen page with the one-time donation form. Methods that are not configured are shown as "Not available yet". With no method configured the page says so and links to `/donate#give`.                                   |
| `/donate/give/status`                | Where Stripe and Pesapal send donors back (`?token=…`). Shows only the state the server has confirmed with the provider. `noindex`, `Referrer-Policy: no-referrer`.                                                                               |
| `/donate`                            | Ways to support, proposed support areas, partnership, FAQ and the **donation-enquiry form** (`#give`). When online giving is available its intro offers "Give online" first and "Discuss a donation" second, and the FAQ uses the online wording. |
| `/contact?topic=donation`            | The same enquiry form with the donation topic.                                                                                                                                                                                                    |
| `POST /api/donations`                | Starts a donation and returns the hosted checkout URL.                                                                                                                                                                                            |
| `GET /api/donations/status`          | Token-keyed public status (no donor details). While open, it asks the provider (at most every 5 s per donation).                                                                                                                                  |
| `POST /api/donations/cancel`         | Closes an open Stripe Checkout Session when the donor confirms they are leaving.                                                                                                                                                                  |
| `POST /api/payments/stripe/webhook`  | Stripe webhook endpoint (signature-verified).                                                                                                                                                                                                     |
| `GET/POST /api/payments/pesapal/ipn` | Pesapal IPN endpoint (unsigned: used only as a prompt to query Pesapal).                                                                                                                                                                          |

Calls to action: the green **Donate** buttons (desktop and tablet header, mobile menu, homepage section) and the footer **Donate** link go to `/donate/give`. The homepage's secondary link, "Discuss a donation", goes to `/donate#give`. `/get-involved` keeps "Ways to donate" → `/donate`. `aria-current` marks the header button on every `/donate…` page.

**A donation enquiry is never a payment.** Enquiries use the `enquiries` table, the enquiry schema, enquiry statuses and enquiry wording ("No payment has been made or taken"). Donations use the `donations` table, their own schema, statuses and wording. No code path turns one into the other, and the integration tests check this.

## Page design (`/donate/give`)

- Desktop (≥1024px): left 55%, a sticky full-height illustrative photograph (Rubirizi, western Uganda; `photos.hero`) with a dark gradient, the headline "Give hope. / Grow a shared future.", a short paragraph, three plain facts (one-time gift; Card via Stripe, Mobile Money via Pesapal; an acknowledgement, not a tax receipt) and the image credit with "It does not show KCTF-funded activities". Right 45%, the form in a rounded card.
- Mobile: a compact image and text block stacked above the form, with no horizontal scrolling and touch targets of at least 44px.
- Motion: the headline uses the site's CSS masked line reveal (`mask-rise`, shared with the homepage hero, works without JavaScript). GSAP (`src/components/donate/give-motion.tsx`) makes the photograph settle once (scale 1.06 → 1, 2.4 s) and staggers the form sections in once. Nothing loops, nothing is tied to scrolling, and all of it is skipped under `prefers-reduced-motion`. Content is visible if JavaScript or GSAP fails.
- Images go through `next/image` (AVIF/WebP, `sizes` for 55vw or 100vw, preloaded) inside a fixed-size container, so loading causes no layout shift.

Content lives in `src/content/donate.ts` (`givePage`, `donationPage`, `homeDonation`) and is read through `content.getGivePage()` and `content.getDonationPage()`. Amounts, currencies and methods come from configuration, not content.

## The donation form

One-time gifts only: recurring giving is **not** implemented. The fields, in order:

1. **Payment method:** radio cards for Card (Stripe) and Mobile Money (Pesapal). Unconfigured methods are disabled.
2. **Currency:** a segmented choice when the method offers several (cards: `STRIPE_CURRENCIES`, from USD, EUR and GBP), otherwise an explicit label ("Amounts are in Ugandan shillings (UGX)" for Mobile Money).
3. **Amount:** four suggested amounts per currency plus a custom amount with the ISO code shown, and the minimum and maximum as a hint.
4. **Name and email** (required, for the acknowledgement; Pesapal also needs an email or phone number).
5. **Message** (optional, up to 500 characters).
6. **Privacy acknowledgement**, naming the provider that processes the payment.
7. Turnstile, a **summary** (amount, one-time, method and provider) and **"Continue to secure payment"**. Below it: "Prefer to discuss your support? Send a donation enquiry" and a note that the acknowledgement is not a tax receipt.

When Mobile Money is selected, a panel explains that the donor picks MTN MoMo or Airtel Money on Pesapal's page and approves the payment on their phone, and that KCTF never asks for a PIN or one-time code. The form never has card, CVV, PIN, OTP or password fields. The server schema is strict, so such fields are rejected rather than ignored.

### Amounts and currencies

`src/lib/donation-options.ts`. Amounts are stored in the currency's **ISO 4217 minor unit** (cents for USD, EUR and GBP; whole shillings for UGX). There are no exchange rates anywhere: each currency has its own suggested amounts and limits.

| Currency | Method       | Minimum | Maximum   | Suggested                        |
| -------- | ------------ | ------- | --------- | -------------------------------- |
| USD/EUR  | Card         | 5.00    | 10,000.00 | 25, 50, 100, 250                 |
| GBP      | Card         | 5.00    | 10,000.00 | 20, 40, 80, 200                  |
| UGX      | Mobile Money | 5,000   | 5,000,000 | 20,000, 50,000, 100,000, 250,000 |

- **Stripe** minimum charges are 0.50 USD, 0.50 EUR and 0.30 GBP ([docs.stripe.com/currencies](https://docs.stripe.com/currencies)). The 5.00 floor is KCTF policy above that, also after conversion to any settlement currency, and it makes the form less useful for card testing. Stripe's maximum (8 digits for non-card methods, more for cards) is far above 10,000.
- **UGX on Stripe** is a documented special case: Stripe represents it as a two-decimal amount whose fraction must be `00`. `toStripeAmount`/`fromStripeAmount` handle this. UGX is not offered for cards today.
- **Pesapal** limits were not found in Pesapal's API documentation. The UGX bounds are conservative placeholders. **Confirm them with Pesapal and the networks during onboarding** and adjust `currencyRules.UGX`.

The browser checks amounts for quick feedback. The server re-parses the typed amount and enforces the limits and the per-method currency allowlist; a client-computed minor amount is never accepted.

## How a payment is confirmed

```
form ──POST /api/donations──▶ validate · replay check · rate limit · Turnstile
                              └─ INSERT donation (created) ── committed
                              └─ provider: create hosted checkout (no DB transaction open)
                              └─ UPDATE → pending + session id + checkout URL
browser ──▶ Stripe / Pesapal hosted page ──▶ /donate/give/status?token=…
provider ──webhook / IPN──▶ verify ──▶ re-read status from provider API ──▶ state machine
status page ──poll──▶ /api/donations/status ──(throttled) re-read from provider──▶ state machine
cron / CLI ──▶ reconcile open donations ──▶ state machine
```

- **Never from the browser.** The success URL, the cancel URL, browser state and client-supplied amounts never change a donation's state. The status page only displays what the server has confirmed.
- **Verified amount, currency and reference.** Before any change the server compares the provider's amount (converted to ISO minor units), currency, our reference (`client_reference_id` and `metadata.donation_reference` for Stripe; `merchant_reference` for Pesapal), the session ID and the test/live mode with the stored record. Any mismatch moves the donation to `needs_review` with a reason code (`amount_mismatch`, `currency_mismatch`, `reference_mismatch`, `session_mismatch`, `mode_mismatch`, `amount_unverified`) and sends nothing.
- **Stripe webhooks:** the HMAC-SHA256 signature over `timestamp.rawBody` is checked against `STRIPE_WEBHOOK_SECRET` before anything else. Any matching `v1` signature is accepted, which covers secret rotation. The tolerance is 5 minutes and the comparison is constant-time. The event is then only a prompt: the Checkout Session is **re-read from Stripe's API** (with `payment_intent` expanded), as Stripe recommends for snapshot events. Events handled: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`. Others are acknowledged and ignored, as are events whose `livemode` differs from `PAYMENTS_MODE`. If the session cannot be read, the endpoint returns 503 so Stripe retries, and the event is not recorded.
- **Pesapal IPNs** carry no status and are not signed (developer.pesapal.com, API 3.0). An IPN must name a known order (tracking ID **and** our merchant reference) and is throttled per order. It only triggers an authenticated `GetTransactionStatus` query. The response follows Pesapal's acknowledgement format (`status` 200 = processed, 500 = failed).
- **Duplicate events:** `payment_events` has `unique(provider, event_id)`. The event row and the state change are written in one short transaction, so a redelivered or concurrent duplicate is acknowledged without being applied twice. Only IDs, the type and an outcome code are kept, never payloads.

### States

`src/server/payments/state.ts` defines the allowed transitions. Each change is a single `UPDATE … WHERE status IN (allowed)`.

| To                               | Allowed from                                           |
| -------------------------------- | ------------------------------------------------------ |
| `pending`                        | `created`                                              |
| `succeeded`                      | `created`, `pending`, `failed`, `cancelled`, `expired` |
| `failed`, `cancelled`, `expired` | `created`, `pending`                                   |
| `reversed`                       | `succeeded` (Pesapal status 3)                         |
| `needs_review`                   | anything except `reversed`/`needs_review` (operator)   |

A success never goes back to pending, failed, cancelled or expired. A provider-verified success after an earlier failure, cancellation or expiry is accepted, because money moved. Out-of-order events are harmless because the authoritative state is always re-read from the provider. Notifications are queued in the same transaction as the move to `succeeded`, and only by the write that made it, so they are queued once (also enforced by `unique(donation_id, kind)`).

### Status page, pending payments and timeouts

The status page polls `/api/donations/status` immediately, then every 2 s, then 3 s, then 5 s, up to 40 checks (about 2½ minutes). It then shows "Still waiting … Check again" instead of polling forever. Each poll asks the provider at most once every 5 s per donation. Messages:

- **Pending, Mobile Money:** check your phone for the MTN MoMo or Airtel Money prompt and approve it there; never share your PIN.
- **Pending, card:** not confirmed yet; please do not pay again.
- **Back through the cancel link:** "You left the checkout", with "Return to checkout" (the stored hosted URL) and, for cards, "Cancel this donation". This expires the Stripe session through the API, so it can no longer be paid. If Stripe says it was already paid, the success stands.
- **Final:** confirmed (with reference, amount and a note that the acknowledgement is not a tax receipt), failed, cancelled, expired, or "being checked" (`needs_review`/`reversed`: "please do not pay again").

### Reconciliation of uncertain outcomes

Open donations older than 10 minutes are re-checked with the provider:

- automatically, before each outbox run from the scheduled `GET /api/outbox/run` (up to 10 per run);
- on demand with `npm run payments -- reconcile [--limit 50]`.

Attempts whose checkout was never created (the provider call failed and the donor never retried) are closed as `expired` (`checkout_not_created`). Pesapal orders still unpaid after 48 hours are closed as `expired` (`not_completed`). A later verified payment still moves them to `succeeded`. Stripe sessions expire after one hour (`expires_at`), which Stripe then reports.

Other operator commands: `npm run payments -- status` (counts by provider, mode and status) and `npm run payments -- review` (donations needing review). They print references, statuses and codes, never donor details.

### Idempotency

- The browser generates one key per donation attempt and reuses it for retries. A replay with the same content returns the same checkout URL. A replay with different content returns `409`. `unique(idempotency_key)` closes the race.
- Stripe Checkout Sessions are created with `Idempotency-Key: kctf-donation-<donation id>`, so a retry after a timeout returns the same session (Stripe keeps keys for 24 hours).
- Pesapal has no idempotency header. Its merchant reference is our unique donation reference, and a retried Pesapal call happens only when the first one gave no answer.
- The status-page token is an HMAC of the donation ID under `ABUSE_HASH_SECRET` (256 bits, base64url). Only its SHA-256 is stored. A replay can therefore return the same link without storing the token. Rotating `ABUSE_HASH_SECRET` does not break existing links, because lookups use the stored digest.

## Email and outbox

On a verified success, two outbox jobs are queued: `donation-staff-notification` (to `ENQUIRY_TO`, Reply-To the donor) and `donation-acknowledgement` (to the donor, Reply-To the first staff address). They are delivered by the existing worker through Resend, after the webhook or IPN response and by the scheduled run. The worker refuses to send a donation job unless the donation is still `succeeded` (`donation_not_succeeded`). In test mode both subjects start with `[TEST]` and the body says no real money moved. The acknowledgement states: "This email acknowledges a payment received. It is not a tax receipt." Stripe's own receipts can be enabled or disabled in the Stripe Dashboard independently.

## Configuration

All variables are in `.env.example`. Payments are **off** unless `DONATION_PAYMENTS_ENABLED=true`.

| Variable                            | Notes                                                                                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DONATION_PAYMENTS_ENABLED`         | `true`/`false` (default false).                                                                                                                                       |
| `PAYMENTS_MODE`                     | `test` (default) or `live`. `test` is refused when `SITE_ENVIRONMENT=production`. `live` needs production **and** `PAYMENTS_LIVE_APPROVED=true`.                      |
| `PAYMENTS_LIVE_APPROVED`            | Set to `true` only after the activation checklist below is complete.                                                                                                  |
| `STRIPE_SECRET_KEY`                 | `sk_test_…`/`rk_test_…` in test mode; `sk_live_…`/`rk_live_…` in live mode. A mismatch disables cards. A restricted key needs write access to Checkout Sessions only. |
| `STRIPE_WEBHOOK_SECRET`             | `whsec_…` of the endpoint for this environment (or from `stripe listen` locally).                                                                                     |
| `STRIPE_CURRENCIES`                 | Comma-separated from USD, EUR, GBP (default USD). Must be currencies the Stripe account accepts.                                                                      |
| `PESAPAL_CONSUMER_KEY`/`_SECRET`    | Pesapal API 3.0 merchant credentials (sandbox ones in test mode).                                                                                                     |
| `PESAPAL_IPN_ID`                    | The `ipn_id` from registering `https://<site>/api/payments/pesapal/ipn` for this environment.                                                                         |
| `STRIPE_API_URL`, `PESAPAL_API_URL` | Local test doubles only. Refused outside development/test and for non-loopback URLs.                                                                                  |

Payments also require `SITE_URL`, `DATABASE_URL`, both Turnstile keys and `ABUSE_HASH_SECRET`. A provider whose variables are all empty is simply not offered. A provider with some values set but invalid is logged (`payments_config_invalid`, naming variables only) and stays off. No publishable Stripe key is needed: hosted Checkout is created and redirected to by the server. Secrets are read only on the server, and the page receives only availability and currencies.

The Pesapal base URL follows the mode: `https://cybqa.pesapal.com/pesapalv3/api` (sandbox) or `https://pay.pesapal.com/v3/api` (live).

## Provider eligibility

### Stripe (cards)

Stripe's supported-countries list ([stripe.com/global](https://stripe.com/global), checked 28 October 2026) **does not include Uganda**. A Uganda-registered foundation **cannot open a standard Stripe account** for itself. Live card payments therefore need one of:

- a Stripe account held **legitimately** by an organisation registered in a Stripe-supported country that is entitled to receive these donations for KCTF (for example a registered fiscal sponsor or partner charity), with a written agreement and that organisation's own legal, tax and reporting obligations; or
- a future expansion of Stripe to Uganda.

Do not open an account with an address, entity or representative that does not truly qualify. That breaches Stripe's terms and puts the funds at risk. Until an eligible account exists, cards can be built and tested in **test mode only**, and the live switch stays off. Note that with a sponsor's account, the acknowledgement wording, privacy notice (controller and processor roles) and tax statements must be reviewed for that arrangement.

### Pesapal (Mobile Money)

Pesapal's Uganda business service accepts MTN MoMo, Airtel Money and cards through its hosted page ([pesapal.com/ug](https://www.pesapal.com/ug)). Onboarding requires a business account and a signed merchant agreement with documents that depend on the legal form (Pesapal lists sole proprietor, partnership and company requirements; **no NGO category was found**, so confirm the documents for a foundation directly with Pesapal Uganda). New accounts have a low limit until documents are approved, and settlement is to a bank account in the country of registration. Confirm with Pesapal: NGO eligibility, UGX per-transaction limits, fees, settlement account and timing, and whether IPN calls can be authenticated.

## Local test setup

```bash
# .env.local (development, never production values)
DONATION_PAYMENTS_ENABLED=true
PAYMENTS_MODE=test
STRIPE_SECRET_KEY=sk_test_…              # from the Stripe test-mode dashboard
STRIPE_WEBHOOK_SECRET=whsec_…            # printed by `stripe listen`
PESAPAL_CONSUMER_KEY=…                   # Pesapal sandbox (demo) credentials
PESAPAL_CONSUMER_SECRET=…
PESAPAL_IPN_ID=…                         # see below
# plus SITE_URL, DATABASE_URL (Neon development branch), Turnstile test keys, ABUSE_HASH_SECRET

npm run db:migrate:dev                   # or npm run db:deploy against the development branch
npm run dev
stripe listen --forward-to localhost:3000/api/payments/stripe/webhook
```

Use Stripe's test cards (for example `4242 4242 4242 4242`) only on Stripe's test-mode Checkout page. Pesapal needs a **public https** IPN URL: use a deployed preview or staging environment, or a tunnel, then run `npm run payments -- pesapal-ipn` (dry run) and `npm run payments -- pesapal-ipn --execute` to register it and print `PESAPAL_IPN_ID`. Without credentials the automated tests use local doubles (below).

## Database

Migration `20261028180000_donation_payments` is additive: four enums, `donations`, `payment_events`, a nullable `email_outbox.donation_id` (with `enquiry_id` made nullable), unique and lookup indexes, and CHECK constraints (exactly one owner per outbox job, positive amount, ISO-style currency, `settled_at` present on success). Existing enquiry rows and jobs are untouched. Apply it with the normal reviewed workflow (`npm run db:status`, then `npm run db:deploy -- --target …`, see `docs/DATABASE.md`) before deploying the code.

## Privacy and retention

Privacy notice version `2026-10-28c` adds an "Online donations" section (`/privacy#donations`). It covers what is stored, that Stripe and Pesapal collect card or mobile-money details on their own pages, what is sent to them, emails, and retention. Donation records are **financial records**: they are not deleted by the enquiry retention command, and no retention period has been approved yet. Decide one (often driven by accounting and audit rules) before live payments. Logs contain IDs, statuses and codes only. Provider payloads are never stored or logged.

## Activation checklist (before `PAYMENTS_LIVE_APPROVED=true`)

1. **Legal and organisational:** confirm the foundation may receive donations (registration, NGO Bureau requirements), who the receiving entity is for cards, and how funds are accounted for. Decide what acknowledgements say. No tax relief or receipt may be claimed without verified eligibility.
2. **Stripe:** an eligible live account (see above), the live restricted key with Checkout/PaymentIntent/charge/refund/dispute read permissions, a webhook endpoint at `https://<domain>/api/payments/stripe/webhook` subscribed to the four existing checkout events **and** the refund/dispute events listed in [the current recovery guide](PRODUCTION-READINESS-2026-10-29.md#webhook-boundaries-and-acknowledgements), and the presentment currencies set in `STRIPE_CURRENCIES`.
3. **Pesapal:** an approved merchant account, live credentials, the IPN registered for the production URL, confirmed UGX limits (update `currencyRules.UGX`) and settlement.
4. **Privacy and records:** approve the updated privacy notice and a retention period for donation records, and say who can access them.
5. **Release and recovery:** apply all additive migrations before code release, configure `CRON_SECRET` and worker variables, verify a frequent host-compatible scheduler and authenticated status monitor, and complete authorized provider sandbox checks. Live activation remains a separate approval; source integration does not enable it.
6. **Authorised live test:** with explicit approval, one small real donation per method. Confirm the status page, webhook/IPN, `npm run payments -- status`, both emails, and the provider dashboards. Refund through the provider dashboard if required.

## Future CMS

Copy for `/donate/give` (`givePage`), `/donate` (`donationPage`, both online and offline variants) and the homepage section is content data for the planned CMS (`docs/CMS-ROADMAP.md`). Availability, amounts, currencies and provider settings stay in code and configuration. Changes to payment wording should need Reviewer approval.
