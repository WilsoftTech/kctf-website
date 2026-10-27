# Release notes and launch steps

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
