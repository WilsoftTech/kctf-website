// Contract between the donation API routes and the donation form / status page.
// Public status responses never include the donor's name, email or message.
import type { DonationCurrency, PaymentMethodId } from "@/lib/donation-options";

export type PublicDonationStatus =
  | "created"
  | "pending"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired"
  | "reversed"
  | "needs_review";

export type DonationStartResponse =
  /** Checkout is ready: send the visitor to the provider's hosted page. */
  | {
      state: "redirect";
      checkoutUrl: string;
      statusUrl: string;
      reference: string;
    }
  /** This attempt already finished; show its status instead of a new checkout. */
  | { state: "finished"; statusUrl: string; reference: string }
  | {
      state: "invalid";
      message: string;
      fields?: Record<string, string[] | undefined>;
    }
  | { state: "conflict"; message: string }
  | { state: "rate_limited"; message: string }
  /** Payments are switched off or the provider refused; nothing was charged. */
  | { state: "unavailable"; message: string }
  /** The checkout may or may not have been created. Retrying with the same key is safe. */
  | { state: "unconfirmed"; message: string };

export type DonationStatusResponse = {
  reference: string;
  status: PublicDonationStatus;
  method: PaymentMethodId;
  amountMinor: number;
  currency: DonationCurrency;
  /** True for provider test mode: no real money moves. */
  test: boolean;
  /** Present while the hosted checkout can still be resumed. */
  resumeUrl?: string;
  updatedAt: string;
};
