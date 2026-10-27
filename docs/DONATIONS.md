# Donations

Added 27 October 2026. Status: **enquiry-only. The website does not take payments.**

## Why enquiry-only

When this feature was built, the repository had no payment provider, no payment dependency, and no approved bank, mobile-money or payment-link details. `/terms` and `/get-involved` already stated that the site does not accept donations. In line with that, the website offers a **donation enquiry** through the existing enquiry pipeline. It does not use a payment gateway or payment schema, and it never collects card, bank or mobile-money details.

## Route and calls to action

| Location                         | What                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/donate`                        | Donations page (rendered per request because the form mode is runtime configuration). In the sitemap.         |
| Desktop header (≥1280px)         | Green pill "Donate" button with a heart icon, beside "Let’s connect".                                         |
| Tablet header (601–1279px)       | The same pill beside the Menu button.                                                                         |
| Small screens (≤600px)           | Not shown in the header, which stays uncluttered. A full-width "Donate to KCTF" pill sits in the menu dialog. |
| Mobile menu dialog (all <1280px) | "Donate to KCTF" pill below the main links. It closes the dialog when used.                                   |
| Homepage                         | "Support the foundation" section, between "Get involved" and "From the foundation".                           |
| Footer                           | "Donate" link at the end of the Explore list.                                                                 |
| `/get-involved`                  | The "03 / Support" section now links to `/donate`.                                                            |

All of these link to `/donate` and use the `DonateButton` and `Heart` components in `src/components/ui/primitives.tsx`. Hover adds a small lift, which is turned off under `prefers-reduced-motion`. There is no persistent or floating mobile CTA and no pop-up.

## Page structure

The page has an introduction with an illustrative photograph, four proposed support areas (one per programme, labelled "Proposed activities · Not completed work"), a donation panel stating that online giving is not available, and the enquiry form with the `donation` topic preselected. These are followed by a partnership and institutional-support section and an FAQ built from native `<details>` elements, which work from the keyboard without JavaScript. A closing note says that photographs are illustrative, not evidence of KCTF-funded activities, and links to `/credits`.

Content lives in `src/content/donate.ts` and is read through `content.getDonationPage()` (`src/content/repository.ts`), so a future CMS can manage it. The homepage section reads `homeDonation` from the same file.

**Honesty rules for editors:** do not add impact statistics, completed achievements, registration or tax-exempt status, funding commitments, partnerships or receiving details unless the foundation has confirmed them. The FAQ says that no tax relief is implied and that any future payment acknowledgement is not a tax receipt.

## How donation enquiries are stored and notified

Donation enquiries go through the same pipeline as every other enquiry (see `docs/OPERATIONS.md`):

- `donation` is a value of the `enquiry_topic` enum (migration `20261027130000_donation_enquiry_topic`) and of the shared Zod schema. The schema is strict, so amount, currency or card fields are rejected.
- **Online mode:** the enquiry and its outbox job are saved in Neon in one transaction, and the Resend staff notification is sent with the subject `KCTF website enquiry: Donation (KCTF-XXXXXXXX)`. The notification states: "No payment was requested or taken by the website."
- The visitor sees: "your donation enquiry has been received and saved. No payment has been made or taken." Failure states (unavailable, rate-limited, unconfirmed, invalid) never show a success message.
- **Email-draft mode (default):** the form opens a prefilled draft in the visitor's email app. Nothing is stored.
- **Unavailable mode:** the page shows direct contact details instead of the form.
- The `/contact` form also offers the topic ("Donating to the foundation"), and `/contact?topic=donation` preselects it.

The topic and the visitor's success message are the only changes. Rate limits, Turnstile, idempotency, retention and access are the same as for other enquiries. No new environment variables are needed.

## Privacy and retention

The privacy notice now says that donation enquiries are handled like other enquiries, that no payment details are collected and that Turnstile runs on `/donate`. `PRIVACY_NOTICE_VERSION` was bumped to `2026-10-27b`. Retention is unchanged: donation enquiries follow `ENQUIRY_RETENTION_DAYS` once it is approved. If the foundation wants a different period for donation correspondence, that is an organisational decision and needs a code change, because retention is currently per enquiry, not per topic.

## Activating online payments later

Online payments need the following, in order. None of it exists today.

1. **Organisational and legal:** confirm registration status and the legal ability to receive donations, and any NGO Bureau or financial-institution requirements in Uganda. Approve receiving accounts. Decide whether tax receipts can be issued and under which regime. Update `/terms`, `/privacy` and the FAQ to match.
2. **Provider choice:** pick a provider with card and/or mobile-money support for UGX and any other currencies (for example Flutterwave, Pesapal, DPO or Stripe where eligible). Use hosted checkout so card data never touches this server.
3. **Server-side integration:** set amounts and currencies on the server (allowlist plus minimum and maximum). Create the checkout session on the server. Treat payment as confirmed **only from a verified provider webhook** (signature check, then an amount, currency and reference match), never from a redirect or browser message. Add a unique provider event ID so each webhook is processed once, and a unique checkout reference so each payment gets one record. Keep payment acknowledgements separate from tax receipts.
4. **Data:** add a dedicated, reviewed migration for payment records, plus retention and accounting rules for financial records, which usually differ from enquiry retention.
5. **Secrets and verification:** add provider keys and the webhook secret to `.env.example` (names only) and `docs/DEPLOYMENT.md`. Test only in provider sandbox mode, and authorise any live test separately.

Until then, the amount selector and recurring-gift controls are deliberately absent.
