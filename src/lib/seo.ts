import type { Metadata } from "next";
import { site } from "@/content/site";
import { readSiteConfig } from "@/lib/site-config";
// Evaluated once per build/server start. An invalid production SITE_URL fails the build.
export const siteConfig = readSiteConfig();
for (const warning of siteConfig.warnings) console.warn(`[site] ${warning}`);
export const siteUrl = siteConfig.origin;
export const indexable = siteConfig.indexable;
export function metadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | ${site.shortName}`,
      description,
      url: path,
      type: "website",
      images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
    },
  };
}
