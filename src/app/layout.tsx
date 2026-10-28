import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Motion } from "@/components/motion/motion";
import { site } from "@/content/site";
import { JsonLd } from "@/components/seo/structured-data";
import { indexable, siteConfig, siteGraph, siteUrl } from "@/lib/seo";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: site.name, template: "%s | KCTF" },
  description: site.summary,
  applicationName: site.name,
  // Pages set openGraph and twitter in full through `metadata()` in src/lib/seo.ts.
  openGraph: { siteName: site.name, locale: "en_UG", type: "website" },
  twitter: { card: "summary_large_image" },
  // Matches robots.txt and the sitemap: only a validated production deployment that
  // sets SITE_INDEXING=index is indexable.
  robots: indexable
    ? { index: true, follow: true }
    : { index: false, follow: false },
  icons: { icon: "/icon.svg" },
  // Search-console ownership tokens, only on the indexable production deployment.
  verification: indexable
    ? {
        google: siteConfig.verification.google,
        other: siteConfig.verification.bing
          ? { "msvalidate.01": siteConfig.verification.bing }
          : undefined,
      }
    : undefined,
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          <Motion>{children}</Motion>
        </main>
        <SiteFooter />
        <JsonLd graph={siteGraph()} />
      </body>
    </html>
  );
}
