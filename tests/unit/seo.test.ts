import { afterEach, describe, expect, it, vi } from "vitest";

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const [{ default: robots }, { default: sitemap }, layout] = await Promise.all(
    [import("@/app/robots"), import("@/app/sitemap"), import("@/app/layout")],
  );
  return {
    robots: robots(),
    sitemap: await sitemap(),
    metadata: layout.metadata,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("canonical origin, robots, sitemap and metadata agree", () => {
  it("indexes a validated production deployment that opts in", async () => {
    const { robots, sitemap, metadata } = await load({
      SITE_ENVIRONMENT: "production",
      SITE_URL: "https://kctf.example",
      SITE_INDEXING: "index",
    });
    expect(new URL(String(metadata.metadataBase)).origin).toBe(
      "https://kctf.example",
    );
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(robots.sitemap).toBe("https://kctf.example/sitemap.xml");
    expect(robots.rules).toMatchObject({ allow: "/", disallow: "/api/" });
    expect(sitemap.length).toBe(11);
    expect(
      sitemap.every((e) => e.url.startsWith("https://kctf.example/")),
    ).toBe(true);
  });

  it.each(["staging", "preview"])(
    "keeps %s out of search engines",
    async (environment) => {
      const { robots, sitemap, metadata } = await load({
        SITE_ENVIRONMENT: environment,
        SITE_URL: "https://preview.kctf.example",
        SITE_INDEXING: "index",
      });
      expect(metadata.robots).toEqual({ index: false, follow: false });
      expect(robots.rules).toEqual({ userAgent: "*", disallow: "/" });
      expect(robots.sitemap).toBeUndefined();
      expect(sitemap).toEqual([]);
    },
  );

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
