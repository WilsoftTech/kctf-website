import { expect, test, type Page } from "@playwright/test";

const routes = [
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
];

type Node = Record<string, unknown> & { "@type": string };
async function structuredData(page: Page): Promise<Node[]> {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  return blocks.flatMap((text) => JSON.parse(text)["@graph"] as Node[]);
}

test.describe("server-rendered structure and structured data", () => {
  test.skip(({ isMobile }) => isMobile, "markup is identical on mobile");

  for (const route of routes)
    test(`${route}: one h1, valid JSON-LD and matching breadcrumbs`, async ({
      page,
      request,
    }) => {
      // Primary content and structured data are in the server HTML, before JavaScript.
      const html = await (await request.get(route)).text();
      expect(html).toContain("<h1");
      expect(html).toContain("application/ld+json");

      await page.goto(route);
      await expect(page.locator("h1")).toHaveCount(1);
      const nodes = await structuredData(page);
      const types = nodes.map((n) => n["@type"]);
      expect(types.filter((t) => t === "Organization")).toHaveLength(1);
      expect(types.filter((t) => t === "WebSite")).toHaveLength(1);
      const ids = nodes.map((n) => n["@id"]).filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);

      const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute("href");
      const crumbs = nodes.find((n) => n["@type"] === "BreadcrumbList");
      if (route === "/") return expect(crumbs).toBeUndefined();
      const items = crumbs!.itemListElement as { name: string; item: string }[];
      expect(items[0].item).toBe("http://localhost:3100/");
      expect(items.at(-1)!.item).toBe(canonical);
      // The visible trail says the same thing.
      const visible = page.getByRole("navigation", { name: "Breadcrumb" });
      await expect(visible.getByRole("listitem")).toHaveText(
        items.map((i) => new RegExp(`^${i.name}`)),
      );
      await expect(visible.locator('[aria-current="page"]')).toHaveText(
        items.at(-1)!.name,
      );
    });

  for (const route of ["/about", "/donate"])
    test(`${route}: FAQ structured data matches the visible questions`, async ({
      page,
    }) => {
      await page.goto(route);
      const faq = (await structuredData(page)).find(
        (n) => n["@type"] === "FAQPage",
      )!;
      const questions = faq.mainEntity as {
        name: string;
        acceptedAnswer: { text: string };
      }[];
      await expect(page.locator(".faq summary h3")).toHaveText(
        questions.map((q) => q.name),
      );
      await expect(page.locator(".faq details p")).toHaveText(
        questions.map((q) => q.acceptedAnswer.text),
      );
    });

  test("unknown pages return 404 with noindex", async ({ page }) => {
    for (const path of ["/no-such-page", "/projects/no-such-project"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      // Next.js injects its own noindex alongside the layout's robots tag; crawlers apply
      // the most restrictive directive.
      expect(
        await page
          .locator('meta[name="robots"]')
          .evaluateAll((els) => els.map((el) => el.getAttribute("content"))),
      ).toContain("noindex");
      await expect(
        page.getByRole("navigation", { name: "Main pages" }),
      ).toBeVisible();
    }
  });

  test("llms.txt is withheld on a non-indexable deployment", async ({
    request,
  }) => {
    expect((await request.get("/llms.txt")).status()).toBe(404);
  });

  test("API responses carry noindex", async ({ request }) => {
    const response = await request.get("/api/outbox/run");
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  });
});

test.describe("contact map", () => {
  const embed = "https://www.google.com/maps/embed/v1/**";

  test("requests nothing from Google until the visitor loads the map", async ({
    page,
  }) => {
    const google: string[] = [];
    page.on("request", (r) => {
      if (/google|gstatic|googleapis/.test(new URL(r.url()).hostname))
        google.push(r.url());
    });
    let served = 0;
    await page.route(embed, (route) => {
      served++;
      return route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>map</title><p>Map stub</p>",
      });
    });
    const violations: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy/i.test(m.text())) violations.push(m.text());
    });

    await page.goto("/contact");
    const section = page.locator("#find-us");
    await section.scrollIntoViewIfNeeded();
    await page.waitForLoadState("networkidle");
    expect(google).toEqual([]);
    await expect(section.locator("iframe")).toHaveCount(0);

    // Textual address and external links are always present.
    await expect(section.locator("address")).toHaveText(
      "Bunura Cell, Rwakabengo Ward, Southern Division, Rukungiri Municipality, Uganda",
    );
    await expect(section).toContainText("not a confirmed office pin");
    const open = section.getByRole("link", { name: /Open in Google Maps/ });
    expect(await open.getAttribute("href")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Bunura%20Cell%2C%20Rwakabengo%20Ward%2C%20Southern%20Division%2C%20Rukungiri%20Municipality%2C%20Uganda",
    );
    await expect(open).toHaveAttribute("rel", "noopener noreferrer");

    // Keyboard activation loads the map.
    const button = section.getByRole("button", { name: "Load Google map" });
    await button.focus();
    await page.keyboard.press("Enter");
    const frame = section.locator("iframe");
    await expect(frame).toHaveAttribute("title", /approximate area/);
    await expect(frame).toHaveAttribute("loading", "lazy");
    expect(await frame.getAttribute("src")).toMatch(
      /^https:\/\/www\.google\.com\/maps\/embed\/v1\/place\?key=AIza/,
    );
    // CSP allowed the frame: the request reached the (intercepted) network.
    await expect.poll(() => served).toBe(1);
    await expect(
      page.frameLocator("#find-us iframe").getByText("Map stub"),
    ).toBeVisible();
    await expect(section.getByRole("status")).toHaveCount(0);
    expect(violations).toEqual([]);
  });

  test("reserves the map's space so loading causes no layout shift", async ({
    page,
  }) => {
    await page.route(embed, (route) =>
      route.fulfill({ contentType: "text/html", body: "<p>Map stub</p>" }),
    );
    await page.goto("/contact");
    const box = page.locator("#find-us .map-frame");
    const before = await box.boundingBox();
    await page.getByRole("button", { name: "Load Google map" }).click();
    await expect(page.locator("#find-us iframe")).toBeVisible();
    const after = await box.boundingBox();
    expect(before!.height).toBeGreaterThan(200);
    expect(after!.height).toBe(before!.height);
    expect(after!.width).toBe(before!.width);
  });

  test("a map that never loads leaves guidance and every contact route working", async ({
    page,
  }) => {
    await page.clock.install();
    await page.route(embed, () => {
      // Never answer: simulates a blocked or unreachable Google.
    });
    await page.goto("/contact");
    await page.getByRole("button", { name: "Load Google map" }).click();
    const status = page.locator("#find-us").getByRole("status");
    await expect(status).toHaveText("Loading map…");
    await page.clock.fastForward(16_000);
    await expect(status).toContainText("open the address in Google Maps");
    await expect(
      page.locator("#find-us").getByRole("link", { name: /Get directions/ }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("link", {
          name: /transformationfoundationkigezi@gmail\.com/,
        })
        .first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send enquiry" }),
    ).toBeVisible();
  });

  test("the CSP still blocks other frames and framing of the site", async ({
    page,
  }) => {
    // Anything that slipped past the CSP would be stopped here, never sent to Google.
    await page.route(/^https:\/\/www\.google\.com\//, (route) => route.abort());
    const response = await page.goto("/contact");
    const csp = response!.headers()["content-security-policy"];
    expect(csp).toContain(
      "frame-src https://challenges.cloudflare.com https://www.google.com/maps/embed/v1/",
    );
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response!.headers()["x-frame-options"]).toBe("DENY");
    const blocked = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          document.addEventListener("securitypolicyviolation", (e) =>
            resolve(`${e.violatedDirective} ${e.blockedURI}`),
          );
          const frame = document.createElement("iframe");
          frame.src = "https://www.google.com/maps?q=Rukungiri&output=embed";
          document.body.append(frame);
          setTimeout(() => resolve("not blocked"), 3000);
        }),
    );
    expect(blocked).toMatch(/^frame-src https:\/\/www\.google\.com/);
  });
});
