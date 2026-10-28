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
import { donationPage, givePage } from "@/content/donate";
import { PRIVACY_NOTICE_VERSION } from "@/content/privacy";

export type SiteSettings = typeof site;
export type NavigationItem = (typeof navigation)[number];
export type Programme = (typeof programmes)[number];
export type Photo = (typeof photos)[PhotoKey];
export type ProjectTarget = (typeof targets)[number];
export type ProjectStage = (typeof projectStages)[number];
export type DonationPage = typeof donationPage;
export type GivePage = typeof givePage;

export type PublicRoute = {
  path: string;
  /** Title used for breadcrumbs and llms.txt. */
  title: string;
  /**
   * When the page's main content last changed, if genuinely known. Left undefined rather
   * than guessed: a false `lastmod` misleads crawlers (see docs/SEO.md).
   */
  lastModified?: string;
};

export interface ContentRepository {
  getSiteSettings(): Promise<SiteSettings>;
  getNavigation(): Promise<readonly NavigationItem[]>;
  getProgrammes(): Promise<readonly Programme[]>;
  getPhoto(key: PhotoKey): Promise<Photo>;
  getDonationPage(): Promise<DonationPage>;
  getGivePage(): Promise<GivePage>;
  /** Every public, published, indexable route. Drives the sitemap. */
  getPublicRoutes(): Promise<readonly PublicRoute[]>;
}

// Every canonical, indexable public page. Not listed: /api/*, metadata routes,
// query-string variants such as /contact?topic=… and anything unpublished.
const staticRoutes: readonly PublicRoute[] = [
  { path: "/", title: "Home" },
  { path: "/about", title: "About" },
  { path: "/programmes", title: "Programmes" },
  { path: "/projects", title: "Projects" },
  {
    path: "/projects/community-lion-conservation",
    title: "Community Lion Conservation",
  },
  { path: "/get-involved", title: "Get involved" },
  { path: "/donate", title: "Donate" },
  { path: "/donate/give", title: "Give online" },
  { path: "/contact", title: "Contact" },
  {
    path: "/privacy",
    title: "Privacy notice",
    // The notice version starts with the date its text last changed.
    lastModified: PRIVACY_NOTICE_VERSION.slice(0, 10),
  },
  { path: "/terms", title: "Website terms" },
  { path: "/accessibility", title: "Accessibility" },
  { path: "/credits", title: "Image credits" },
];

export const staticContentRepository: ContentRepository = {
  getSiteSettings: async () => site,
  getNavigation: async () => navigation,
  getProgrammes: async () => programmes,
  getPhoto: async (key) => photos[key],
  getDonationPage: async () => donationPage,
  getGivePage: async () => givePage,
  getPublicRoutes: async () => staticRoutes,
};

export const content: ContentRepository = staticContentRepository;
