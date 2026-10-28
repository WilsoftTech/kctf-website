import { describe, expect, it } from "vitest";
import {
  isMapsEmbedKey,
  mapsDirectionsUrl,
  mapsEmbedPrefix,
  mapsEmbedUrl,
  mapsSearchUrl,
} from "@/lib/maps";
import { readMapsEmbedKey } from "@/server/config";
import { officeLocation, site } from "@/content/site";

const key = `AIza${"x".repeat(35)}`;

describe("Google Maps links and embed", () => {
  it("searches for the verified address without coordinates", () => {
    expect(officeLocation.query).toBe(site.address);
    expect(officeLocation.verifiedPin).toBe(false);
    const url = new URL(mapsSearchUrl(officeLocation.query));
    expect(url.origin + url.pathname).toBe(
      "https://www.google.com/maps/search/",
    );
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("query")).toBe(site.address);
    expect(mapsDirectionsUrl(site.address)).toContain(
      `destination=${encodeURIComponent(site.address)}`,
    );
  });

  it("builds a Maps Embed API place URL under the CSP-allowed path", () => {
    const url = mapsEmbedUrl(key, "Bunura Cell & Co");
    expect(url.startsWith(`${mapsEmbedPrefix}place?`)).toBe(true);
    expect(new URL(url).searchParams.get("q")).toBe("Bunura Cell & Co");
    expect(new URL(url).searchParams.get("key")).toBe(key);
  });

  it.each([
    [key, true],
    ["", false],
    ["AIzashort", false],
    [`AIza${"x".repeat(34)}"`, false],
    [`sk_${"x".repeat(36)}`, false],
  ])("validates the key %s", (value, ok) =>
    expect(isMapsEmbedKey(value)).toBe(ok),
  );

  it("reads the embed key at runtime and ignores malformed values", () => {
    expect(readMapsEmbedKey({})).toBeUndefined();
    expect(readMapsEmbedKey({ GOOGLE_MAPS_EMBED_API_KEY: key })).toBe(key);
    expect(
      readMapsEmbedKey({ GOOGLE_MAPS_EMBED_API_KEY: "not-a-key" }),
    ).toBeUndefined();
  });
});
