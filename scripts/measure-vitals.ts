// Lab measurement of LCP, CLS and transfer size for key pages of a running production
// server (`npm run build && npm start`). Uses Playwright's Chromium with Pixel 7 emulation,
// a throttled network (≈1.6 Mbps down, 150 ms RTT) and 4× CPU slowdown. Lab numbers
// are indicative only; field data (Search Console, CrUX) is what search engines use.
//
//   npx tsx scripts/measure-vitals.ts [baseUrl] [route ...]
import { chromium, devices } from "@playwright/test";

const [baseUrl = "http://localhost:3000", ...args] = process.argv.slice(2);
const routes = args.length
  ? args
  : [
      "/",
      "/about",
      "/projects/community-lion-conservation",
      "/contact",
      "/donate",
    ];

type Result = {
  route: string;
  lcpMs: number;
  lcpElement: string;
  cls: number;
  transferKb: number;
  imageKb: number;
};

async function measure(route: string): Promise<Result> {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  let transfer = 0;
  let images = 0;
  const types = new Map<string, string>();
  cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", (e) => {
    transfer += e.encodedDataLength;
    if (types.get(e.requestId) === "Image") images += e.encodedDataLength;
  });
  await page.addInitScript(() => {
    const w = window as unknown as {
      __lcp: { t: number; el: string };
      __cls: number;
    };
    w.__lcp = { t: 0, el: "" };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & {
        element?: Element;
      })[])
        w.__lcp = {
          t: e.startTime,
          el: e.element
            ? `${e.element.tagName.toLowerCase()}${e.element.className ? "." + String(e.element.className).split(" ")[0] : ""}`
            : "",
        };
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[])
        if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(new URL(route, baseUrl).href, { waitUntil: "load" });
  await page.waitForTimeout(3000);
  const { lcp, cls } = await page.evaluate(() => {
    const w = window as unknown as {
      __lcp: { t: number; el: string };
      __cls: number;
    };
    return { lcp: w.__lcp, cls: w.__cls };
  });
  await browser.close();
  return {
    route,
    lcpMs: Math.round(lcp.t),
    lcpElement: lcp.el,
    cls: Number(cls.toFixed(3)),
    transferKb: Math.round(transfer / 1024),
    imageKb: Math.round(images / 1024),
  };
}

const results: Result[] = [];
for (const route of routes) results.push(await measure(route));
console.table(results);
