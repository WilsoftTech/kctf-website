# Release notes and launch steps

This delivery is an independent source project. No Site was registered, no GitHub repository was created or modified, and nothing was deployed or published.

## Before public launch

- Confirm the foundation's final cleared name, registration/adoption status and wording. Until then, retain the proposed-status disclosures.
- Confirm project outreach locations, permissions, budget assumptions and any eventual funding or partnerships before updating claims.
- Approve the final domain and set `SITE_URL` before rebuilding.
- Approve the privacy/terms text, inbox retention period and staff access arrangements. The current privacy notice explicitly says a fixed inbox retention period has not been published.
- Configure verified email sending and Turnstile if direct web submissions are wanted. Email-draft mode is usable in the meantime.
- Run a real email test only with authorisation. Mocked provider tests do not prove deliverability.
- Run mobile-device and assistive-technology checks on the intended host, then performance/accessibility scans. Local source checks are not a certification of WCAG compliance.
- Obtain the user's approval before any deployment or publication.

## Hosting

Use a Node-compatible Next.js host such as Vercel or a Node server. This project includes server routes and is not a static export. Install with `npm ci`, build with `npm run build`, serve with `npm start`. Server environment variables must remain private. The repository does not contain real API keys.

## Deliberately omitted

CMS, authentication, database, payment collection, volunteer accounts and invented institutional achievements.
