import type { MetadataRoute } from "next";
import { content } from "@/content/repository";
import { indexable, siteUrl } from "@/lib/seo";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Non-indexable deployments publish an empty sitemap, matching robots and metadata.
  if (!indexable) return [];
  // `lastmod` only where a genuine date is known; changefreq and priority are omitted
  // because Google ignores them and they would only be guesses.
  return (await content.getPublicRoutes()).map((route) => ({
    url: new URL(route.path, siteUrl).href,
    ...(route.lastModified ? { lastModified: route.lastModified } : {}),
  }));
}
