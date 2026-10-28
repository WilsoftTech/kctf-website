# Search, AI discoverability and the contact map

Added 28 October 2026, branch `feature/seo-discoverability`. Nothing described here has been deployed, submitted to a search engine or verified on a live host. **No claim is made that the site ranks, is indexed or appears in any AI answer.**

## 1. Indexing model

One switch decides whether a deployment is indexable: `SITE_ENVIRONMENT=production` **and** `SITE_INDEXING=index`, with a valid public `https` `SITE_URL` (an invalid value fails the build). As defence in depth, a Vercel deployment whose `VERCEL_ENV` is not `production` is never indexable, even if it was given production settings by mistake. Everything below follows from that one switch.

| Surface                        | Indexable production                         | Staging, preview, development, test       |
| ------------------------------ | -------------------------------------------- | ----------------------------------------- |
| `<meta name="robots">`         | `index, follow`                              | `noindex, nofollow`                       |
| `X-Robots-Tag` header          | Only on `/api/*` (`noindex`)                 | `noindex` on every response               |
| `/robots.txt`                  | Allow `/`, disallow `/api/`, `Sitemap:` line | `Disallow: /`, no sitemap                 |
| `/sitemap.xml`                 | All canonical public pages                   | Empty                                     |
| `/llms.txt`                    | Served (with `X-Robots-Tag: noindex`)        | 404                                       |
| Canonical, Open Graph, JSON-LD | Absolute URLs on `SITE_URL`                  | Absolute URLs on that deployment's origin |
| Verification meta tags         | Rendered when configured                     | Never rendered                            |

Robots rules are advisory, not access control. Nothing private is served from a public URL: enquiry data is only in Neon, `/api/enquiries` accepts POSTs only, and `/api/outbox/run` requires `CRON_SECRET`. There are no draft, archived or admin routes yet; when the CMS adds them they must be excluded at the server, as `docs/CMS-ROADMAP.md` describes.

**Unknown URLs** return HTTP 404 with a `noindex` meta tag (injected by Next.js) and links to the main pages. The layout's `index, follow` tag is also present on that page; crawlers apply the most restrictive directive, so 404 pages stay unindexed.

**Alternate hostnames.** A Vercel production deployment is also reachable on its `*.vercel.app` alias. Its canonical tags point to `SITE_URL`, but the owner should also redirect the alias (and `www`/apex) to the canonical domain in the Vercel domain settings.

## 2. Metadata ownership

| What                                           | Where                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Site name, summary, address                    | `src/content/site.ts` (`site.summary` is the one-sentence factual description reused everywhere) |
| Title template, defaults, robots, verification | `src/app/layout.tsx`                                                                             |
| Per-page title and description                 | Each `src/app/**/page.tsx` (`/donate` reads `src/content/donate.ts`)                             |
| Canonical, Open Graph, X card                  | `metadata()` in `src/lib/seo.ts`                                                                 |
| Social image                                   | `src/app/opengraph-image.tsx` (1200×630, branded, with alt text)                                 |

Next.js merges metadata **shallowly**: a page that sets `openGraph` replaces the layout's entire object. Before this branch, every page therefore lost `og:site_name` and `og:locale`, and no page had `og:image:alt`. `metadata()` now sets the complete Open Graph and X/Twitter objects on every page. Titles are unique and at most 65 characters including the `| KCTF` suffix, and descriptions are unique and 70–160 characters. Unit tests enforce both rules for every route in the sitemap.

## 3. Structured data (JSON-LD)

| Entity           | Where                  | `@id`                      |
| ---------------- | ---------------------- | -------------------------- |
| `Organization`   | Every page (layout)    | `{SITE_URL}/#organization` |
| `WebSite`        | Every page (layout)    | `{SITE_URL}/#website`      |
| `BreadcrumbList` | Every page except home | `{page URL}#breadcrumb`    |
| `FAQPage`        | `/about`, `/donate`    | `{page URL}#faq`           |

Rules followed:

- **Only facts shown on the website.** Name, short name, summary, logo, email, telephone, postal address, founder and a general-enquiries contact point. The following are deliberately **absent** because they are not verified: registration or tax-exempt status, founding date, social profiles (`sameAs`), coordinates (`geo`), opening hours, ratings, reviews and partnerships. A unit test fails if any of these appear.
- **`Organization`, not `NGO` or `LocalBusiness`.** KCTF is not a business with customer-facing premises or hours, and its legal status is unconfirmed. Revisit `NGO` once registration is confirmed.
- **Breadcrumbs** are rendered from the same data as the visible breadcrumb trail (`src/components/seo/structured-data.tsx`), so the two cannot disagree. The lion project page now has a visible trail in its hero.
- **FAQPage** describes only questions visible on the same page, from the same content arrays. Google currently limits FAQ rich results to well-known government and health sites, so **no FAQ rich result is expected**. The markup is kept because it accurately describes the page for other consumers.
- **Article** was not added: the site has no genuine dated articles. Add `Article` (with author, `datePublished` and `dateModified`) only when real dated updates exist.
- JSON-LD is server-rendered and escaped against `</script>` break-out.

Validate after deployment with the [Rich Results Test](https://search.google.com/test/rich-results) and the [Schema Markup Validator](https://validator.schema.org/).

## 4. Sitemap and robots

- `src/content/repository.ts` (`getPublicRoutes`) is the single list of canonical, indexable pages. It has 12 entries: home, about, programmes, projects, the lion project, get involved, donate, contact, privacy, terms, accessibility and credits. It excludes `/api/*`, metadata routes, query-string variants such as `/contact?topic=…`, the 404 page and anything unpublished. The database holds only enquiries, so there is no published database content to add. A future CMS must return published records only.
- **`lastmod`** is given only where a genuine date exists: `/privacy` uses the date in `PRIVACY_NOTICE_VERSION`. Other pages have no reliable modification date, so `lastmod` is omitted rather than guessed (a build timestamp would be false freshness). `changefreq` and `priority` were removed because Google ignores them and they were guesses.
- One sitemap file is enough: the 50,000-URL limit is far away.
- `robots.txt` points to the sitemap on the canonical `https` origin and does not block `/_next/` assets, images or the social image.

## 5. AI search and answer engines

### What the official documentation says (checked 28 October 2026)

- **Google** ([AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)): there are no additional requirements or special optimisations for AI Overviews or AI Mode. A page needs to be indexed and eligible for a snippet, and no special files, "AI text files" or schema are needed. `Google-Extended` is a robots.txt token that controls use for Gemini training and grounding, and Google states that it "does not impact a site's inclusion in Google Search" ([Google crawlers](https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers)).
- **OpenAI** ([bots](https://developers.openai.com/api/docs/bots)): `OAI-SearchBot` controls appearance in ChatGPT search, and `GPTBot` collects training data. `ChatGPT-User` is user-initiated, and robots.txt may not apply to it.
- **Perplexity** ([bots](https://docs.perplexity.ai/guides/bots)): `PerplexityBot` indexes for search results and is not used for training. `Perplexity-User` is user-initiated and generally ignores robots.txt.
- **Anthropic** ([help centre](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)): `ClaudeBot` collects training data, `Claude-SearchBot` indexes for search and `Claude-User` serves user requests.
- **Bing/Copilot**: Bing uses Bingbot and the normal index. In 2023 Bing announced that the `nocache` and `noarchive` robots meta values limit how page content is used in its chat answers ([Bing Webmaster blog, September 2023](https://blogs.bing.com/webmaster/september-2023/Announcing-new-options-for-webmasters-to-control-usage-of-their-content-in-Bing-Chat)). Neither is set here, because the foundation wants its public information to be usable and cited.

### Policy implemented

- **All search and answer-engine crawlers are allowed** (Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, Claude-SearchBot and user-initiated fetchers) through the `*` rule.
- **AI-training crawlers are an owner decision**, set by `SITE_AI_TRAINING`:
  - `allow` (default, unchanged behaviour): no crawler-specific rules.
  - `disallow`: adds `Disallow: /` for `GPTBot`, `Google-Extended`, `ClaudeBot`, `Applebot-Extended` and `CCBot` only. Search crawlers are unaffected, and a unit test checks this.
  - The default stays `allow` because the content is public, non-commercial information that the foundation wants represented accurately. The foundation may choose otherwise.

### Content work

- One factual summary sentence (`site.summary`) is used for the home description, `Organization.description` and `llms.txt`. It states the planning-stage status.
- **"KCTF at a glance"** on `/about`: five short, visible answers about what KCTF is, where it is, whether it is registered, whether the lion project is running and how to help. Every answer restates facts already on the site.
- The distinction between proposed and completed work is explicit in titles ("proposed initiative"), descriptions, the FAQ, `llms.txt` and the existing page notices.
- The name, address, email and telephone are identical everywhere because they all come from `site`.
- Photos keep their author and licence attribution beside each image and on `/credits`. There are no articles, so author and publication-date markup does not apply yet.
- Not done, by design: no hidden text, keyword lists, doorway pages, fabricated citations or claims of impact.

### `llms.txt` (experimental)

`/llms.txt` follows the community [llms.txt proposal](https://llmstxt.org/). **It is not a web standard. Google, Bing and the AI providers above do not require it, and it does not guarantee visibility in any AI product.** It is generated from the same content as the site: the summary, the at-a-glance answers, contact details and canonical links to the 11 inner pages. It is served only on the indexable deployment and carries `X-Robots-Tag: noindex` so it does not compete with the pages themselves. Remove `src/app/llms.txt/` if it is not wanted.

## 6. Performance and images (measured)

Lab measurements were taken with `scripts/measure-vitals.ts`: a local production build, Playwright Chromium with Pixel 7 emulation, network throttled to about 1.6 Mbps and 150 ms RTT, and 4× CPU slowdown. Lab numbers vary by about ±1 s between runs and are not field data. Search engines use field data (Chrome UX Report or the Search Console Core Web Vitals report), which needs real traffic after launch.

| Route                                   | LCP before | LCP after              | Image KB before → after | Transfer KB before → after |
| --------------------------------------- | ---------- | ---------------------- | ----------------------- | -------------------------- |
| `/`                                     | 2.9 s      | 2.0–2.2 s (warm cache) | 266 → 71                | 621 → 429                  |
| `/about`                                | 4.5 s      | 2.6–3.6 s              | 482 → 161               | 821 → 506                  |
| `/projects/community-lion-conservation` | 4.6 s      | 2.7 s                  | 496 → 172               | 845 → 529                  |
| `/donate`                               | 4.5 s      | 2.6–2.7 s              | 496 → 172               | 831 → 512                  |
| `/contact`                              | 1.0 s      | 1.2 s                  | 165 → 13                | 494 → 350                  |

CLS was 0 everywhere except `/donate` (0.014 before and after). Both changes were driven by these measurements:

1. **Header logo.** It was declared at 1774 px without `sizes`, so high-density phones downloaded the 3840 px variant (164 KB, on every page) for a slot about 124 px wide. It now has `sizes="124px"` (12 KB). The deprecated `priority` prop was replaced with `loading="eager"`. The footer logo also has `sizes`.
2. **AVIF before WebP** (`images.formats`). The hero and feature photos are about 55% smaller. The first request for each size is slower while the server encodes it; later requests are served from the image cache. The first post-deploy visit to a page may be slower.

The map reserves its box with `aspect-ratio`, before and after loading. A browser test checks that the box size does not change.

## 7. Contact map

**Verified address:** Bunura Cell, Rwakabengo Ward, Southern Division, Rukungiri Municipality, Uganda. **No exact office pin or Google Maps place has been confirmed, and no coordinates are published anywhere.**

How it works (`src/components/sections/contact-map.tsx`, rendered on `/contact#find-us`):

- **Click to load.** Nothing is requested from Google until the visitor selects "Load Google map". The button is disabled until hydration, and without JavaScript the external links still work. A browser test confirms that no Google request is made before the click.
- **Embed method:** the official [Maps Embed API](https://developers.google.com/maps/documentation/embed/get-started) in `place` mode with the address as the query. Google states that Embed API requests are free with unlimited usage, but they need an API key.
- **Approximate by design.** The iframe title and a visible note say the map shows Google's search result for the address, not a confirmed office pin. `officeLocation.verifiedPin` in `src/content/site.ts` is `false`.
- **Always available:** the written address, an "Open in Google Maps" search link and a "Get directions" link. Both use keyless [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) and open in a new tab with `rel="noopener noreferrer"`. Email, telephone and the enquiry form sit above the map and do not depend on it.
- **Loading and failure:** a "Loading map…" status. If no load event arrives within 15 seconds, guidance points to the Google Maps link. A browser test simulates a map that never loads.
- **Accessibility and layout:** descriptive iframe `title`, keyboard-operable button, `loading="lazy"`, `referrerpolicy="strict-origin-when-cross-origin"` (Google's documented example) and a reserved aspect ratio (16:10, or 1:1 on small screens).
- **Without a key** the placeholder explains that an embedded map is not available and the links remain.

### API key (`GOOGLE_MAPS_EMBED_API_KEY`)

The embed key appears in the iframe URL, so it is **public by nature**. It is read by the server at request time and is never inlined into the JavaScript bundle. A malformed value is ignored and logged once without its value. Before setting it in production:

1. Create the key in a Google Cloud project owned by the foundation, with the **Maps Embed API** enabled.
2. **API restriction:** Maps Embed API only.
3. **Application restriction:** websites (HTTP referrers), limited to the production domain, for example `https://<domain>/*`, plus a separate key for any preview domain if a map is wanted there.
4. Never reuse a server or unrestricted key here.

### Content Security Policy

`frame-src` now allows `https://challenges.cloudflare.com` and **only the path** `https://www.google.com/maps/embed/v1/`. The map's own scripts and tiles load inside Google's frame under Google's policy, so no other origin is added to `script-src`, `img-src` or `connect-src`. `frame-ancestors 'none'` and `X-Frame-Options: DENY` are unchanged. A browser test confirms that the embed path is permitted and that another Google Maps URL (the unofficial `output=embed` form) is blocked.

### Making the pin exact later

When the foundation confirms the office on Google Maps (ideally a verified place with a place ID):

1. Set `officeLocation.query` to `place_id:<ID>` and `verifiedPin: true` in `src/content/site.ts`.
2. Update the map's iframe title and remove the approximate-area note if no longer true (they follow `verifiedPin`).
3. Consider adding `geo` or `hasMap` to `Organization` only then.

### Privacy

The privacy notice (version `2026-10-28`) has an "Optional Google map" section (`/privacy#map`): the map is opt-in, Google receives the IP address and referrer origin, Google may set cookies, the foundation receives nothing and the result is approximate.

## 8. Owner actions for search engines

None of these have been done. Each needs the foundation's own accounts and authorisation.

1. **Before launch:** choose the final domain, set `SITE_URL`, set `SITE_INDEXING=index` only when ready, redirect `*.vercel.app` and `www`/apex variants to the canonical host, and decide `SITE_AI_TRAINING`.
2. **Google Search Console:** add a property. A **Domain property** (DNS TXT record) is recommended. Alternatively, use a URL-prefix property with the HTML-tag method by setting `GOOGLE_SITE_VERIFICATION` to the token only (the `content` value) and redeploying. Then submit `https://<domain>/sitemap.xml` under Sitemaps.
3. **Bing Webmaster Tools:** import from Search Console, or verify with the meta tag by setting `BING_SITE_VERIFICATION` to the `msvalidate.01` token. Submit the same sitemap.
4. **Inspect key pages** with URL Inspection (Google) and URL Inspection (Bing): `/`, `/about`, `/programmes`, `/projects/community-lion-conservation`, `/contact` and `/donate`. Confirm "URL is on Google" or that indexing is allowed, the user-declared canonical, rendered HTML and the detected structured data. Run the Rich Results Test on `/` and `/about`.
5. **Social previews:** paste a URL into a sharing debugger (for example LinkedIn Post Inspector or Facebook Sharing Debugger) to confirm the image, title and description.
6. **Google Business Profile:** only if KCTF serves people in person at a staffed location it can verify, or as a service-area organisation, and the address and pin are confirmed. Until then, do not create one. The website does not depend on it.
7. **IndexNow (optional, Bing and others):** not implemented. Content changes only with code deployments, a few times a year, and the sitemap is enough. It becomes worthwhile when a CMS publishes frequently: generate a key file, host it at the root, and ping on publish.
8. **After traffic exists:** check the Core Web Vitals and Page indexing reports, and Bing's AI performance reporting if it is available to the account.

## 9. Verification commands

```bash
npm run typecheck && npm run lint && npm run format:check
npm test                                  # unit: metadata, robots, sitemap, JSON-LD, llms.txt, maps
npm run test:e2e                          # browser: JSON-LD, breadcrumbs, 404, map, CSP
npm run build && npm start                # then, in another terminal:
npx tsx scripts/measure-vitals.ts http://localhost:3000
```

To preview production output locally without publishing, build with `SITE_ENVIRONMENT=production SITE_URL=https://<domain> SITE_INDEXING=index` and inspect `/robots.txt`, `/sitemap.xml`, `/llms.txt` and page `<head>` tags. Rebuild with your normal settings afterwards.
