"use client";
// Donation status after the hosted checkout. Everything shown comes from the server,
// which confirms the state with the provider; arriving on this page proves nothing.
// Polling is bounded and stops at a final state; after the limit the visitor can check
// again by hand.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatAmount, methodLabels } from "@/lib/donation-options";
import type { DonationStatusResponse } from "@/lib/donation-response";
import { site } from "@/content/site";
import { Arrow } from "@/components/ui/primitives";
import { Spinner } from "@/components/forms/fields";

const FINAL = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "expired",
  "reversed",
  "needs_review",
]);
/** Gentle back-off: 2s for the first minute-ish, then 3s, then 5s. */
export function pollDelay(attempt: number) {
  return attempt < 15 ? 2_000 : attempt < 30 ? 3_000 : 5_000;
}
export const MAX_POLLS = 40;

type Load =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error" }
  | { kind: "ok"; data: DonationStatusResponse };

export function DonationStatusView({
  token,
  cameBackCancelled,
}: {
  token: string;
  cameBackCancelled: boolean;
}) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [polls, setPolls] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastStatus = useRef<string | undefined>(undefined);

  const check = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/donations/status?token=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      if (response.status === 404) return setLoad({ kind: "missing" });
      if (!response.ok)
        return setLoad((l) => (l.kind === "ok" ? l : { kind: "error" }));
      const data = (await response.json()) as DonationStatusResponse;
      setLoad({ kind: "ok", data });
    } catch {
      setLoad((l) => (l.kind === "ok" ? l : { kind: "error" }));
    }
  }, [token]);

  const status = load.kind === "ok" ? load.data.status : undefined;
  const done = !!status && FINAL.has(status);

  useEffect(() => {
    if (done || polls >= MAX_POLLS) return;
    const timer = setTimeout(
      () => {
        void check().finally(() => setPolls((p) => p + 1));
      },
      polls === 0 ? 0 : pollDelay(polls),
    );
    return () => clearTimeout(timer);
  }, [check, polls, done]);

  // Move focus to the heading when the outcome changes, so it is announced.
  useEffect(() => {
    if (status && status !== lastStatus.current) {
      if (lastStatus.current) heading.current?.focus();
      lastStatus.current = status;
    }
  }, [status]);

  async function cancel() {
    setCancelling(true);
    try {
      const response = await fetch("/api/donations/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (response.ok)
        setLoad({
          kind: "ok",
          data: (await response.json()) as DonationStatusResponse,
        });
    } finally {
      setCancelling(false);
    }
  }

  if (load.kind === "missing")
    return (
      <Panel
        tone="failed"
        title="We could not find this donation."
        headingRef={heading}
      >
        <p>
          The link may be incomplete. If you made a payment, the provider’s
          email confirms it. For help, email{" "}
          <a href={`mailto:${site.email}`}>{site.email}</a>.
        </p>
        <Actions />
      </Panel>
    );
  if (load.kind !== "ok")
    return (
      <Panel
        tone="pending"
        title="Checking your donation…"
        headingRef={heading}
      >
        {load.kind === "error" ? (
          <p>
            We could not check the status just now.{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => setPolls(0)}
            >
              Try again
            </button>
            .
          </p>
        ) : (
          <p className="status-waiting">
            <Spinner /> Asking the payment provider for the latest status.
          </p>
        )}
      </Panel>
    );

  const d = load.data;
  const amount = formatAmount(d.amountMinor, d.currency);
  const via = `${methodLabels[d.method]} via ${d.method === "card" ? "Stripe" : "Pesapal"}`;
  const summary = (
    <dl className="donation-summary">
      <div>
        <dt>Amount</dt>
        <dd>{amount}</dd>
      </div>
      <div>
        <dt>Payment</dt>
        <dd>{via}</dd>
      </div>
      <div>
        <dt>Reference</dt>
        <dd>
          <strong>{d.reference}</strong>
        </dd>
      </div>
    </dl>
  );
  const testNote = d.test && (
    <p className="test-badge">Test mode · no real money was moved</p>
  );

  switch (d.status) {
    case "succeeded":
      if (
        d.financial &&
        (d.financial.refundState !== "none" ||
          d.financial.pendingRefundMinor > 0 ||
          !["none", "won", "warning_closed"].includes(
            d.financial.disputeState,
          ) ||
          d.financial.underReview)
      )
        return (
          <Panel
            tone="unconfirmed"
            title={
              d.financial.underReview
                ? "This payment is being checked."
                : d.financial.refundState === "full"
                  ? "Your donation has been refunded."
                  : d.financial.refundState === "partial"
                    ? "Your donation was partially refunded."
                    : d.financial.pendingRefundMinor > 0
                      ? "A refund is pending."
                      : d.financial.disputeState === "lost"
                        ? "This payment was disputed."
                        : "This payment is under review."
            }
            headingRef={heading}
          >
            {testNote}
            <p>
              The original payment remains recorded. Refunded:{" "}
              {formatAmount(d.financial.refundedMinor, d.currency)}.{" "}
              {d.financial.pendingRefundMinor > 0 &&
                `Pending refund: ${formatAmount(d.financial.pendingRefundMinor, d.currency)}.`}{" "}
              Please contact the foundation about this update; do not pay again.
            </p>
            {summary}
            <Actions />
          </Panel>
        );
      return (
        <Panel
          tone="received"
          title="Thank you. Your donation is confirmed."
          headingRef={heading}
        >
          {testNote}
          <p>
            The payment provider has confirmed your gift.{" "}
            {d.acknowledgement === "sent"
              ? "The acknowledgement was accepted by our email provider; inbox delivery is separate."
              : d.acknowledgement === "failed"
                ? "The acknowledgement email needs attention; your payment is still recorded."
                : d.acknowledgement === "not_queued"
                  ? "No acknowledgement email is queued. Please contact the foundation if you need confirmation."
                  : "An acknowledgement is queued separately for email delivery."}{" "}
            An acknowledgement confirms the payment; it is not a tax receipt.
          </p>
          {summary}
          <Actions />
        </Panel>
      );
    case "failed":
      return (
        <Panel
          tone="failed"
          title="The payment did not go through."
          headingRef={heading}
        >
          {testNote}
          <p>
            Nothing was taken by this attempt. You can try again, use another
            method, or discuss your support with the foundation.
          </p>
          {summary}
          <Actions retry />
        </Panel>
      );
    case "cancelled":
    case "expired":
      return (
        <Panel
          tone="failed"
          title={
            d.status === "cancelled"
              ? "Your donation was cancelled."
              : "This checkout has closed."
          }
          headingRef={heading}
        >
          {testNote}
          <p>
            No payment was completed for this checkout. You are welcome to start
            again whenever you like.
          </p>
          {summary}
          <Actions retry />
        </Panel>
      );
    case "reversed":
    case "needs_review":
      return (
        <Panel
          tone="unconfirmed"
          title="The foundation is checking this payment."
          headingRef={heading}
        >
          {testNote}
          <p>
            The payment provider reported something we need to check by hand.
            Please do not pay again. The foundation will contact you if anything
            is needed; you can also email{" "}
            <a href={`mailto:${site.email}`}>{site.email}</a> quoting your
            reference.
          </p>
          {summary}
          <Actions />
        </Panel>
      );
    default: {
      const waiting = polls < MAX_POLLS;
      return (
        <Panel
          tone="unconfirmed"
          title={
            cameBackCancelled
              ? "You left the checkout."
              : "Waiting for confirmation…"
          }
          headingRef={heading}
        >
          {testNote}
          {cameBackCancelled ? (
            <p>
              Your payment has not been completed. If you approved it on your
              phone a moment ago, wait here: we will update this page. Otherwise
              you can return to the checkout or cancel it.
            </p>
          ) : d.method === "mobile_money" ? (
            <p>
              If you have not yet approved the payment, check your phone for the
              MTN MoMo or Airtel Money prompt and approve it there. Never share
              your PIN. This page updates when the provider confirms the result.
            </p>
          ) : (
            <p>
              The payment provider has not confirmed the result yet. This page
              updates automatically. Please do not pay again.
            </p>
          )}
          {summary}
          <p className="status-waiting" aria-live="polite">
            {waiting ? (
              <>
                <Spinner /> Checking with the payment provider…
              </>
            ) : (
              <>
                Still waiting. Confirmation can take a few minutes.{" "}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setPolls(0)}
                >
                  Check again
                </button>
              </>
            )}
          </p>
          <div className="actions">
            {d.resumeUrl && (
              <a className="button" href={d.resumeUrl}>
                Return to checkout <Arrow />
              </a>
            )}
            {(cameBackCancelled || !waiting) && d.method === "card" && (
              <button
                type="button"
                className="button button-outline"
                onClick={cancel}
                disabled={cancelling}
              >
                {cancelling ? "Cancelling…" : "Cancel this donation"}
              </button>
            )}
          </div>
        </Panel>
      );
    }
  }
}

function Panel({
  tone,
  title,
  headingRef,
  children,
}: {
  tone: string;
  title: string;
  headingRef: React.Ref<HTMLHeadingElement>;
  children: React.ReactNode;
}) {
  return (
    <div className={`form-card status-panel ${tone}`}>
      <h2 ref={headingRef} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Actions({ retry = false }: { retry?: boolean }) {
  return (
    <div className="actions">
      {retry && (
        <a className="button" href="/donate/give">
          Start a new donation <Arrow />
        </a>
      )}
      <Link className="button button-outline" href="/donate#give">
        Discuss your support
      </Link>
    </div>
  );
}
