# Verification report

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
