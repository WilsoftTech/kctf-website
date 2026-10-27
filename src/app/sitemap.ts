import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "/",
    "/about",
    "/programmes",
    "/projects",
    "/projects/community-lion-conservation",
    "/get-involved",
    "/contact",
    "/privacy",
    "/terms",
    "/accessibility",
    "/credits",
  ].map((path) => ({
    url: new URL(path, siteUrl).href,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
