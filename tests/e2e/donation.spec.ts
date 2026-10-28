// Online donations in the browser, against a production build with PROVIDER DOUBLES:
// Stripe and Pesapal APIs are local test servers and their hosted pages are intercepted.
// No real checkout, payment or email happens here.
import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_PORT, E2E_STRIPE_WEBHOOK_SECRET } from "./global-setup";

const base = `http://localhost:${E2E_PORT}`;
const doubles = () => process.env.E2E_DOUBLES_URL!;

// In-page Turnstile stand-in. The token carries the widget's action so the local
// siteverify double can check it, as Cloudflare does.
const turnstileStub = `
  window.turnstile = {
    render(el, options) {
      window.__turnstile = options;
      setTimeout(() => options.callback((window.__nextToken || "e2e-pass") + ":" + options.action), 30);
      return "e2e-widget";
    },
    reset() {
      const o = window.__turnstile;
      setTimeout(() => o && o.callback((window.__nextToken || "e2e-pass") + ":" + o.action), 30);
    },
    remove() {},
  };`;

async function openGive(page: Page) {
  await page.route(/challenges\.cloudflare\.com\/turnstile/, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: turnstileStub,
    }),
  );
  // Hosted checkout pages are replaced by a placeholder: nothing reaches Stripe or Pesapal.
  await page.route(
    /^https:\/\/(checkout\.stripe\.com|cybqa\.pesapal\.com)\//,
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Provider checkout (test double)</title><h1>Provider checkout (test double)</h1>",
      }),
  );
  await page.goto("/donate/give");
  await expect(
    page.getByRole("button", { name: "Continue to secure payment" }),
  ).toBeEnabled();
}

async function fillDonor(page: Page, email: string) {
  await page.getByLabel("Your name").fill("Synthetic Donor");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/I have read the/).check();
}

const unique = (label: string) =>
  `${label}-${test.info().project.name}-${Date.now()}@example.com`;

async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client({
    connectionString: process.env.E2E_DATABASE_URL,
  });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

async function donationFor(email: string) {
  const [row] = await query<{
    id: string;
    status: string;
    provider_session_id: string;
    amount_minor: number;
    currency: string;
  }>(
    "SELECT id, status::text, provider_session_id, amount_minor, currency FROM donations WHERE donor_email = $1",
    [email],
  );
  return row;
}

async function stripeSession(id: string, fields?: Record<string, unknown>) {
  const response = await fetch(`${doubles()}/__stripe/${id}`, {
    method: fields ? "POST" : "GET",
    body: fields ? JSON.stringify(fields) : undefined,
  });
  return (await response.json()) as { success_url: string; cancel_url: string };
}

/** Delivers a correctly signed Stripe event to the site, as Stripe would. */
async function stripeWebhook(type: string, sessionId: string) {
  const body = JSON.stringify({
    id: `evt_e2e${Date.now()}${Math.floor(Math.random() * 1e6)}`,
    object: "event",
    type,
    livemode: false,
    data: { object: { id: sessionId } },
  });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", E2E_STRIPE_WEBHOOK_SECRET)
    .update(`${t}.${body}`)
    .digest("hex");
  return fetch(`${base}/api/payments/stripe/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${t},v1=${v1}`,
    },
    body,
  });
}

test.describe("layout", () => {
  test("desktop: image and headline on the left (~55%), form card on the right", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "desktop only");
    await openGive(page);
    const intro = (await page.locator(".give-intro").boundingBox())!;
    const panel = (await page.locator(".give-panel").boundingBox())!;
    const width = intro.width + panel.width;
    expect(intro.width / width).toBeGreaterThan(0.53);
    expect(intro.width / width).toBeLessThan(0.57);
    expect(panel.x).toBeGreaterThanOrEqual(intro.x + intro.width - 1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Give hope. Grow a shared future.",
    );
    await expect(page.locator(".give-credit")).toContainText(
      "does not show KCTF-funded activities",
    );
    await expect(page.locator(".give-credit")).toContainText("CC BY-SA 4.0");
  });

  test("mobile: compact intro stacked above the form, with comfortable targets", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "mobile only");
    await openGive(page);
    const intro = (await page.locator(".give-intro").boundingBox())!;
    const form = (await page.locator(".donation-form").boundingBox())!;
    expect(form.y).toBeGreaterThanOrEqual(intro.y + intro.height - 1);
    for (const target of await page
      .locator(".amount-options label, .method-option")
      .all())
      expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("headline and copy are visible without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${base}/donate/give`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Give hope. Grow a shared future.",
    );
    await expect(page.getByText("This form needs JavaScript")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "send a donation enquiry" }).first(),
    ).toHaveAttribute("href", "/donate#give");
    await context.close();
  });

  test("respects reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openGive(page);
    const animation = await page
      .locator(".give-intro .hero-line > span")
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe("none");
    // GSAP never ran: no inline transform on the photograph.
    await page.waitForTimeout(400);
    expect(
      await page.locator("[data-give-media]").getAttribute("style"),
    ).toBeNull();
  });
});

test.describe("form behaviour", () => {
  test("is keyboard operable: method, amount and currency", async ({
    page,
  }) => {
    await openGive(page);
    const card = page.getByRole("radio", { name: /^Card/ });
    await card.focus();
    await expect(card).toBeChecked();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("radio", { name: /^Mobile Money/ }),
    ).toBeChecked();
    await expect(
      page.getByText("Amounts are in Ugandan shillings (UGX)."),
    ).toBeVisible();
    await expect(page.locator(".info-panel")).toContainText(
      "never ask for your PIN",
    );
    await page.getByRole("radio", { name: "UGX 100,000" }).focus();
    await page.keyboard.press("Space");
    await expect(page.locator(".donation-summary")).toContainText(
      "UGX 100,000",
    );
    await expect(page.locator(".donation-summary")).toContainText(
      "Mobile Money via Pesapal",
    );
    await page.keyboard.press("Shift+Tab");
    await card.focus();
    await page.keyboard.press("Space");
    await page.getByRole("radio", { name: "EUR" }).check();
    await expect(page.locator(".donation-summary")).toContainText("EUR 50.00");
  });

  test("shows field errors inline and focuses the first invalid field", async ({
    page,
  }) => {
    await openGive(page);
    await page.getByLabel(/another amount|Your amount/).fill("2");
    await page
      .getByRole("button", { name: "Continue to secure payment" })
      .click();
    await expect(
      page.getByText("The minimum online gift is USD 5.00."),
    ).toBeVisible();
    await expect(page.getByLabel(/another amount|Your amount/)).toBeFocused();
    await expect(page.getByLabel("Your name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(
      page.getByText("Please confirm you have read the privacy notice."),
    ).toBeVisible();
    await page.getByLabel(/another amount|Your amount/).fill("12.345");
    await page
      .getByRole("button", { name: "Continue to secure payment" })
      .click();
    await expect(
      page.getByText("Enter an amount such as 25 or 25.50."),
    ).toBeVisible();
  });

  test("never asks for card numbers, CVVs, PINs or phone codes", async ({
    page,
  }) => {
    await openGive(page);
    await expect(
      page.locator(
        'input[autocomplete^="cc-"], input[name*="card" i], input[name*="cvv" i], input[name*="pin" i], input[name*="otp" i], input[type="password"]',
      ),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Send a donation enquiry" }),
    ).toHaveAttribute("href", "/donate#give");
  });
});

test.describe("card donation (Stripe test double)", () => {
  test("is confirmed only after the provider confirms it", async ({ page }) => {
    const email = unique("card");
    await openGive(page);
    await fillDonor(page, email);
    await page
      .getByRole("button", { name: "Continue to secure payment" })
      .click();
    await expect(page).toHaveURL(
      /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/,
    );
    const row = await donationFor(email);
    expect(row).toMatchObject({
      status: "pending",
      amount_minor: 5000,
      currency: "USD",
    });
    const session = await stripeSession(row.provider_session_id);

    // Arriving on the success URL proves nothing: the page waits for the provider.
    await page.goto(session.success_url);
    await expect(page.locator(".status-panel h2")).toHaveText(
      "Waiting for confirmation…",
    );
    await expect(
      page.getByText("Test mode · no real money was moved"),
    ).toBeVisible();
    expect((await donationFor(email)).status).toBe("pending");

    await stripeSession(row.provider_session_id, {
      status: "complete",
      payment_status: "paid",
      payment_intent: { id: "pi_e2e", status: "succeeded" },
    });
    expect(
      (
        await stripeWebhook(
          "checkout.session.completed",
          row.provider_session_id,
        )
      ).status,
    ).toBe(200);
    await expect(page.locator(".status-panel h2")).toHaveText(
      "Thank you. Your donation is confirmed.",
      { timeout: 15_000 },
    );
    await expect(page.locator(".donation-summary")).toContainText("USD 50.00");
    await expect(page.locator(".donation-summary")).toContainText(
      /KCTF-D-[0-9A-Z]{8}/,
    );
    await expect(page.getByText(/not a tax receipt/)).toBeVisible();
    await expect(page.getByText("Synthetic Donor")).toHaveCount(0);
    expect((await donationFor(email)).status).toBe("succeeded");
    const jobs = await query<{ kind: string }>(
      "SELECT kind FROM email_outbox WHERE donation_id = $1 ORDER BY kind",
      [row.id],
    );
    expect(jobs.map((j) => j.kind)).toEqual([
      "donation-acknowledgement",
      "donation-staff-notification",
    ]);
  });

  test("a donor who leaves the checkout can cancel it", async ({ page }) => {
    const email = unique("cancel");
    await openGive(page);
    await fillDonor(page, email);
    await page
      .getByRole("button", { name: "Continue to secure payment" })
      .click();
    await expect(page).toHaveURL(/checkout\.stripe\.com/);
    const row = await donationFor(email);
    const session = await stripeSession(row.provider_session_id);
    await page.goto(session.cancel_url);
    await expect(page.locator(".status-panel h2")).toHaveText(
      "You left the checkout.",
    );
    await expect(
      page.getByRole("link", { name: "Return to checkout" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel this donation" }).click();
    await expect(page.locator(".status-panel h2")).toHaveText(
      "Your donation was cancelled.",
    );
    expect((await donationFor(email)).status).toBe("cancelled");
    expect(
      (await stripeSession(row.provider_session_id)) as unknown,
    ).toMatchObject({ status: "expired" });
  });

  test("double-clicking the button starts one checkout", async ({ page }) => {
    const email = unique("double");
    await openGive(page);
    await fillDonor(page, email);
    await page
      .getByRole("button", { name: "Continue to secure payment" })
      .dblclick();
    await expect(page).toHaveURL(/checkout\.stripe\.com/);
    const rows = await query(
      "SELECT id FROM donations WHERE donor_email = $1",
      [email],
    );
    expect(rows).toHaveLength(1);
  });
});

test.describe("Mobile Money (Pesapal test double)", () => {
  test("explains phone approval, waits, then shows the confirmed result", async ({
    page,
  }) => {
    const email = unique("momo");
    await openGive(page);
    await page.getByRole("radio", { name: /^Mobile Money/ }).check();
    await fillDonor(page, email);
    await page
      .getByRole("button", { name: "Continue to secure payment" })
      .click();
    await expect(page).toHaveURL(/^https:\/\/cybqa\.pesapal\.com\//);
    const row = await donationFor(email);
    expect(row).toMatchObject({
      status: "pending",
      currency: "UGX",
      amount_minor: 50000,
    });
    const order = (await (
      await fetch(`${doubles()}/__pesapal/${row.provider_session_id}`)
    ).json()) as {
      callback_url: string;
      merchant_reference: string;
    };
    await page.goto(order.callback_url);
    await expect(
      page.getByText(
        /check your phone for the\s+MTN MoMo or Airtel Money prompt/,
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Never share your PIN.", { exact: false }),
    ).toBeVisible();

    await fetch(`${doubles()}/__pesapal/${row.provider_session_id}`, {
      method: "POST",
      body: JSON.stringify({
        status_code: 1,
        payment_status_description: "COMPLETED",
      }),
    });
    // Pesapal's IPN carries no status; the site asks Pesapal before changing anything.
    const ipn = await fetch(
      `${base}/api/payments/pesapal/ipn?OrderTrackingId=${row.provider_session_id}&OrderMerchantReference=${order.merchant_reference}&OrderNotificationType=IPNCHANGE`,
    );
    expect(await ipn.json()).toMatchObject({ status: 200 });
    await expect(page.locator(".status-panel h2")).toHaveText(
      "Thank you. Your donation is confirmed.",
      { timeout: 15_000 },
    );
    await expect(page.locator(".donation-summary")).toContainText("UGX 50,000");
    await expect(page.locator(".donation-summary")).toContainText(
      "Mobile Money via Pesapal",
    );
  });
});
