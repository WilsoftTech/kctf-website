import type { NextConfig } from "next";
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
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
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
    ];
  },
};
export default config;
