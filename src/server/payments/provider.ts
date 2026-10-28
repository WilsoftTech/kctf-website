// The boundary every payment provider implements. Providers own their hosted checkout
// pages; this site never sees card numbers, mobile-money PINs or OTPs. Outcomes are
// normalised here so the state machine (state.ts) treats every provider the same way.
import type { DonationCurrency } from "@/lib/donation-options";

export type CheckoutRequest = {
  donationId: string;
  reference: string;
  amountMinor: number;
  currency: DonationCurrency;
  donorName: string;
  donorEmail: string;
  /** Where the provider sends the visitor afterwards (status page with access token). */
  returnUrl: string;
  cancelUrl: string;
};

export type CheckoutResult =
  | { kind: "created"; sessionId: string; url: string }
  /** Unknown outcome or temporary failure: retry with the same donation (idempotent). */
  | { kind: "retryable"; code: string }
  /** The provider refused the request; a retry will not help. */
  | { kind: "permanent"; code: string };

/** A normalised payment state confirmed through the provider's authenticated API. */
export type VerifiedState =
  "pending" | "succeeded" | "failed" | "cancelled" | "expired" | "reversed";

export type VerifiedStatus = {
  state: VerifiedState;
  /** As reported by the provider, converted to ISO minor units. */
  amountMinor?: number;
  currency?: string;
  /** Our references as echoed back by the provider, checked against the record. */
  reference?: string;
  donationId?: string;
  sessionId: string;
  paymentId?: string;
  /** False when the provider says this is a test-mode object. */
  live?: boolean;
  /** Short provider status code for operators, never free text. */
  code?: string;
};

export type StatusResult =
  | { kind: "ok"; status: VerifiedStatus }
  | { kind: "retryable"; code: string }
  | { kind: "permanent"; code: string };

export interface PaymentProvider {
  readonly id: "stripe" | "pesapal";
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  fetchStatus(sessionId: string): Promise<StatusResult>;
  /** Ends an open checkout so it can no longer be paid, where the provider supports it. */
  cancelCheckout?(sessionId: string): Promise<StatusResult>;
}

const SAFE_CODE = /^[a-z0-9_]{1,60}$/;
/** Reduces a provider error code to a safe, short identifier. */
export function safeProviderCode(value: unknown, fallback: string) {
  return typeof value === "string" && SAFE_CODE.test(value.toLowerCase())
    ? value.toLowerCase()
    : fallback;
}

/** 408/409/429 and 5xx are worth retrying; other 4xx are not. */
export function retryableStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}
