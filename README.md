# KCTF Website

An independent website for **Kigezi Community Transformation Foundation**, Rukungiri, Uganda. Next.js 16, React, TypeScript, Tailwind CSS 4 and GSAP. No CMS, authentication or database.

## Open in VS Code

1. Extract `kctf-website.zip`.
2. Open the **kctf-website** folder in VS Code.
3. Install Node.js **22.9 or newer** (Node 24 LTS recommended).
4. Open the integrated terminal in that folder:

```bash
npm ci
npm run build
npm start
```

Open the local URL printed by Next.js (normally `http://localhost:3000`). No credentials are required to preview the website. For editing with hot reload, use `npm run dev` instead of the build/start pair. On Windows, if PowerShell blocks `npm.ps1`, use the Command Prompt terminal or run `npm.cmd ci` and `npm.cmd run build`, then `npm.cmd start`.

The development adapter accepts Next's `--port` and `--hostname` options and managed preview aliases `--host` and `--strictPort`. It uses the normal Next.js development server. Production builds use the default Next.js compiler.

## Commands

```bash
npm run dev          # local development, hot reload
npm run typecheck    # generate Next types and check TypeScript
npm run lint         # ESLint
npm test             # validation and server-boundary tests (no email is sent)
npm run build        # production build
npm start            # serve that production build
npm run preview      # production server with preview-compatible CLI aliases
npm run format:check
```

## Pages

- `/` — cinematic introduction and 12-part storytelling composition
- `/about` — mission, vision, founder, proposed governance and starting location
- `/programmes` — four focus areas and anchored detail sections
- `/projects` — project listing
- `/projects/community-lion-conservation` — proposed project, targets, approach and budget
- `/get-involved` — volunteer interest, partnerships and support
- `/contact` — validated enquiry form and direct contact details
- `/privacy`, `/terms`, `/accessibility`, `/credits`
- `/sitemap.xml`, `/robots.txt`, `/opengraph-image`

## Source structure

```text
public/
  brand/                 Approved transparent KCTF logo
  images/                Local credited photography
src/
  app/                   Pages, metadata and enquiry endpoint
  components/
    layout/              Header, desktop mega menu, mobile dialog, footer
    motion/              GSAP / ScrollTrigger with reduced-motion support
    sections/            Hero, programme explorer, sticky story, enquiry form
    ui/                  Shared buttons, photographs, headers and calls to action
  content/site.ts        Foundation content, programmes and photo registry
  lib/                   SEO configuration and enquiry utilities
  validation/            Shared strict Zod schema
tests/                   Server and validation tests
docs/                    Source mapping, verification and release notes
scripts/                 Local development adapter
```

## Content and branding

Edit `src/content/site.ts` for contacts, mission, vision, programmes, targets and photography metadata. Page-specific narrative is in `src/app/**/page.tsx`. Theme variables and responsive rules live in `src/app/globals.css`.

The approved logo remains unaltered at `public/brand/kctf-logo.png`. The white header plate preserves the readability of its dark lettering. Photographs are illustrative, not evidence of KCTF activities or project locations. Credits and licence links are displayed beside photographs and on `/credits`; retain these when replacing images. Font licences are in `docs/licenses/`.

The source reference was **WilsoftTech/Each-herbarium**, commit `d590ed9584d74c6c466234436fd22e804e9f4bc7`. KCTF preserves its public design patterns with independent content and a lighter implementation. No changes were made to the reference repository. See `docs/DESIGN-SOURCE.md`.

## Enquiries: useful without credentials

The default form validates names, email, topic, consent and a 20–3,000 character message. It then opens a prefilled draft in the visitor's email application. The visitor reviews and sends that email themselves. The website never pretends an enquiry was delivered. Direct `mailto:` and telephone links work without JavaScript.

**No real email was sent during development or tests.**

### Activate direct web delivery later

1. Copy `.env.example` to `.env.local` (or configure the host's environment variables).
2. Set `SITE_URL` to the final canonical origin, e.g. `https://your-approved-domain`.
3. Configure a verified Resend sending domain and `ENQUIRY_FROM` sender; add `RESEND_API_KEY`.
4. Confirm the receiving inbox in `ENQUIRY_TO`.
5. Create a Cloudflare Turnstile widget for that hostname; set both Turnstile keys.
6. Review the privacy notice and confirm inbox retention and access arrangements with the foundation before enabling collection.
7. Set `ENQUIRIES_ENABLED=true` and rebuild/restart.
8. Run one authorised live delivery test, including inbox receipt and reply-to behaviour.

Without **all** required settings, the browser keeps the email-draft fallback and the API returns 503 for otherwise valid submissions. The API also enforces exact origin, JSON content type, a streamed 16KB body cap, strict server validation, a honeypot, bounded per-process burst limiting, and Turnstile verification of hostname and action. Resend receives a plain-text message with a validated reply-to address. There is no enquiry database.

The in-memory limiter is a burst guard, **not a distributed quota**. Turnstile is required for public delivery. Provider acceptance is reported as acceptance for delivery, not proof of inbox arrival. Provider failures and timeouts do not return success. Messages and secrets are not intentionally logged by application code.

## SEO and release configuration

Set `SITE_URL` before the production build so canonical URLs, sitemap, Open Graph and structured data point to the real domain. Without it, metadata uses localhost and marks pages `noindex`. Rebuild after changing it. No domain has been invented for KCTF.

Production security headers include CSP, anti-framing, referrer policy and content-type protection. Inline script/style support is retained for Next's rendering. The production CSP excludes eval. Local development uses Next’s normal script policy for debugging. The host should terminate HTTPS and supply its appropriate transport-security policy.

## Verification and remaining launch work

See `docs/VERIFICATION.md` and `docs/RELEASE.md`. Source and local checks are complete as documented. Publication, production email delivery and foundation approval of final policies remain separate launch steps. **Nothing has been deployed or published.**
