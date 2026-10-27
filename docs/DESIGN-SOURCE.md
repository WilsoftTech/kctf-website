# EACH reference and KCTF adaptation

## Read-only source reference

Repository: https://github.com/WilsoftTech/Each-herbarium

Pinned commit: `d590ed9584d74c6c466234436fd22e804e9f4bc7`.

Inspected through the connected GitHub account: repository tree, global CSS, hero, hero-motion, desktop/mobile navigation, site header, programme explorer, story scroller, homepage route and homepage view, media registry, photo README and package manifest. Only read operations were used. No branches, commits, files or settings were changed in EACH.

## Preserved design and component patterns

| EACH pattern                                                     | KCTF implementation                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Fraunces display / Geist body                                    | Locally served Fontsource variable fonts                      |
| Green #176B28 / blue #087DB9 / charcoal #151A18 / ivory #F6F7F2  | Core theme with a softer light-green accent                   |
| max-w-7xl / fluid 80–144px spacing / 80px header / small corners | Matching container, spacing, header and corner rhythm         |
| Transparent hero header turning solid after scroll               | `components/layout/site-header.tsx`                           |
| Animated desktop mega menu and full-screen mobile navigation     | Hover/keyboard programme panel and native modal mobile dialog |
| Cinematic hero, CSS masked headline / 2.6s photo settle          | `components/sections/hero.tsx`                                |
| GSAP / ScrollTrigger hero parallax and section motion            | `components/motion/motion.tsx`                                |
| Programme list with hover/focus photograph changes               | `components/sections/program-explorer.tsx`                    |
| CSS sticky story and intersection-based chapter changes          | `components/sections/story-scroller.tsx`                      |
| Light/dark editorial sections, split features and action panels  | Shared primitives and homepage composition                    |
| Reduced motion and useful server-rendered content                | CSS media rules; content starts visible; direct contact links |

The implementation adapts the public patterns into a smaller independent codebase; it does not copy EACH's CMS, authentication, database, staff console or operational configuration. (Update, 27 October 2026: KCTF now has its own independent Neon/Prisma database for enquiries, designed for this project. Nothing was taken from EACH, and EACH was not modified. See `docs/DATABASE.md`.) This is design parity in visual language and composition, not a claim of pixel-perfect parity with a rendered EACH build.

## Twelve-part homepage rhythm

1. Photographic hero.
2. Foundation statement.
3. Four-pillar programme explorer.
4. Natural heritage and community story chapters.
5. Featured lion conservation initiative.
6. Starting location in Bunura.
7. Conservation education.
8. Community participation.
9. People-and-nature full-bleed statement.
10. Volunteer and partnership panels.
11. Planning-stage update.
12. Final invitation and institutional footer.

## Content authority

Read current documents from the supplied `Kigezi Community Transformation Project.zip`:

- `Foundation Constitution.docx` supersedes the earlier placeholder constitution for mission, objectives and Bunura address.
- `Contacts.docx` confirms founder, telephone and email.
- `03_Lion_Conservation_Workplan_Budget.docx` supplies the 12-month proposal, targets, safeguards and £6,960 budget.
- Registration application and founder background provide context. Unverified population claims and ambitious fencing/enforcement promises from the early narrative are not published.

The approved transparent `KCTF Green Blue Transformation Logo.png` is used without redesign.

## Photography

Five credited Commons landscape photographs were obtained from EACH's public image directory at the pinned commit, with attribution and licence metadata retained. A separate CC0 lion photograph by Alvinategyeka was sourced from Commons:

https://commons.wikimedia.org/wiki/File:Lion_in_Queen_Elizabeth_National_Park_Uganda_01.jpg

Original source metadata identifies a lion in Queen Elizabeth National Park and CC0 dedication. All photos illustrate themes; no official partnership, KCTF field activity or ownership is implied. The photo registry in `src/content/site.ts` is the source of visible attribution.

## Photography replacement — 27 October 2026

The initial photo reuse described above is historical. The audit branch removes all six initial KCTF photos and replaces them with a separately sourced western Uganda set: Rubirizi landscapes, Lake Rutoto, Kisiizi Falls heritage, Ishasha lions and Bakiga Ekizino dance in Kanungu. Current attribution and source links are maintained in `src/content/site.ts` and `/credits`. The original EACH repository is unchanged. See `docs/AUDIT-2026-10-27.md` for remaining launch requirements.
