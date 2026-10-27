# Privacy and retention

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

## Donation enquiries

Since notice version `2026-10-27b`, the notice states that donation enquiries are handled like other enquiries, that the website never asks for card, bank or mobile-money details, and that Turnstile also runs on `/donate`. Donation enquiries share the enquiry table and the single retention period. No payment or financial records are stored. If online payments are added later, financial-record retention needs its own decision (see `docs/DONATIONS.md`).
