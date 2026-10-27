# Configuration and deployment

Added 27 October 2026. Intended host: **Vercel** (Node.js runtime). Any Node host that runs `next start` also works, with `TRUSTED_PROXY=none` and an external scheduler for the outbox.

## Environment variables

**B** = read during `next build` (baked into prerendered pages, robots, sitemap and response headers). **R** = read by the running server per request. **CLI** = Prisma or operator commands. B variables must have the same values at runtime; rebuild after changing them.

| Variable                                 | When   | Required                              | Notes                                                                                                                                                                                  |
| ---------------------------------------- | ------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_ENVIRONMENT`                       | B, R   | Production, staging, preview          | `production`, `staging`, `preview`, `development` (default), `test`.                                                                                                                   |
| `SITE_URL`                               | B, R   | Production; online enquiries anywhere | Production: public `https` origin only. Rejects localhost/loopback/private hosts, credentials, ports, path, query, fragment. An invalid value fails the build.                         |
| `SITE_INDEXING`                          | B      | No                                    | `index` only takes effect in production. Default `noindex`.                                                                                                                            |
| `DATABASE_URL`                           | R, CLI | Online enquiries; outbox; retention   | Neon pooled string. Must not be local in production/staging.                                                                                                                           |
| `DIRECT_URL`                             | CLI    | Migrations                            | Neon direct string. Not needed by the running site.                                                                                                                                    |
| `SHADOW_DATABASE_URL`                    | CLI    | No                                    | Development `migrate dev` only.                                                                                                                                                        |
| `ENQUIRIES_ENABLED`                      | R      | No                                    | `true` switches to online mode; anything incomplete then shows "unavailable".                                                                                                          |
| `RESEND_API_KEY`                         | R      | Online; outbox                        | `re_…` sending key.                                                                                                                                                                    |
| `ENQUIRY_FROM`                           | R      | Online; outbox                        | Verified sender, e.g. `KCTF Website <enquiries@domain>`.                                                                                                                               |
| `ENQUIRY_TO`                             | R      | Online; outbox                        | 1–5 staff addresses, comma-separated.                                                                                                                                                  |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`         | R      | Online                                | Read by the server and passed to the form; **not** inlined into JavaScript (verified by the browser tests, which supply it only at runtime). Setting it at build time too is harmless. |
| `TURNSTILE_SECRET_KEY`                   | R      | Online                                | Server-only.                                                                                                                                                                           |
| `ABUSE_HASH_SECRET`                      | R      | Online                                | 32+ random characters. Rotating it resets current rate-limit windows.                                                                                                                  |
| `TRUSTED_PROXY`                          | R      | No                                    | `vercel` on Vercel; otherwise `none` (default).                                                                                                                                        |
| `CRON_SECRET`                            | R      | For scheduled outbox runs             | 32+ random characters. Vercel sends it to cron routes as a Bearer token.                                                                                                               |
| `ENQUIRY_RETENTION_DAYS`                 | R, CLI | Online; retention execution           | No default. Set only from an approved policy.                                                                                                                                          |
| `RETENTION_POLICY_APPROVED`              | R, CLI | Online; retention execution           | `true` once approved. Online collection and deletion both stay off until then.                                                                                                         |
| `TURNSTILE_VERIFY_URL`, `RESEND_API_URL` | R      | No                                    | Local test doubles. Refused unless `SITE_ENVIRONMENT` is `development` or `test` **and** the URL is loopback.                                                                          |
| `TEST_DATABASE_URL`                      | Tests  | No                                    | Disposable database for integration/browser tests.                                                                                                                                     |

`.env.example` lists exactly these variables. Variable names and rules are validated in `src/lib/site-config.ts` (site) and `src/server/config.ts` (server).

## Vercel project setup

1. Import the repository. Framework preset Next.js. Install `npm ci` (runs `prisma generate`), build `npm run build`.
2. **Production** environment variables: everything above for online mode, with `SITE_ENVIRONMENT=production`, `SITE_URL=https://<approved domain>`, `TRUSTED_PROXY=vercel`, `CRON_SECRET`. Set `SITE_INDEXING=index` only when the site should appear in search.
3. **Preview** environment variables: `SITE_ENVIRONMENT=preview` (always noindex). Leave `ENQUIRIES_ENABLED` unset (draft mode) unless a separate Neon preview branch, Turnstile hostname and staff test inbox are configured. Never give previews the production `DATABASE_URL`.
4. Staging, if used: `SITE_ENVIRONMENT=staging` with its own Neon branch.
5. `vercel.json` registers the daily outbox cron. Adjust the schedule to your plan (see `docs/OPERATIONS.md`).

## Production release steps

1. Complete the organisational decisions in `docs/RELEASE.md`. Do not enable online enquiries before the retention policy and privacy notice are approved.
2. Create the Neon production branch and roles; record the region.
3. Verify the Resend sending domain and sender; create the Turnstile widget for the production hostname.
4. Set the production variables (above). Keep `ENQUIRIES_ENABLED=false` for the first deploy.
5. Apply migrations deliberately: `npm run db:status`, then `npm run db:deploy -- --target <direct host>` (see `docs/DATABASE.md`).
6. Deploy. Check `/robots.txt`, `/sitemap.xml`, canonical tags and the `X-Robots-Tag` header match the intended indexing.
7. Set `ENQUIRIES_ENABLED=true` (plus retention values) and redeploy or restart. Confirm `/contact` shows the online form and `/privacy` states the approved period.
8. With explicit authorisation, submit one live test enquiry. Confirm the reference, the inbox notification, Reply-To behaviour, `npm run outbox -- status` showing `sent`, then delete the test enquiry with the foundation's agreed process.
9. Trigger the cron once (`curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/outbox/run`) and confirm a `200` with counts.

## Security headers

Production responses include CSP (Turnstile allowed), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, referrer and permissions policies. Non-indexable deployments add `X-Robots-Tag: noindex`. The host terminates HTTPS and supplies HSTS.
