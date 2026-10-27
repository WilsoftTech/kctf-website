// Contract between /api/enquiries and the enquiry form.
export type EnquiryResponse =
  /** Durably saved (new) or an earlier save confirmed (replay). Not a delivery claim. */
  | { state: "received"; reference: string; message: string; replay?: boolean }
  /** Rejected input or verification; nothing was saved. */
  | {
      state: "invalid";
      message: string;
      fields?: Record<string, string[] | undefined>;
    }
  /** The idempotency key was already used for different content; nothing was saved. */
  | { state: "conflict"; message: string }
  | { state: "rate_limited"; message: string }
  /** Online submission is off or broken, or a dependency failed before saving. */
  | { state: "unavailable"; message: string }
  /** The save may or may not have completed. Retrying with the same key is safe. */
  | { state: "unconfirmed"; message: string };

export type EnquiryState = EnquiryResponse["state"];
