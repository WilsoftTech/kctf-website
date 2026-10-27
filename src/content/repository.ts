// Read boundary between public content and presentation. Server pages and metadata
// routes read published content through `content`; today it is backed by the static
// modules in this folder. A future CMS provides another ContentRepository that only
// ever returns *published* records (see docs/CMS-ROADMAP.md) — callers stay unchanged.
import {
  navigation,
  photos,
  programmes,
  projectStages,
  site,
  targets,
  type PhotoKey,
} from "@/content/site";
import { donationPage } from "@/content/donate";

export type SiteSettings = typeof site;
export type NavigationItem = (typeof navigation)[number];
export type Programme = (typeof programmes)[number];
export type Photo = (typeof photos)[PhotoKey];
export type ProjectTarget = (typeof targets)[number];
export type ProjectStage = (typeof projectStages)[number];
export type DonationPage = typeof donationPage;

export type PublicRoute = {
  path: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
};

export interface ContentRepository {
  getSiteSettings(): Promise<SiteSettings>;
  getNavigation(): Promise<readonly NavigationItem[]>;
  getProgrammes(): Promise<readonly Programme[]>;
  getPhoto(key: PhotoKey): Promise<Photo>;
  getDonationPage(): Promise<DonationPage>;
  /** Every public, published, indexable route. Drives the sitemap. */
  getPublicRoutes(): Promise<readonly PublicRoute[]>;
}

const staticRoutes: readonly PublicRoute[] = [
  "/",
  "/about",
  "/programmes",
  "/projects",
  "/projects/community-lion-conservation",
  "/get-involved",
  "/donate",
  "/contact",
  "/privacy",
  "/terms",
  "/accessibility",
  "/credits",
].map((path) => ({
  path,
  changeFrequency: "monthly",
  priority: path === "/" ? 1 : 0.7,
}));

export const staticContentRepository: ContentRepository = {
  getSiteSettings: async () => site,
  getNavigation: async () => navigation,
  getProgrammes: async () => programmes,
  getPhoto: async (key) => photos[key],
  getDonationPage: async () => donationPage,
  getPublicRoutes: async () => staticRoutes,
};

export const content: ContentRepository = staticContentRepository;
