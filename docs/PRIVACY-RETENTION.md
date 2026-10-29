# Privacy and retention

**29 October 2026 update:** [production-readiness corrections](PRODUCTION-READINESS-2026-10-29.md) adds independent short-lived HMAC admission/accepted counters, an append-only financial adjustment ledger (including pseudonymous operator/reason codes) and worker summaries. Adjustment records inherit the unresolved donation-financial-record retention policy and are never deleted by enquiry retention. Worker summaries contain counts/codes/IDs rather than submission content and are purged after 30 days by worker maintenance. Webhook bodies/signatures and raw payment payloads are not logged. This does not approve a retention policy or activate collection.

Added 27 October 2026. **No retention period has been approved.** This document describes the mechanism; the foundation must supply the policy.

## Configuration

| Setting                          | Effect                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ENQUIRY_RETENTION_DAYS`         | Whole days (1–3650) after which a stored enquiry becomes eligible for deletion. No default.                                                    |
| `RETENTION_POLICY_APPROVED=true` | Records that the foundation approved that period.                                                                                              |
| Both set                         | Online collection may be enabled; `/privacy` states the period; `npm run retention -- --execute` may delete.                                   |
| Either missing                   | Online mode is blocked (the form shows "unavailable" if `ENQUIRIES_ENABLED=true`); `/privacy` says no period is approved; deletion is refused. |

## Cleanup command

```bash
npm run retention                         # dry run with the configured period (or reports that none is set)
npm run retention -- --days 365           # dry run against a proposed period; never deletes
npm run retention -- --execute            # delete with the approved period
npm run retention -- --execute --include-undelivered
```

- Dry run is the default and prints only counts and the cutoff.
- `--execute` requires both settings; `--days` cannot be combined with `--execute`.
- Enquiries whose staff notification is not `sent` are held back unless `--include-undelivered` is given, so nothing is deleted before staff have seen it.
- Deletion runs in batches of 500; outbox rows cascade; expired abuse counters are purged at the same time.
- Nothing schedules this command. **Automated deletion is not enabled** and should only be added (for example as a scheduled job) after the policy is approved.

## Where enquiry data lives

| Location                                    | What                                                                       | Retention                                                                                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Neon database (`enquiries`, `email_outbox`) | Full enquiry and delivery state                                            | Until deleted by the retention command or an individual request.                                                                                |
| Neon history / backups                      | Point-in-time restore history of the branch                                | Neon's history window for the plan; deleted rows remain restorable until that window passes. Record the configured window in `docs/RELEASE.md`. |
| Staff email inbox                           | Notification copy and any replies                                          | The foundation's mailbox practice. The website cannot delete inbox copies; staff must apply the same period manually.                           |
| Resend                                      | Delivery logs and message content for the account                          | Resend's retention for the plan; review in the Resend dashboard/terms.                                                                          |
| Cloudflare Turnstile                        | Challenge telemetry                                                        | Cloudflare's terms. The website stores no Turnstile data.                                                                                       |
| Application logs (host)                     | Event names, ids, counts, error codes; **no enquiry content or addresses** | The host's log retention (for example Vercel's plan limits).                                                                                    |
| Host request logs                           | IP addresses, paths, times (not bodies)                                    | The host's terms.                                                                                                                               |
| `rate_limit_buckets`                        | HMAC digests of IP/email, counts                                           | At most about two hours plus the time to the next worker run or retention run.                                                                  |

## Individual requests

To answer an access or deletion request, staff find the enquiry by reference or email address in the database (for example with `npx prisma studio` against the right environment, or SQL by an administrator), export or delete that row (outbox rows cascade), and delete the inbox copy. There is no self-service or admin UI yet; see `docs/CMS-ROADMAP.md`.

## Privacy notice

`/privacy` is rendered at request time from configuration. It describes Neon storage, Resend delivery with Reply-To, Turnstile, access, retention (stating the configured period only when approved), backups and requests. The version is `PRIVACY_NOTICE_VERSION` in `src/content/privacy.ts`; each saved enquiry records it. Bump the version whenever the notice text changes.

## Online donations

Since notice version `2026-10-28c`, `/privacy#donations` describes online giving. It covers the fields stored in `donations` (name, email, amount, currency, method, optional message, reference, notice version, provider status and payment reference, timestamps, idempotency key and a digest of the status-link token), that Stripe and Pesapal collect card or mobile-money details on their own pages, what the site sends them (name, email, amount, reference), the staff and donor emails, and that the acknowledgement is not a tax receipt. `payment_events` keeps provider event IDs, types and outcome codes, never payloads.

| Location                                                   | What                                         | Retention                                                                                                |
| ---------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Neon (`donations`, `payment_events`, donation outbox jobs) | Donation records and processed events        | **Not yet decided.** Financial records; not touched by `npm run retention`. Decide before live payments. |
| Stripe / Pesapal                                           | Payment, card or mobile-money data, receipts | The providers' own legal retention.                                                                      |
| Staff inbox, Resend                                        | Notification and acknowledgement emails      | As for enquiry emails above.                                                                             |

Access or deletion requests for donation records may conflict with accounting obligations. Handle them case by case with the foundation's finance lead.

## Donation enquiries

Since notice version `2026-10-28b`, email-draft mode can also save a copy of the details the visitor enters (name, email, topic, message, notice version, channel `email_draft`). It is gated exactly like online collection: it stays off until a retention period is configured and `RETENTION_POLICY_APPROVED=true`. These copies are deleted by the same retention command; having no outbox job, they are never held back as undelivered.

Since notice version `2026-10-28`, the notice also describes the optional, click-to-load Google map on `/contact`: nothing is requested from Google until the visitor chooses to load it, Google then receives the IP address and referrer origin and may set cookies, and the foundation receives none of it. The map does not change what the foundation stores.

Since notice version `2026-10-27b`, the notice states that donation enquiries are handled like other enquiries, that the website never asks for card, bank or mobile-money details, and that Turnstile also runs on `/donate`. Donation enquiries share the enquiry table and the single retention period. No payment or financial records are stored. If online payments are added later, financial-record retention needs its own decision (see `docs/DONATIONS.md`).
