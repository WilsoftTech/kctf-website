// Shared pieces of the donation services: dependencies, provider selection, references
// and status-page access tokens.
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { PaymentMethodId } from "@/lib/donation-options";
import type { Database } from "@/server/db";
import type {
  PaymentsConfig,
  PaymentsConfigResult,
} from "@/server/payments/config";
import { createPesapalProvider } from "@/server/payments/pesapal";
import type { PaymentProvider } from "@/server/payments/provider";
import { createStripeProvider } from "@/server/payments/stripe";

export type PaymentDeps = {
  siteOrigin: string;
  readConfig: () => PaymentsConfigResult;
  getDb: () => Database;
  /** Used for Turnstile and provider calls; replaced by doubles in tests. */
  fetchImpl?: typeof fetch;
};

export function providerFor(
  config: PaymentsConfig,
  method: PaymentMethodId,
  fetchImpl?: typeof fetch,
): PaymentProvider | undefined {
  const provider = config.methods[method];
  if (!provider) return undefined;
  return provider.provider === "stripe"
    ? createStripeProvider(provider, fetchImpl)
    : createPesapalProvider(provider, fetchImpl);
}

/** The provider that created a donation, whatever the method is called today. */
export function providerById(
  config: PaymentsConfig,
  id: "stripe" | "pesapal",
  fetchImpl?: typeof fetch,
) {
  return providerFor(
    config,
    id === "stripe" ? "card" : "mobile_money",
    fetchImpl,
  );
}

// Crockford base32 without I, L, O, U: easy to read aloud and type.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Public donation reference, e.g. KCTF-D-7QK2M9XA (40 random bits). */
export function newDonationReference() {
  const bytes = randomBytes(8);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte & 31];
  return `KCTF-D-${out}`;
}

/**
 * Status-page token: an HMAC of the donation id under the server secret, so a retried
 * request can be answered with the same link without storing the token. Only its SHA-256
 * is stored. 256 bits, base64url (43 characters).
 */
export function accessTokenFor(donationId: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`donation-status:${donationId}`)
    .digest("base64url");
}

export function hashAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function statusPath(token: string, cancelled = false) {
  return `/donate/give/status?token=${token}${cancelled ? "&cancelled=1" : ""}`;
}
