import { afterEach, describe, expect, it, vi } from "vitest";
import type { Metadata } from "next";

const production = {
  SITE_ENVIRONMENT: "production",
  SITE_URL: "https://kctf.example",
  SITE_INDEXING: "index",
};

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const [{ default: robots }, { default: sitemap }, layout, llms] =
    await Promise.all([
      import("@/app/robots"),
      import("@/app/sitemap"),
      import("@/app/layout"),
      import("@/app/llms.txt/route"),
    ]);
  return {
    robots: robots(),
    sitemap: await sitemap(),
    metadata: layout.metadata,
    llms: await llms.GET(),
  };
}

const ruleList = (rules: unknown) =>
  (Array.isArray(rules) ? rules : [rules]) as {
    userAgent: string | string[];
    allow?: string;
    disallow?: string;
  }[];

afterEach(() => vi.unstubAllEnvs());

describe("canonical origin, robots, sitemap and metadata agree", () => {
  it("indexes a validated production deployment that opts in", async () => {
    const { robots, sitemap, metadata, llms } = await load(production);
    expect(new URL(String(metadata.metadataBase)).origin).toBe(
      "https://kctf.example",
    );
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(robots.sitemap).toBe("https://kctf.example/sitemap.xml");
    expect(ruleList(robots.rules)).toEqual([
      { userAgent: "*", allow: "/", disallow: "/api/" },
    ]);
    expect(sitemap.map((e) => new URL(e.url).pathname)).toEqual([
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
    ]);
    expect(
      sitemap.every((e) => e.url.startsWith("https://kctf.example/")),
    ).toBe(true);
    expect(llms.status).toBe(200);
  });

  it("only gives lastmod where a genuine date is known", async () => {
    const { sitemap } = await load(production);
    const { PRIVACY_NOTICE_VERSION } = await import("@/content/privacy");
    const dated = sitemap.filter((e) => e.lastModified);
    expect(dated.map((e) => e.url)).toEqual(["https://kctf.example/privacy"]);
    expect(dated[0].lastModified).toBe(PRIVACY_NOTICE_VERSION.slice(0, 10));
    expect(String(dated[0].lastModified)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const entry of sitemap) {
      expect(entry).not.toHaveProperty("priority");
      expect(entry).not.toHaveProperty("changeFrequency");
    }
  });

  it.each(["staging", "preview"])(
    "keeps %s out of search engines",
    async (environment) => {
      const { robots, sitemap, metadata, llms } = await load({
        SITE_ENVIRONMENT: environment,
        SITE_URL: "https://preview.kctf.example",
        SITE_INDEXING: "index",
        GOOGLE_SITE_VERIFICATION: "google-token-123",
      });
      expect(metadata.robots).toEqual({ index: false, follow: false });
      expect(metadata.verification).toBeUndefined();
      expect(robots.rules).toEqual({ userAgent: "*", disallow: "/" });
      expect(robots.sitemap).toBeUndefined();
      expect(sitemap).toEqual([]);
      expect(llms.status).toBe(404);
    },
  );

  it("keeps a Vercel preview noindex even with production settings", async () => {
    const { metadata, sitemap, robots } = await load({
      ...production,
      VERCEL_ENV: "preview",
    });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(sitemap).toEqual([]);
    expect(robots.rules).toEqual({ userAgent: "*", disallow: "/" });
  });

  it("keeps production noindex until explicitly enabled", async () => {
    const { metadata, sitemap } = await load({
      SITE_ENVIRONMENT: "production",
      SITE_URL: "https://kctf.example",
    });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(sitemap).toEqual([]);
  });

  it("refuses to build production metadata for an invalid origin", async () =>
    expect(
      load({ SITE_ENVIRONMENT: "production", SITE_URL: "https://localhost" }),
    ).rejects.toThrow("public host"));
});

describe("AI crawler policy", () => {
  const search = [
    "Googlebot",
    "Bingbot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "PerplexityBot",
    "Claude-SearchBot",
  ];

  it("allows every crawler by default", async () => {
    const { robots } = await load(production);
    expect(ruleList(robots.rules)).toHaveLength(1);
  });

  it("opts out of training crawlers only, leaving search crawlers allowed", async () => {
    const { robots } = await load({
      ...production,
      SITE_AI_TRAINING: "disallow",
    });
    const rules = ruleList(robots.rules);
    expect(rules[0]).toEqual({ userAgent: "*", allow: "/", disallow: "/api/" });
    expect(rules[1].disallow).toBe("/");
    expect(rules[1].userAgent).toEqual(
      expect.arrayContaining(["GPTBot", "Google-Extended", "ClaudeBot"]),
    );
    for (const bot of search) expect(rules[1].userAgent).not.toContain(bot);
  });

  it("rejects an unknown policy", async () =>
    expect(load({ ...production, SITE_AI_TRAINING: "maybe" })).rejects.toThrow(
      "SITE_AI_TRAINING",
    ));
});

describe("search console verification", () => {
  it("renders Google and Bing tokens on the indexable deployment", async () => {
    const { metadata } = await load({
      ...production,
      GOOGLE_SITE_VERIFICATION: "abc_DEF-123456",
      BING_SITE_VERIFICATION: "0123456789ABCDEF0123456789ABCDEF",
    });
    expect(metadata.verification).toEqual({
      google: "abc_DEF-123456",
      other: { "msvalidate.01": "0123456789ABCDEF0123456789ABCDEF" },
    });
  });

  it.each(['<meta name="google-site-verification" content="x">', "short"])(
    "rejects a token that is not a bare value: %s",
    async (value) =>
      expect(
        load({ ...production, GOOGLE_SITE_VERIFICATION: value }),
      ).rejects.toThrow("GOOGLE_SITE_VERIFICATION"),
  );
});

const pages = {
  "/": () => import("@/app/page"),
  "/about": () => import("@/app/about/page"),
  "/programmes": () => import("@/app/programmes/page"),
  "/projects": () => import("@/app/projects/page"),
  "/projects/community-lion-conservation": () =>
    import("@/app/projects/community-lion-conservation/page"),
  "/get-involved": () => import("@/app/get-involved/page"),
  "/donate": () => import("@/app/donate/page"),
  "/contact": () => import("@/app/contact/page"),
  "/privacy": () => import("@/app/privacy/page"),
  "/terms": () => import("@/app/terms/page"),
  "/accessibility": () => import("@/app/accessibility/page"),
  "/credits": () => import("@/app/credits/page"),
};

async function pageMetadata() {
  vi.resetModules();
  for (const [key, value] of Object.entries(production)) vi.stubEnv(key, value);
  return Promise.all(
    Object.entries(pages).map(async ([path, load]) => {
      const mod = (await load()) as {
        generateMetadata: () => Metadata | Promise<Metadata>;
      };
      return { path, meta: await mod.generateMetadata() };
    }),
  );
}

const fullTitle = (t: Metadata["title"]) =>
  typeof t === "string" ? `${t} | KCTF` : (t as { absolute: string }).absolute;

describe("per-page metadata", () => {
  it("covers every sitemap route", async () => {
    const { content } = await import("@/content/repository");
    expect(Object.keys(pages).sort()).toEqual(
      (await content.getPublicRoutes()).map((r) => r.path).sort(),
    );
  });

  it("gives every page a unique, descriptive title and description", async () => {
    const all = await pageMetadata();
    const titles = all.map(({ meta }) => fullTitle(meta.title));
    const descriptions = all.map(({ meta }) => String(meta.description));
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const title of titles) expect(title.length).toBeLessThanOrEqual(65);
    for (const d of descriptions) {
      expect(d.length).toBeGreaterThanOrEqual(70);
      expect(d.length).toBeLessThanOrEqual(160);
    }
  });

  it("sets a canonical path and complete sharing metadata", async () => {
    for (const { path, meta } of await pageMetadata()) {
      expect(meta.alternates?.canonical).toBe(path);
      const og = meta.openGraph as Record<string, unknown>;
      expect(og).toMatchObject({
        url: path,
        siteName: "Kigezi Community Transformation Foundation",
        locale: "en_UG",
        title: fullTitle(meta.title),
        description: meta.description,
      });
      const [image] = og.images as { url: string; alt: string }[];
      expect(image.url).toBe("/opengraph-image");
      expect(image.alt.length).toBeGreaterThan(20);
      expect(meta.twitter).toMatchObject({
        card: "summary_large_image",
        title: fullTitle(meta.title),
      });
    }
  });
});

describe("structured data", () => {
  async function seo() {
    vi.resetModules();
    for (const [key, value] of Object.entries(production))
      vi.stubEnv(key, value);
    return import("@/lib/seo");
  }

  it("describes one organisation and website with stable ids and verified facts", async () => {
    const { siteGraph } = await seo();
    const { site } = await import("@/content/site");
    const [org, website] = siteGraph() as Record<string, unknown>[];
    expect(org["@id"]).toBe("https://kctf.example/#organization");
    expect(website).toMatchObject({
      "@id": "https://kctf.example/#website",
      publisher: { "@id": "https://kctf.example/#organization" },
    });
    expect(org).toMatchObject({
      "@type": "Organization",
      name: site.name,
      email: site.email,
      telephone: site.telephone,
      founder: { name: site.founder },
    });
    // Nothing the site does not state.
    for (const key of [
      "geo",
      "sameAs",
      "aggregateRating",
      "review",
      "openingHours",
      "taxID",
      "nonprofitStatus",
      "foundingDate",
    ])
      expect(org).not.toHaveProperty(key);
  });

  it("builds breadcrumbs with positions and absolute URLs", async () => {
    const { breadcrumbList } = await seo();
    expect(
      breadcrumbList([
        { name: "Home", path: "/" },
        { name: "Projects", path: "/projects" },
      ]),
    ).toEqual({
      "@type": "BreadcrumbList",
      "@id": "https://kctf.example/projects#breadcrumb",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://kctf.example/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Projects",
          item: "https://kctf.example/projects",
        },
      ],
    });
  });

  it("serialises JSON-LD without a way out of the script element", async () => {
    const { jsonLd } = await seo();
    const out = jsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("<");
    expect(JSON.parse(out)["@graph"][0].name).toContain("</script>");
  });
});

describe("llms.txt", () => {
  it("lists only canonical public pages on the production origin", async () => {
    const { llms } = await load(production);
    const text = await llms.text();
    expect(llms.headers.get("x-robots-tag")).toBe("noindex");
    expect(text).toMatch(/^# Kigezi Community Transformation Foundation/);
    const links = [...text.matchAll(/\]\((.+?)\)/g)].map((m) => m[1]);
    expect(links.length).toBe(11);
    for (const link of links)
      expect(link).toMatch(/^https:\/\/kctf\.example\/[a-z]/);
    expect(text).not.toMatch(/localhost|\/api\//);
    expect(text).toContain("not completed work");
  });
});
