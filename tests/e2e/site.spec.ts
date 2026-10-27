import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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

  for (const route of ["/contact", "/donate", "/"])
    test(`has no horizontal overflow on ${route}`, async ({ page }) => {
      await page.goto(route);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

  test("keeps the small-screen header uncluttered", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Donate" }),
    ).toBeHidden();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  });

  test("reaches /donate from the menu and closes it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const donate = page
      .locator("dialog#mobile-menu")
      .getByRole("link", { name: "Donate to KCTF" });
    const box = await donate.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await donate.click();
    await expect(page).toHaveURL(/\/donate$/);
    await expect(page.locator("dialog#mobile-menu")).toBeHidden();
  });
});

test.describe("donation calls to action", () => {
  test("every donation link on the home page points to /donate", async ({
    page,
  }) => {
    await page.goto("/");
    const ctas = page.locator(".donate-button, .footer-donate");
    // Header (desktop/tablet), mobile menu, homepage section and footer.
    expect(await ctas.count()).toBeGreaterThanOrEqual(4);
    for (const href of await ctas.evaluateAll((els) =>
      els.map((el) => el.getAttribute("href")),
    ))
      expect(href).toBe("/donate");
  });

  test("the homepage section and footer reach /donate", async ({ page }) => {
    await page.goto("/");
    await page
      .locator(".home-donate")
      .getByRole("link", { name: "Donate", exact: true })
      .click();
    await expect(page).toHaveURL(/\/donate$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Help people and nature thrive.",
    );
    await page.goto("/about");
    await page
      .getByRole("navigation", { name: "Footer navigation" })
      .getByRole("link", { name: "Donate" })
      .click();
    await expect(page).toHaveURL(/\/donate$/);
  });

  test("states that online payment is unavailable and asks for no payment details", async ({
    page,
  }) => {
    await page.goto("/donate");
    await expect(page.locator(".donate-panel")).toContainText(
      "Online giving is not yet available",
    );
    await expect(page.getByLabel("I’d like to talk about")).toHaveValue(
      "donation",
    );
    await expect(
      page.locator(
        'input[autocomplete^="cc-"], input[name*="card" i], input[name*="amount" i]',
      ),
    ).toHaveCount(0);
  });

  test("FAQ answers open from the keyboard", async ({ page }) => {
    await page.goto("/donate");
    const first = page.locator(".faq details").first();
    await first.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("open", "");
    await expect(first.locator("p")).toBeVisible();
  });
});

test.describe("desktop donate button", () => {
  test.skip(({ isMobile }) => isMobile, "desktop only");

  test("is in the header, keyboard reachable and reaches /donate", async ({
    page,
  }) => {
    await page.goto("/about");
    const donate = page
      .getByRole("banner")
      .getByRole("link", { name: "Donate" });
    await expect(donate).toBeVisible();
    const box = await donate.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await donate.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/donate$/);
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Donate" }),
    ).toHaveAttribute("aria-current", "page");
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
