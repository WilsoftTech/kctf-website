import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/about",
  "/programmes",
  "/projects",
  "/projects/community-lion-conservation",
  "/get-involved",
  "/contact",
  "/privacy",
];

test.describe("accessibility", () => {
  for (const route of routes)
    test(`no WCAG 2.1 A/AA violations detected on ${route}`, async ({
      page,
    }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        violations.map(
          (v) =>
            `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
        ),
      ).toEqual([]);
    });
});

test.describe("desktop navigation", () => {
  test.skip(({ isMobile }) => isMobile, "desktop only");

  test("opens the programmes menu on hover", async ({ page }) => {
    await page.goto("/about");
    const menu = page.locator("#programmes-menu");
    await expect(menu).not.toHaveClass(/open/);
    await page.getByRole("link", { name: "Programmes" }).first().hover();
    await expect(menu).toHaveClass(/open/);
    await expect(
      menu.getByRole("link", { name: /Wildlife Conservation/ }),
    ).toBeVisible();
    await page.mouse.move(5, 800);
    await expect(menu).not.toHaveClass(/open/);
  });

  test("supports keyboard access to the programmes menu", async ({ page }) => {
    await page.goto("/about");
    const trigger = page.locator(".nav-group > a");
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#programmes-menu a").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#programmes-menu")).not.toHaveClass(/open/);
    await expect(trigger).toBeFocused();
  });

  test("navigates to the programmes page on click", async ({ page }) => {
    await page.goto("/about");
    await page.locator(".nav-group > a").click();
    await expect(page).toHaveURL(/\/programmes$/);
  });
});

test.describe("mobile navigation", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile only");

  test("opens and closes the full-screen menu", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const dialog = page.locator("dialog#mobile-menu");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  });

  test("navigates and closes the menu", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page
      .locator("dialog#mobile-menu")
      .getByRole("link", { name: /Contact/ })
      .click();
    await expect(page).toHaveURL(/\/contact$/);
    await expect(page.locator("dialog#mobile-menu")).toBeHidden();
  });

  test("has no horizontal overflow on contact", async ({ page }) => {
    await page.goto("/contact");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("indexing on a non-production deployment", () => {
  test("robots, sitemap, meta and headers agree on noindex", async ({
    page,
    request,
  }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /");
    expect(robots).not.toContain("Sitemap:");
    expect(await (await request.get("/sitemap.xml")).text()).not.toContain(
      "<loc>",
    );
    const response = await page.goto("/");
    expect(response?.headers()["x-robots-tag"]).toBe("noindex");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "http://localhost:3100",
    );
  });
});
