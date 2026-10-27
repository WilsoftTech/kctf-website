import type { MetadataRoute } from "next";
import { indexable, siteUrl } from "@/lib/seo";
export default function robots(): MetadataRoute.Robots {
  // Staging, preview and unconfigured builds ask crawlers to stay out entirely.
  if (!indexable) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: new URL("/sitemap.xml", siteUrl).href,
  };
}
