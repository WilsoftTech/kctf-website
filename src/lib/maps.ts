// Google Maps links and the Maps Embed API URL. Pure and secret-free: the embed key is a
// browser-visible key that must be restricted (see docs/SEO.md, "Contact map").
// Links use Google's documented Maps URLs, which need no key: developers.google.com/maps/documentation/urls

/** Search for a place or address. Opens the Google Maps app or website. */
export const mapsSearchUrl = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

/** Directions to a place or address from the visitor's chosen starting point. */
export const mapsDirectionsUrl = (query: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;

/** Origin and path allowed by the CSP `frame-src` directive in next.config.ts. */
export const mapsEmbedPrefix = "https://www.google.com/maps/embed/v1/";

/** Maps Embed API "place" mode. `query` is an address, place name or `place_id:…`. */
export const mapsEmbedUrl = (key: string, query: string) =>
  `${mapsEmbedPrefix}place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}`;

/** Google API keys are 39 characters beginning with "AIza". */
export const isMapsEmbedKey = (value: string) =>
  /^AIza[0-9A-Za-z_-]{35}$/.test(value);
