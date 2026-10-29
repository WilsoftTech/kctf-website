import { expect, test, type Page } from "@playwright/test";
import { heroSlides } from "../../src/content/hero-slides";

const hero = (page: Page) => page.locator(".hero-carousel");
const active = (page: Page) => hero(page).locator(".hero-slide.is-active");
async function expectSlide(page: Page, slide: number) {
  await expect(active(page)).toHaveAttribute("data-slide", String(slide));
  await expect(hero(page).locator(".carousel-counter")).toContainText(
    `${String(slide).padStart(2, "0")} / 05`,
  );
  await expect(hero(page).locator(".carousel-credit")).toContainText(
    heroSlides[slide - 1].caption,
  );
  await expect(
    hero(page).locator(".carousel-credit a").first(),
  ).toHaveAttribute("href", heroSlides[slide - 1].source);
}
async function leaveHero(page: Page) {
  await page.locator(".brand").focus();
  await page.mouse.move(0, 0);
}

test("five distinct photographs, selectors, wrapping, stable text and credits", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const heading = page.locator("#hero-title");
  const originalHeading = await heading.elementHandle();
  const bounds = () =>
    heading.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return {
        x: rect.x + scrollX,
        y: rect.y + scrollY,
        width: rect.width,
        height: rect.height,
      };
    });
  const box = await bounds();
  await expect(
    hero(page).getByRole("button", { name: /^Show photograph/ }),
  ).toHaveCount(5);
  for (let index = 0; index < 5; index++) {
    await hero(page)
      .getByRole("button", {
        name: `Show photograph ${index + 1}:`,
        exact: false,
      })
      .click();
    await expectSlide(page, index + 1);
    await expect(heading).toHaveText("Protecting nature. Empowering people.");
    expect(await bounds()).toEqual(box);
    expect(
      await heading.evaluate(
        (node, original) => node === original,
        originalHeading,
      ),
    ).toBe(true);
    await hero(page).screenshot({
      path: testInfo.outputPath(`slide-${index + 1}.png`),
    });
  }
  await hero(page)
    .getByRole("button", { name: "Next photograph", exact: true })
    .click();
  await expectSlide(page, 1);
  await hero(page)
    .getByRole("button", { name: "Previous photograph", exact: true })
    .click();
  await expectSlide(page, 5);
  const sources = await hero(page)
    .locator("img")
    .evaluateAll((images) =>
      images.map((image) =>
        new URL((image as HTMLImageElement).currentSrc).searchParams.get("url"),
      ),
    );
  expect(new Set(sources).size).toBe(5);
  expect(sources.sort()).toEqual(heroSlides.map((s) => s.src).sort());
  await expect(
    hero(page).getByRole("link", { name: "Explore our work" }),
  ).toHaveAttribute("href", "/programmes");
  await expect(
    hero(page).getByRole("link", { name: "Be part of the change" }),
  ).toHaveAttribute("href", "/get-involved");
  await page.goto("/credits");
  for (const slide of heroSlides) {
    const credit = page.locator("article").filter({
      has: page.getByRole("heading", { name: slide.caption, exact: true }),
    });
    await expect(credit).toContainText(slide.location);
    await expect(
      credit.getByRole("link", { name: slide.license, exact: true }),
    ).toHaveAttribute("href", slide.licenseUrl);
    await expect(
      credit.getByRole("link", { name: slide.author, exact: true }),
    ).toHaveAttribute("href", slide.source);
  }
});

test("autoplay, hover pause, full loop and explicit pause", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await page.goto("/");
  await expect(hero(page)).toHaveAttribute("data-playing", "true");
  await expect(active(page).locator("img")).toHaveJSProperty("complete", true);
  await page.waitForTimeout(1800);
  await expect(hero(page).locator("img")).toHaveCount(2);
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  if (!isMobile) {
    await hero(page).hover();
    await expect(hero(page)).toHaveAttribute("data-playing", "false");
    await page.clock.runFor(8000);
    await expectSlide(page, 1);
    await page.mouse.move(0, 0);
  }
  for (const [step, index] of [2, 3, 4, 5, 1].entries()) {
    await page.clock.runFor(step === 0 ? 7100 : 4700);
    await expectSlide(page, index);
    await page.clock.runFor(2300);
    await expect(hero(page).locator(".is-outgoing")).toHaveCount(0);
  }
  await hero(page).getByRole("button", { name: "Pause slideshow" }).click();
  await leaveHero(page);
  await page.clock.runFor(15000);
  await expectSlide(page, 1);
  await hero(page).getByRole("button", { name: "Play slideshow" }).click();
  await leaveHero(page);
  await expect(hero(page)).toHaveAttribute("data-playing", "true");
  await page.clock.runFor(7100);
  await expectSlide(page, 2);
});

test("keyboard focus pauses until explicit Play without moving focus or live announcements", async ({
  page,
}) => {
  await page.goto("/");
  const next = hero(page).getByRole("button", {
    name: "Next photograph",
    exact: true,
  });
  await next.focus();
  await page.keyboard.press("Enter");
  await expectSlide(page, 2);
  await expect(next).toBeFocused();
  expect(
    await next.evaluate((node) => getComputedStyle(node).outlineStyle),
  ).not.toBe("none");
  await expect(
    hero(page).getByRole("button", { name: "Play slideshow" }),
  ).toBeVisible();
  await leaveHero(page);
  await expect(hero(page)).toHaveAttribute("data-playing", "false");
  await page.clock.install();
  await page.clock.runFor(16000);
  await expectSlide(page, 2);
  await expect(
    hero(page).locator('[aria-live]:not([aria-live="off"])'),
  ).toHaveCount(0);
  await expect(hero(page).locator(".hero-media")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  const play = hero(page).getByRole("button", { name: "Play slideshow" });
  await play.focus();
  await page.keyboard.press("Enter");
  await expect(hero(page)).toHaveAttribute("data-playing", "false");
  // Play stays armed while tabbing through the three credits links and out.
  for (let step = 0; step < 4; step++) await page.keyboard.press("Tab");
  await page.mouse.move(0, 0);
  await expect(hero(page)).toHaveAttribute("data-playing", "true");
});

test("offscreen and Page Visibility suspension preserves explicit Pause", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.clock.install();
  await page.goto("/");
  await expect(hero(page)).toHaveAttribute("data-playing", "true");
  await page.evaluate(() =>
    window.scrollTo({ top: innerHeight * 2, behavior: "instant" }),
  );
  await expect(hero(page)).toHaveAttribute("data-playing", "false");
  await page.clock.runFor(16000);
  await expect(active(page)).toHaveAttribute("data-slide", "1");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await expect(hero(page)).toHaveAttribute("data-playing", "true");
  // Headless Chromium does not reliably background tabs. Simulate the browser
  // visibility event; do not claim a physical tab switch or screen-reader check.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(hero(page)).toHaveAttribute("data-playing", "false");
  const hiddenSlide = await active(page).getAttribute("data-slide");
  await page.clock.runFor(16000);
  await expect(active(page)).toHaveAttribute("data-slide", hiddenSlide!);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await hero(page).getByRole("button", { name: "Pause slideshow" }).click();
  await leaveHero(page);
  await page.evaluate(() => window.scrollTo(0, innerHeight * 2));
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(hero(page)).toHaveAttribute("data-playing", "false");
});

test("reduced motion disables autoplay, zoom and parallax; manual navigation works", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(hero(page)).toHaveAttribute("data-playing", "false");
  await expect(
    hero(page).getByRole("button", { name: "Play slideshow" }),
  ).toBeVisible();
  expect(
    await active(page)
      .locator(".hero-slide-drift")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
  await page.clock.install();
  await page.clock.runFor(16000);
  await expectSlide(page, 1);
  await hero(page)
    .getByRole("button", { name: "Next photograph", exact: true })
    .click();
  await expectSlide(page, 2);
  await expect(hero(page).locator(".is-outgoing")).toHaveCount(0);
  expect(
    await hero(page)
      .locator(".hero-media")
      .evaluate((node) => getComputedStyle(node).transform),
  ).toBe("none");
});

test("slow and failed images keep the current photo and skip failures", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/_next\/image\?.*kasese-tree-planting/, async (route) => {
    await gate;
    await route.abort();
  });
  await page.goto("/");
  await hero(page)
    .getByRole("button", { name: "Next photograph", exact: true })
    .click();
  await page.waitForTimeout(300);
  await expectSlide(page, 1);
  release();
  await expectSlide(page, 3);
  await expect(
    hero(page).getByRole("button", { name: /Show photograph 2:/ }),
  ).toHaveAttribute("aria-disabled", "true");
  await hero(page)
    .getByRole("button", { name: "Previous photograph", exact: true })
    .click();
  await expectSlide(page, 1);
});

test("first-image failure recovers; all-image failure retains content and CTAs", async ({
  page,
}) => {
  await page.route(/\/_next\/image\?.*kazinga-canoes/, (route) =>
    route.abort(),
  );
  await page.goto("/");
  await expectSlide(page, 2);
  await page.route(/\/_next\/image\?.*%2Fhero%2F/, (route) => route.abort());
  await page.reload();
  await expect(hero(page).locator(".carousel-credit")).toContainText(
    "Regional photographs are currently unavailable.",
  );
  await expect(page.locator("#hero-title")).toBeVisible();
  await expect(
    hero(page).getByRole("link", { name: "Explore our work" }),
  ).toBeVisible();
  await expect(hero(page)).toHaveAttribute("data-playing", "false");
});

test("no JavaScript: first image, text and working CTAs; hidden controls", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://localhost:3100/");
  await expect(hero(page).locator("img")).toHaveCount(1);
  await expect(hero(page).locator("img")).toBeVisible();
  await expect(page.locator("#hero-title")).toBeVisible();
  await expect(hero(page).locator(".carousel-navigation")).toBeHidden();
  await hero(page).getByRole("link", { name: "Explore our work" }).click();
  await expect(page).toHaveURL(/\/programmes$/);
  await context.close();
});

test("controls, credits and CTAs fit; project hero keeps its single image", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const ctas = await hero(page).locator(".actions").boundingBox();
  const controls = await hero(page)
    .locator(".carousel-navigation")
    .boundingBox();
  const credit = await hero(page).locator(".carousel-credit").boundingBox();
  expect(ctas!.y + ctas!.height).toBeLessThan(controls!.y);
  expect(controls!.x + controls!.width).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth),
  );
  expect(credit!.y + credit!.height).toBeLessThanOrEqual(
    (await hero(page).boundingBox())!.height,
  );
  for (const button of await hero(page).locator("button").all()) {
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBe(0);
  await page.screenshot({
    path: testInfo.outputPath("homepage-hero.png"),
    fullPage: false,
  });
  await page.goto("/projects/community-lion-conservation");
  await expect(page.locator(".hero-inner .hero-media img")).toHaveCount(1);
  await expect(page.locator(".hero-inner .hero-media img")).toHaveAttribute(
    "src",
    /ishasha-lions/,
  );
  await expect(page.locator(".carousel-navigation")).toHaveCount(0);
});

test("narrow phones and tablet layouts keep controls and credit clear of the CTAs", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "viewport matrix covered once in desktop Chromium");
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [
    [320, 568],
    [768, 1024],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(hero(page).locator(".carousel-navigation")).toBeVisible();
    const actions = await hero(page).locator(".actions").boundingBox();
    const controls = await hero(page)
      .locator(".carousel-navigation")
      .boundingBox();
    const credit = await hero(page).locator(".carousel-credit").boundingBox();
    expect(actions!.y + actions!.height).toBeLessThan(controls!.y);
    const separate =
      controls!.x + controls!.width <= credit!.x ||
      controls!.y + controls!.height <= credit!.y;
    expect(separate).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0);
  }
});
