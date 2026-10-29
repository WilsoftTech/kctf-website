// Reproduce only the five homepage assets, directly from Commons (never EACH).
// Run deliberately: node scripts/source-hero-images.mjs
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const sources = [
  ["kazinga-canoes", 150482386],
  ["kasese-tree-planting", 38608687],
  ["queen-elizabeth-waterbuck", 150338522],
  ["kabale-farming", 199671702],
  ["rushaga-cooperative", 136370676],
];
async function fetchWithRetry(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url);
    if (response.status !== 429 && response.status < 500) return response;
    await new Promise((resolve) => setTimeout(resolve, 10_000 * (attempt + 1)));
  }
  throw new Error(`Source unavailable after retries: ${url}`);
}
const url = new URL("https://commons.wikimedia.org/w/api.php");
url.search = new URLSearchParams({
  action: "query",
  format: "json",
  pageids: sources.map(([, id]) => id).join("|"),
  prop: "imageinfo|revisions",
  iiprop: "url|extmetadata|size|sha1",
  rvprop: "ids|timestamp",
});
const response = await fetchWithRetry(url);
if (!response.ok) throw new Error(`Commons metadata: ${response.status}`);
const metadata = await response.json();
await mkdir("public/images/hero", { recursive: true });
const records = [];
for (const [name, id] of sources) {
  const page = metadata.query.pages[id];
  const info = page.imageinfo[0];
  const original = await fetchWithRetry(info.url.split("?")[0]);
  if (!original.ok) throw new Error(`${name}: ${original.status}`);
  const input = Buffer.from(await original.arrayBuffer());
  const output = await sharp(input)
    .rotate()
    .resize({ width: 2400, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toBuffer();
  await writeFile(`public/images/hero/${name}.webp`, output);
  records.push({
    asset: `/images/hero/${name}.webp`,
    retrieved: new Date().toISOString(),
    source: info.descriptionurl,
    revision: page.revisions[0],
    originalUrl: info.url,
    originalSha1: info.sha1,
    assetSha256: createHash("sha256").update(output).digest("hex"),
    originalWidth: info.width,
    originalHeight: info.height,
    bytes: output.length,
    metadata: info.extmetadata,
    modifications:
      "Auto-oriented, resized to 2400px wide, WebP quality 82; metadata stripped. CSS applies responsive focal crops, a dark overlay and gentle zoom; no generative edits or recolouring.",
  });
  console.log(`${name}: ${(output.length / 1024).toFixed(0)} KB`);
}
await writeFile(
  "docs/hero-photo-sources.json",
  JSON.stringify(records, null, 2) + "\n",
);
