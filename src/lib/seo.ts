import type { Metadata } from "next";
import { site } from "@/content/site";
import { readSiteConfig } from "@/lib/site-config";
// Evaluated once per build/server start. An invalid production SITE_URL fails the build.
export const siteConfig = readSiteConfig();
for (const warning of siteConfig.warnings) console.warn(`[site] ${warning}`);
export const siteUrl = siteConfig.origin;
export const indexable = siteConfig.indexable;

export const absoluteUrl = (path: string) => new URL(path, siteUrl).href;

// Shared by every page. Next merges metadata shallowly, so a page that sets `openGraph`
// replaces the layout's object entirely: these fields are repeated on each page.
const socialImage = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Kigezi Community Transformation Foundation (KCTF), Rukungiri, Uganda: protecting nature, empowering people.",
};

/**
 * Per-page metadata: title, description, canonical URL, Open Graph and X/Twitter card.
 * `title` is combined with the layout template ("%s | KCTF") unless it is `{ absolute }`.
 */
export function metadata(
  title: string | { absolute: string },
  description: string,
  path: string,
): Metadata {
  const fullTitle =
    typeof title === "string" ? `${title} | ${site.shortName}` : title.absolute;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: fullTitle,
      description,
      url: path,
      siteName: site.name,
      locale: "en_UG",
      type: "website",
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [socialImage],
    },
  };
}

// ── Structured data (JSON-LD) ───────────────────────────────────────────────────────
// One Organization and one WebSite entity for the whole site, referenced by stable @id
// from page-level nodes. Only facts shown on the website are described: no registration,
// tax status, opening hours, coordinates, ratings or social profiles (see docs/SEO.md).

export const organizationId = `${siteUrl}/#organization`;
export const websiteId = `${siteUrl}/#website`;

export function siteGraph() {
  return [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: site.name,
      alternateName: site.shortName,
      url: absoluteUrl("/"),
      description: site.summary,
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/brand/kctf-logo.png"),
        width: 1774,
        height: 887,
      },
      email: site.email,
      telephone: site.telephone,
      address: { "@type": "PostalAddress", ...site.postalAddress },
      founder: { "@type": "Person", name: site.founder },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "general enquiries",
        email: site.email,
        telephone: site.telephone,
        availableLanguage: "en",
      },
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      url: absoluteUrl("/"),
      name: site.name,
      alternateName: site.shortName,
      inLanguage: "en",
      publisher: { "@id": organizationId },
    },
  ];
}

export type Crumb = { name: string; path: string };

export function breadcrumbList(trail: readonly Crumb[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(trail[trail.length - 1].path)}#breadcrumb`,
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/** Only for questions and answers that are visible on the same page. */
export function faqPage(
  path: string,
  items: readonly (readonly [string, string])[],
) {
  return {
    "@type": "FAQPage",
    "@id": `${absoluteUrl(path)}#faq`,
    url: absoluteUrl(path),
    isPartOf: { "@id": websiteId },
    about: { "@id": organizationId },
    mainEntity: items.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

/** Serialises JSON-LD safely for an inline script (no `</script>` break-out). */
export function jsonLd(graph: object | object[]) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": Array.isArray(graph) ? graph : [graph],
  }).replace(/</g, "\\u003c");
}
