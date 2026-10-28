import type { MetadataRoute } from "next";
import { aiTrainingCrawlers } from "@/lib/site-config";
import { indexable, siteConfig, siteUrl } from "@/lib/seo";
export default function robots(): MetadataRoute.Robots {
  // Staging, preview and unconfigured builds ask crawlers to stay out entirely.
  if (!indexable) return { rules: { userAgent: "*", disallow: "/" } };
  // Robots rules are advisory, not access control. /api/ holds no public content and the
  // enquiry endpoints are protected on the server.
  const rules: MetadataRoute.Robots["rules"] = [
    { userAgent: "*", allow: "/", disallow: "/api/" },
  ];
  // Search crawlers stay allowed either way; this only opts out of AI model training.
  if (siteConfig.aiTraining === "disallow")
    rules.push({ userAgent: [...aiTrainingCrawlers], disallow: "/" });
  return {
    rules,
    sitemap: new URL("/sitemap.xml", siteUrl).href,
  };
}
