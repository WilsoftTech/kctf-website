import type { NextConfig } from "next";
import { mapsEmbedPrefix } from "./src/lib/maps";
import { readSiteConfig } from "./src/lib/site-config";

// Validated at build and server start; a production build with an invalid SITE_URL fails here.
const { indexable } = readSiteConfig();

const productionCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://challenges.cloudflare.com",
  // Turnstile, and the optional click-to-load Google map on /contact (Maps Embed API
  // path only; the map's own subresources load inside Google's frame).
  `frame-src https://challenges.cloudflare.com ${mapsEmbedPrefix}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  // AVIF first: measured image transfer on mobile fell by roughly 65-85% (docs/SEO.md).
  images: { formats: ["image/avif", "image/webp"] },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // Staging, preview and unconfigured deployments stay out of search indexes,
          // including API responses, images and files that carry no HTML robots meta tag.
          ...(indexable ? [] : [{ key: "X-Robots-Tag", value: "noindex" }]),
          // Next's development debugger needs its normal script policy. Apply CSP to production.
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Content-Security-Policy", value: productionCsp }]
            : []),
        ],
      },
      // API responses are never search results, even on an indexable deployment.
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
};
export default config;
