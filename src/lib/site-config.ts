// Site origin, deployment environment and indexing. Pure and secret-free so that
// next.config.ts, metadata routes and tests share one source of truth.
// These values are read when `next build` prerenders metadata, robots and the sitemap:
// set them at build time and keep the same values at runtime.

export const siteEnvironments = [
  "production",
  "staging",
  "preview",
  "development",
  "test",
] as const;
export type SiteEnvironment = (typeof siteEnvironments)[number];

export type AiTrainingPolicy = "allow" | "disallow";

export type SiteConfig = {
  environment: SiteEnvironment;
  origin: string;
  /** True only for a validated production deployment that explicitly opts in. */
  indexable: boolean;
  /** Whether robots.txt opts out of crawlers used only for AI model training. */
  aiTraining: AiTrainingPolicy;
  /** Public search-console ownership tokens, rendered as meta tags when indexable. */
  verification: { google?: string; bing?: string };
  warnings: string[];
};

/**
 * Robots.txt product tokens used to collect content for training AI models, as
 * documented by each operator. Search and user-initiated fetchers (Googlebot, Bingbot,
 * OAI-SearchBot, ChatGPT-User, PerplexityBot, Claude-SearchBot) are deliberately not
 * listed: blocking them would remove the site from those search products.
 * See docs/SEO.md for sources.
 */
export const aiTrainingCrawlers = [
  "GPTBot",
  "Google-Extended",
  "ClaudeBot",
  "Applebot-Extended",
  "CCBot",
] as const;

const LOCAL_ORIGIN = "http://localhost:3000";

function isPrivateOrLoopbackHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "::" || host.startsWith("fe80:")) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(host)) return true;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * Validates a canonical public origin: https, no credentials, no port, no path,
 * query or fragment, and not a local, private or single-label host.
 * Returns the normalised origin or throws with a message safe to print.
 */
export function parsePublicOrigin(value: string | undefined): string {
  if (!value) throw new Error("SITE_URL is required.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SITE_URL is not a valid URL.");
  }
  if (url.protocol !== "https:") throw new Error("SITE_URL must use https.");
  if (url.username || url.password)
    throw new Error("SITE_URL must not contain credentials.");
  if (url.port) throw new Error("SITE_URL must not include a port.");
  if (url.pathname !== "/" || url.search || url.hash || value.includes("?"))
    throw new Error(
      "SITE_URL must be an origin only, without a path, query or fragment.",
    );
  if (value.replace(/\/$/, "") !== url.origin)
    throw new Error("SITE_URL must be written as a plain origin.");
  if (isPrivateOrLoopbackHost(url.hostname))
    throw new Error("SITE_URL must be a public host, not a local address.");
  if (!url.hostname.includes(".") || /^[\d.]+$/.test(url.hostname))
    throw new Error("SITE_URL must use a public domain name.");
  return url.origin;
}

/** Non-production origins may be http or local, but must still be plain origins. */
function parseNonProductionOrigin(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("SITE_URL must use http or https.");
  if (url.username || url.password)
    throw new Error("SITE_URL must not contain credentials.");
  if (url.pathname !== "/" || url.search || url.hash)
    throw new Error("SITE_URL must be an origin only.");
  return url.origin;
}

/** Verification tokens are public but must be a single plain token, never markup. */
function readVerificationToken(
  name: string,
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(value))
    throw new Error(
      `${name} must be the bare token from the verification meta tag (letters, digits, - or _).`,
    );
  return value;
}

export function readSiteConfig(
  env: Record<string, string | undefined> = process.env,
): SiteConfig {
  const warnings: string[] = [];
  const rawEnvironment = env.SITE_ENVIRONMENT || "development";
  if (!(siteEnvironments as readonly string[]).includes(rawEnvironment))
    throw new Error(
      `SITE_ENVIRONMENT must be one of: ${siteEnvironments.join(", ")}.`,
    );
  const environment = rawEnvironment as SiteEnvironment;
  const indexing = env.SITE_INDEXING || "noindex";
  if (indexing !== "index" && indexing !== "noindex")
    throw new Error("SITE_INDEXING must be `index` or `noindex`.");
  const aiTraining = env.SITE_AI_TRAINING || "allow";
  if (aiTraining !== "allow" && aiTraining !== "disallow")
    throw new Error("SITE_AI_TRAINING must be `allow` or `disallow`.");
  const verification = {
    google: readVerificationToken(
      "GOOGLE_SITE_VERIFICATION",
      env.GOOGLE_SITE_VERIFICATION,
    ),
    bing: readVerificationToken(
      "BING_SITE_VERIFICATION",
      env.BING_SITE_VERIFICATION,
    ),
  };
  const shared = { aiTraining, verification } as const;

  if (environment === "production") {
    // Fail the build rather than publish canonical URLs for the wrong origin.
    const origin = parsePublicOrigin(env.SITE_URL);
    // Defence in depth: a Vercel preview that inherits production settings by mistake
    // still stays out of search indexes.
    const vercelPreview = !!env.VERCEL_ENV && env.VERCEL_ENV !== "production";
    if (vercelPreview && indexing === "index")
      warnings.push(
        `SITE_INDEXING=index is ignored on a Vercel ${env.VERCEL_ENV} deployment.`,
      );
    return {
      environment,
      origin,
      indexable: indexing === "index" && !vercelPreview,
      ...shared,
      warnings,
    };
  }
  if (indexing === "index")
    warnings.push(
      `SITE_INDEXING=index is ignored outside production (${environment}).`,
    );
  let origin = LOCAL_ORIGIN;
  if (env.SITE_URL) {
    try {
      origin = parseNonProductionOrigin(env.SITE_URL);
    } catch (error) {
      throw new Error(`Invalid SITE_URL: ${(error as Error).message}`);
    }
  }
  return { environment, origin, indexable: false, ...shared, warnings };
}
