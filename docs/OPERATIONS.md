# Enquiries, email delivery and the outbox

Added 27 October 2026. This explains how online enquiries are saved and delivered, how to run and recover the outbox, and what the system does not guarantee.

## Form modes

`src/server/config.ts` decides the mode on every request:

| Mode          | When                                                                                                     | Visitor sees                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `email-draft` | `ENQUIRIES_ENABLED` is unset or `false`                                                                  | The form validates and opens a draft in the visitor's email app. Nothing is stored. The API returns 503.                |
| `online`      | `ENQUIRIES_ENABLED=true` **and** every required setting is valid, including an approved retention policy | The database-backed form with Turnstile.                                                                                |
| `unavailable` | `ENQUIRIES_ENABLED=true` but anything is missing or invalid                                              | "Online enquiries are temporarily unavailable" with direct email and phone. **Never** a silent fall back to draft mode. |

Misconfiguration is logged once per distinct problem as `enquiry_config_invalid`, naming variables only.

## Submission pipeline (`POST /api/enquiries`)

1. Exact `Origin` match with `SITE_URL`; `application/json` only; body streamed and capped at 16 KB regardless of `Content-Length`; strict UTF-8 and JSON.
2. Strict Zod validation shared with the browser, including the honeypot and a client-generated UUID `idempotencyKey`.
3. Mode check (above).
4. **Replay lookup**: if the key already exists with the same content hash, return `200 received` with the original reference. No second Turnstile check, nothing new written. Same key with different content returns `409`.
5. **Shared abuse limits** in Postgres: per trusted client IP 5 per 10 minutes, per email 3 per hour, global 100 per hour. Exceeding any returns `429`.
6. **Turnstile** server verification: success, hostname equals the `SITE_URL` host, action `enquiry`. Outages return `503 unavailable` (not saved).
7. **One transaction** inserts the enquiry and its `email_outbox` job. Only after commit does the API return `201 received`.
8. After the response, `after()` runs a small outbox batch so staff are usually notified within seconds.

The visitor is told the enquiry was **received and saved**, with a reference such as `KCTF-1A2B3C4D`. The site never says the email was sent.

If the transaction outcome is unknown (connection lost during commit), the API returns `503 unconfirmed`. The browser keeps the same key and offers **Try again**. A retry either finds the saved row (replay) or saves it once; the unique index on `idempotency_key` makes duplicates impossible even when retries race.

### Browser states

- **Received**: saved; reference shown; form cleared; status message focused.
- **Pending/unconfirmed**: network failure or `unconfirmed`; "Try again" reuses the key; direct email offered with a "you may already have submitted" note.
- **Failed**: definitely not saved (validation, verification, rate limit, outage, conflict). Field errors move focus to the first invalid field; outages offer "Email this enquiry instead" (a prefilled `mailto:`), which cannot duplicate a stored enquiry.
- Double clicks are ignored (in-flight guard plus disabled button). Turnstile tokens are reset after every attempt; expiry, timeout and load errors are handled with a retry control and direct contact details.
- Without JavaScript the form is disabled and server HTML explains how to email or call instead.

## Client IP trust

`TRUSTED_PROXY=vercel` reads `x-real-ip` (falling back to the first `x-forwarded-for` entry). Vercel documents that it overwrites these headers with the connecting client's address, so visitors cannot spoof them on Vercel. Any other value (`none`, the default) ignores forwarded headers completely and skips per-IP limits; per-email and global limits still apply. Do not set `vercel` behind another proxy or on another host.

IP and email values are reduced to `HMAC-SHA256(ABUSE_HASH_SECRET, value)` before storage. Buckets expire after twice their window (at most two hours) and are purged by each worker run and by the retention command.

## Staff notification

Built in `src/server/outbox/notification.ts` at send time from the stored enquiry:

- `from`: `ENQUIRY_FROM` (a verified Resend sender). The visitor is **never** the sender.
- `reply_to`: the visitor's validated address.
- `subject`: topic and reference only, with no visitor-controlled text.
- Donation enquiries (topic `donation`, from `/donate` or `/contact`) add the line "This is an enquiry about donating. No payment was requested or taken by the website." The visitor's success message also says that no payment has been made or taken. See `docs/DONATIONS.md`.
- `text` and `html` bodies; every visitor value is HTML-escaped in the HTML part.

## Outbox worker

`processOutbox()` in `src/server/outbox/worker.ts`:

- **Bounded batches** (default 10, maximum 50; 3 after a submission, 5 from the HTTP trigger).
- **Atomic claiming**: one `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED LIMIT n)` sets `processing`, increments `attempts`, stamps `claimed_at` and a random `claim_token`. Concurrent workers skip each other's rows.
- **Fencing**: every completion update matches `id` **and** `claim_token`. A worker whose lease was taken over cannot overwrite the newer result (`outbox_claim_lost` is logged).
- **Lease and stale-claim recovery**: a `processing` claim older than 10 minutes is reclaimed (`outbox_stale_claim_recovered`). If that claim had used the final attempt, the job becomes `failed` with `lease_expired_after_final_attempt`.
- **Retries**: timeouts, network errors, HTTP 408/409/429/5xx retry with exponential backoff (1, 2, 4 … minutes, capped at 6 hours, plus up to 20% jitter), up to `max_attempts` (8). Other 4xx responses fail immediately (likely configuration: unverified domain, bad key).
- **Provider idempotency**: every send uses `Idempotency-Key: kctf-outbox/<job id>`, stable across retries and workers.
- **Observable failure**: `status = 'failed'` with a sanitised `last_error`. The enquiry remains saved.

### Running the worker

| Where                  | How                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| After each submission  | Automatic (`after()`), best effort.                                                                                                                                                                                                                                                                                                 |
| Vercel (intended host) | `vercel.json` schedules `GET /api/outbox/run` daily at 06:17 UTC. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Set `CRON_SECRET` (at least 32 characters) in Production. On plans that allow it, change the schedule to every 5–15 minutes so retries follow the backoff. Cron jobs only run for production deployments. |
| Any other scheduler    | `POST` or `GET https://<site>/api/outbox/run` with `Authorization: Bearer <CRON_SECRET>`. Without a configured secret the endpoint returns 503; a wrong secret returns 401.                                                                                                                                                         |
| Operator / local       | `npm run outbox -- run` (loops batches until empty, up to `--max-batches`).                                                                                                                                                                                                                                                         |

### Inspecting and recovering

```bash
npm run outbox -- status          # counts by status and oldest job per status
npm run outbox -- failed          # failed job ids, attempts and error codes (no personal data)
npm run outbox -- requeue <id…>   # after fixing the cause; or --all-failed
npm run outbox -- run
```

The CLIs load `.env`/`.env.local`. Run them from a trusted machine with the target environment's variables, and never against production from a development checkout without intending to.

### Delivery guarantees and residual risks

Delivery is **at least once with provider-side deduplication. It is not exactly once.**

- Resend deduplicates requests with the same idempotency key for **24 hours** (Resend documentation at the time of writing; confirm before relying on it). A retry or requeue more than 24 hours after an uncertain attempt can send a second notification. With only a daily Vercel Cron, a timed-out attempt is next retried about a day later, close to that window; schedule the worker more often where possible.
- Provider acceptance is not inbox delivery. Bounces, spam filtering and mailbox problems are not tracked (no Resend webhooks yet). Staff should check the inbox and `npm run outbox -- status` periodically.
- A permanently failed job sends nothing until an operator requeues it; the enquiry stays in the database.
- If the after-response run is cut short and no scheduler is configured, notifications wait in `pending`.
- Changing `ENQUIRY_TO`/`ENQUIRY_FROM` between a timed-out attempt and its retry changes the payload; Resend may reject the reused key (409) until it expires.

## Logs

`src/server/log.ts` writes one JSON line per event with an allowlist of fields: identifiers (`enquiryId`, `outboxId`), counts, attempts, HTTP status and short error codes. Form contents, names, email addresses, tokens, secrets, connection strings and IP addresses are never logged. Unknown errors are reduced to a class name or code. Notable events: `enquiry_saved`, `enquiry_replay`, `enquiry_rate_limited`, `enquiry_save_uncertain`, `enquiry_config_invalid`, `outbox_sent`, `outbox_pending`, `outbox_failed`, `outbox_claim_lost`, `outbox_stale_claim_recovered`, `outbox_run`.
