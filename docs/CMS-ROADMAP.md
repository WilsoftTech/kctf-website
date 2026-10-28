# Future CMS roadmap

Status: **planned, not started.** No authentication, admin dashboard, CMS tables or CMS dependencies exist. This records the intended direction so current work does not block it.

## Today's boundary

- Public content lives in `src/content/site.ts` (settings, navigation, programmes, photographs, project targets and stages) and in page narratives under `src/app/**/page.tsx`.
- `src/content/repository.ts` defines `ContentRepository` and exports `content`, currently the static implementation. The sitemap, `/llms.txt` and programmes page already read through it. `getPublicRoutes()` returns each page's path, title and optional genuine `lastModified` date; a CMS must return published records only and supply real modification dates (see `docs/SEO.md`). Other server pages still import the static modules directly and should move to the repository as each content type is migrated.
- The header and mobile menu are client components that import static navigation and programme lists. When those become CMS-managed, the server layout should read them and pass them as props.

A CMS implementation replaces `staticContentRepository` with one that returns **published** records only. Pages and metadata routes keep calling `content.*`.

## Content types

| Type       | Notes                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pages      | Structured sections for About, Get Involved, legal pages; slug, SEO title/description, Open Graph image.                                                                                                           |
| Programmes | Name, short label, summary, body, activities, photograph, order.                                                                                                                                                   |
| Projects   | Status (proposed/active/completed), targets, stages, budget summary, locations, related programmes.                                                                                                                |
| Articles   | Dated news/updates replacing the homepage planning placeholder; author, publish date, summary, body.                                                                                                               |
| Media      | Images with alt text, caption, author, source, licence and licence URL (credits are mandatory, as today).                                                                                                          |
| Partners   | Name, logo, description, link, relationship status, approval evidence.                                                                                                                                             |
| Team       | Name, role, biography, portrait with consent record, display order.                                                                                                                                                |
| Donations  | `/donate` copy (intro, proposed support areas, panel, partnership, FAQ) and the homepage section; today `src/content/donate.ts` via `content.getDonationPage()`. Changes to payment status need Reviewer approval. |
| Settings   | Contact details, address, social links, organisation status disclosures.                                                                                                                                           |

## Roles

| Role          | Can                                                                                     |
| ------------- | --------------------------------------------------------------------------------------- |
| Administrator | Manage users and roles, settings, all content, archive and restore; view audit history. |
| Editor        | Create and edit drafts; submit for review; edit media metadata.                         |
| Reviewer      | Review submitted content, request changes, publish and unpublish.                       |

Separation: an Editor cannot publish their own change unless also a Reviewer; every transition is recorded in an audit log (who, when, from, to).

## Workflow

`Draft → Review → Published → Archived`, with `Review → Draft` (changes requested) and `Archived → Draft` (restore). A published record keeps serving its last published version while a new draft is edited (versioned content).

## Server-enforced authorisation

- Authentication and session handling on the server. Every mutation is a Server Action or Route Handler that checks the role and the allowed transition itself. Hiding buttons is not authorisation.
- Admin routes live under a separate segment (for example `/admin`) excluded from the sitemap, `robots.txt`-disallowed and `noindex`; responses `Cache-Control: private, no-store`.
- Staff access to enquiries (read, export, delete for individual requests) belongs here too, with the same audit trail.

## Preventing unpublished content leaks

- The public repository only queries `status = 'published'` (and `publishedAt <= now`). Draft access goes through a separate, authenticated preview API, never the public one.
- Routes: `generateStaticParams`, dynamic routes and `notFound()` checks use the published query; an unpublished slug returns 404, not a draft.
- Metadata: `generateMetadata`, Open Graph images, JSON-LD and canonical URLs come from the published record only.
- Search: the sitemap and any search index are built from published content; archived content is removed.
- Caches: tag published content (`cacheTag`) and revalidate on publish, unpublish and archive. Draft preview responses are uncached and private. Never cache an authenticated response publicly.
- APIs: no endpoint returns drafts without authentication; list endpoints filter by status server-side.

## Media storage

Decide before building: object storage (for example Vercel Blob, Cloudflare R2 or S3) with image optimisation via `next/image` remote patterns and a CSP update. Store licence and consent metadata with each asset; keep originals private when consent is limited. Plan alt-text requirements and a size limit at upload.

## Migration from static content

1. Add CMS tables in a dedicated migration only when the CMS phase starts.
2. Write an idempotent import script that reads `src/content/site.ts` and page narratives, creates records as `Published`, and copies `public/images` into media storage with their credits.
3. Switch `content` to the CMS repository behind a flag; compare rendered pages and the sitemap with the static build.
4. Remove static modules only after parity is confirmed.
