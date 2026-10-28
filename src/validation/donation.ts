// Online donation request: the visitor's choices and contact details only. Strict, so
// card numbers, CVVs, phone PINs, OTPs or a client-computed amount in minor units are
// rejected rather than ignored. Kept separate from the enquiry schema on purpose.
import { z } from "zod";
import { donationCurrencies, paymentMethods } from "@/lib/donation-options";

export const donationSchema = z
  .object({
    method: z.enum(paymentMethods, "Choose how you would like to give."),
    currency: z.enum(donationCurrencies, "Choose a currency."),
    /** Major units as typed, e.g. "50" or "12.50". Parsed and limited on the server. */
    amount: z.string().trim().min(1, "Enter an amount.").max(20),
    name: z
      .string()
      .trim()
      .min(2, "Enter your name (at least 2 characters).")
      .max(100, "Keep your name within 100 characters."),
    email: z.email("Enter a valid email address.").max(254),
    message: z
      .string()
      .trim()
      .max(500, "Keep your message within 500 characters.")
      .default(""),
    consent: z.literal(true, {
      error: "Please confirm you have read the privacy notice.",
    }),
    website: z.string().max(0, "Unable to continue.").default(""),
    token: z.string().max(2048).default(""),
    // Generated once per donation attempt in the browser and reused for its retries.
    idempotencyKey: z.uuid("Please reload the page and try again."),
  })
  .strict();
export type DonationRequest = z.infer<typeof donationSchema>;

/** Status-page access token: 43 base64url characters (256 bits). */
export const accessTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
