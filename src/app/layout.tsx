import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Motion } from "@/components/motion/motion";
import { site } from "@/content/site";
import { indexable, siteUrl } from "@/lib/seo";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: site.name, template: "%s | KCTF" },
  description:
    "Community-led conservation, climate resilience and human rights in Rukungiri, Uganda.",
  openGraph: { siteName: site.name, locale: "en_UG", type: "website" },
  twitter: { card: "summary_large_image" },
  // Matches robots.txt and the sitemap: only a validated production deployment that
  // sets SITE_INDEXING=index is indexable.
  robots: indexable
    ? { index: true, follow: true }
    : { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    alternateName: "KCTF",
    url: siteUrl,
    email: site.email,
    telephone: site.telephone,
    logo: `${siteUrl}/brand/kctf-logo.png`,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Bunura Cell, Rwakabengo Ward, Southern Division",
      addressLocality: "Rukungiri Municipality",
      addressCountry: "UG",
    },
  };
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          <Motion>{children}</Motion>
        </main>
        <SiteFooter />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
          }}
        />
      </body>
    </html>
  );
}
