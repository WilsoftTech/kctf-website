import type { MetadataRoute } from "next";
import { content } from "@/content/repository";
import { indexable, siteUrl } from "@/lib/seo";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Non-indexable deployments publish an empty sitemap, matching robots and metadata.
  if (!indexable) return [];
  return (await content.getPublicRoutes()).map((route) => ({
    url: new URL(route.path, siteUrl).href,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
