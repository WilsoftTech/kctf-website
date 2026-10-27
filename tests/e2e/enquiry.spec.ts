import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

// In-page stand-in for the Turnstile widget. It issues `window.__nextToken` (default
// "e2e-pass"); the local siteverify double accepts, rejects or fails based on that token.
const turnstileStub = `
  window.turnstile = {
    render(el, options) {
      window.__turnstile = options;
      setTimeout(() => options.callback(window.__nextToken || "e2e-pass"), 30);
      return "e2e-widget";
    },
    reset() {
      const o = window.__turnstile;
      setTimeout(() => o && o.callback(window.__nextToken || "e2e-pass"), 30);
    },
    remove() {},
  };`;

async function openContact(page: Page, token?: string) {
  if (token)
    await page.addInitScript(
      (t) => ((window as unknown as { __nextToken: string }).__nextToken = t),
      token,
    );
  await page.route(/challenges\.cloudflare\.com\/turnstile/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: turnstileStub,
    }),
  );
  await page.goto("/contact");
}

async function fill(page: Page, email: string) {
  await page.getByLabel("Your name").fill("Synthetic Visitor");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Your message")
    .fill("A synthetic browser-test enquiry with enough characters.");
  await page.getByLabel(/I have read the/).check();
}

async function count(email: string) {
  const client = new pg.Client({
    connectionString: process.env.E2E_DATABASE_URL,
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM enquiries WHERE email = $1",
      [email],
    );
    return rows[0].n as number;
  } finally {
    await client.end();
  }
}

const unique = (label: string) =>
  `${label}-${test.info().project.name}-${Date.now()}@example.com`;
const status = (page: Page) => page.locator(".form-status");

test("saves an enquiry, reports it as received and queues the notification", async ({
  page,
}) => {
  const email = unique("ok");
  const before = (
    await (await fetch(`${process.env.E2E_DOUBLES_URL}/__emails`)).json()
  ).count;
  await openContact(page);
  await fill(page, email);
  const send = page.getByRole("button", { name: "Send enquiry" });
  await expect(send).toBeEnabled();
  // The site key is supplied only at runtime; it must still reach the widget.
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __turnstile: { sitekey: string } }).__turnstile
          .sitekey,
    ),
  ).toBe("e2e-runtime-site-key");
  await send.click();
  await expect(status(page)).toContainText("received and saved");
  await expect(status(page)).toContainText(/KCTF-[0-9A-F]{8}/);
  await expect(status(page)).not.toContainText(/sent|delivered/i);
  await expect(status(page)).toBeFocused();
  await expect(page.getByLabel("Your message")).toHaveValue("");
  expect(await count(email)).toBe(1);
  // The post-response worker hands the notification to the (local) provider double.
  await expect
    .poll(
      async () =>
        (await (await fetch(`${process.env.E2E_DOUBLES_URL}/__emails`)).json())
          .count,
    )
    .toBeGreaterThan(before);
});

test("shows field errors and focuses the first invalid field", async ({
  page,
}) => {
  await openContact(page);
  await expect(
    page.getByRole("button", { name: "Send enquiry" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(
    page.getByText("Enter your name (at least 2 characters)."),
  ).toBeVisible();
  await expect(page.getByLabel("Your name")).toBeFocused();
  await expect(page.getByLabel("Your name")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("reports a failed spam-protection check without saving", async ({
  page,
}) => {
  const email = unique("reject");
  await openContact(page, "e2e-reject");
  await fill(page, email);
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(status(page)).toContainText(
    "spam-protection check did not succeed",
  );
  expect(await count(email)).toBe(0);
});

test("offers direct email when the service is unavailable", async ({
  page,
}) => {
  const email = unique("outage");
  await openContact(page, "e2e-outage");
  await fill(page, email);
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(status(page)).toContainText("was not saved");
  const fallback = page.getByRole("link", {
    name: "Email this enquiry instead",
  });
  await expect(fallback).toHaveAttribute(
    "href",
    /^mailto:transformationfoundationkigezi@gmail\.com\?subject=/,
  );
  expect(await count(email)).toBe(0);
});

test("recovers from a lost response without creating a duplicate", async ({
  page,
}) => {
  const email = unique("lost");
  await openContact(page);
  await fill(page, email);
  // The server saves the enquiry, but the browser never receives the answer.
  let dropped = false;
  await page.route("**/api/enquiries", async (route) => {
    if (dropped) return route.continue();
    dropped = true;
    await route.fetch();
    await route.abort("connectionreset");
  });
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(status(page)).toContainText("could not confirm");
  expect(await count(email)).toBe(1);
  const retry = page.getByRole("button", { name: "Try again" });
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(status(page)).toContainText("received and saved");
  expect(await count(email)).toBe(1);
});

test("ignores rapid repeat clicks", async ({ page }) => {
  const email = unique("double");
  await openContact(page);
  await fill(page, email);
  let posts = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/enquiries") && r.method() === "POST") posts++;
  });
  const send = page.getByRole("button", { name: "Send enquiry" });
  await expect(send).toBeEnabled();
  await send.dblclick();
  await expect(status(page)).toContainText("received and saved");
  expect(posts).toBe(1);
  expect(await count(email)).toBe(1);
});

test("guides visitors without JavaScript to direct contact", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/contact");
  await expect(
    page.getByText("This form needs JavaScript for spam protection"),
  ).toBeVisible();
  await expect(page.locator("fieldset.enquiry-fields")).toHaveAttribute(
    "disabled",
    "",
  );
  await expect(page.getByLabel("Your message")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Send enquiry" }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("link", { name: "transformationfoundationkigezi@gmail.com" })
      .first(),
  ).toBeVisible();
  await context.close();
});

test("removes the no-JavaScript guidance once the form is interactive", async ({
  page,
}) => {
  await openContact(page);
  await expect(
    page.getByRole("button", { name: "Send enquiry" }),
  ).toBeEnabled();
  await expect(
    page.getByText("This form needs JavaScript for spam protection"),
  ).toHaveCount(0);
});
