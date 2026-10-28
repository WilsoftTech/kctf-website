"use client";
import Link from "next/link";
import Script from "next/script";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { enquirySchema, type Enquiry } from "@/validation/enquiry";
import type { EnquiryResponse } from "@/lib/enquiry-response";
import { site } from "@/content/site";
import { Arrow } from "@/components/ui/primitives";
type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
export type EnquiryFormMode = "online" | "email-draft" | "unavailable";
type Fields = Record<string, string[] | undefined>;
/**
 * received    — saved by the server (not a claim of email delivery)
 * unconfirmed — the result is unknown; retrying with the same key is safe
 * failed      — definitely not saved; offer a correction, a later retry or direct email
 */
type Phase = "idle" | "submitting" | "received" | "unconfirmed" | "failed";
type Verification = "loading" | "ready" | "verified" | "expired" | "error";

function mailtoFor(d: Pick<Enquiry, "topic" | "name" | "email" | "message">) {
  const subject = encodeURIComponent(`KCTF ${d.topic} enquiry`);
  const body = encodeURIComponent(
    `Name: ${d.name}\nEmail: ${d.email}\n\n${d.message}`,
  );
  return `mailto:${site.email}?subject=${subject}&body=${body}`;
}
const noSubscription = () => () => {};

export function EnquiryForm({
  mode,
  siteKey,
  recordDrafts = false,
  initialTopic = "general",
  title = "Start a conversation.",
  description = "Send the foundation a general, volunteer, partnership or donation enquiry.",
}: {
  mode: EnquiryFormMode;
  siteKey?: string;
  /** Email-draft mode only: the website also keeps a copy of each prepared enquiry. */
  recordDrafts?: boolean;
  initialTopic?: string;
  title?: string;
  /** Shown when online submission is active. */
  description?: string;
}) {
  const online = mode === "online";
  // False in server HTML, true once hydrated. Controls stay disabled until then: without
  // JavaScript the form cannot pass spam protection, so visitors see direct-contact
  // guidance instead of a dead end.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [fields, setFields] = useState<Fields>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [reference, setReference] = useState("");
  const [fallback, setFallback] = useState("");
  const [token, setToken] = useState("");
  const [verification, setVerification] = useState<Verification>("loading");
  const [scriptReady, setScriptReady] = useState(false);
  const [topic, setTopic] = useState(initialTopic);
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const statusRef = useRef<HTMLParagraphElement>(null);
  // One key per enquiry: kept for retries of an unconfirmed result, replaced after a
  // confirmed save, a definite rejection followed by edits, or a key conflict.
  const idempotencyKey = useRef<string | null>(null);
  const [retryPayload, setRetryPayload] = useState<Enquiry | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!online || !scriptReady || !widget.current || !window.turnstile) return;
    widgetId.current = window.turnstile.render(widget.current, {
      sitekey: siteKey,
      action: "enquiry",
      "refresh-expired": "auto",
      callback: (t: string) => {
        setToken(t);
        setVerification("verified");
      },
      "expired-callback": () => {
        setToken("");
        setVerification("expired");
      },
      "timeout-callback": () => {
        setToken("");
        setVerification("expired");
        if (widgetId.current) window.turnstile?.reset(widgetId.current);
      },
      "error-callback": () => {
        setToken("");
        setVerification("error");
        return true;
      },
    });
    setVerification("ready");
    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, [online, scriptReady, siteKey]);

  function resetVerification() {
    setToken("");
    if (widgetId.current) {
      setVerification("ready");
      window.turnstile?.reset(widgetId.current);
    }
  }

  function announce(message: string, focus = false) {
    setStatus(message);
    if (focus) requestAnimationFrame(() => statusRef.current?.focus());
  }

  async function send(payload: Enquiry, form: HTMLFormElement | null) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase("submitting");
    setFallback("");
    announce("Sending your enquiry…");
    let result: EnquiryResponse | undefined;
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, token }),
      });
      result = (await response.json()) as EnquiryResponse;
    } catch {
      result = undefined;
    } finally {
      inFlight.current = false;
      // Turnstile tokens are single-use: always fetch a fresh one for any next attempt.
      resetVerification();
    }
    if (!result) {
      setPhase("unconfirmed");
      announce(
        "We could not confirm that your enquiry was saved — the connection may have dropped. Use “Try again”; it is safe and will not send a duplicate.",
        true,
      );
      return;
    }
    switch (result.state) {
      case "received":
        setPhase("received");
        setReference(result.reference);
        idempotencyKey.current = null;
        setRetryPayload(null);
        form?.reset();
        setTopic(initialTopic);
        announce(result.message, true);
        return;
      case "unconfirmed":
        setPhase("unconfirmed");
        announce(result.message, true);
        return;
      case "conflict":
        idempotencyKey.current = null;
        setPhase("failed");
        announce(result.message, true);
        return;
      case "invalid":
        setPhase("failed");
        if (result.fields) {
          setFields(result.fields);
          requestAnimationFrame(() =>
            form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
          );
        }
        announce(result.message, !result.fields);
        return;
      default:
        // rate_limited / unavailable: nothing was saved, so direct email cannot duplicate.
        setPhase("failed");
        setFallback(mailtoFor(payload));
        announce(result.message, true);
    }
  }

  // Email-draft mode with saving on: keep a copy, then always open the draft. The draft is
  // the visitor's way to reach the foundation, so a failed save never blocks it.
  async function saveDraftCopy(payload: Enquiry) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase("submitting");
    announce("Saving a copy and preparing your email draft…");
    let result: EnquiryResponse | undefined;
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, channel: "email-draft" }),
      });
      result = (await response.json()) as EnquiryResponse;
    } catch {
      result = undefined;
    } finally {
      inFlight.current = false;
    }
    if (result?.state === "received") {
      // The key is kept until the form is edited, so preparing the same draft again
      // replays this copy instead of saving a duplicate.
      setPhase("received");
      setReference(result.reference);
      announce(result.message, true);
    } else {
      if (result?.state === "conflict") idempotencyKey.current = null;
      setPhase("idle");
      announce(
        `${result?.state === "rate_limited" ? "No copy was saved because several enquiries were prepared recently." : "A copy could not be saved on this website."} Your email app will open with a draft: press Send there so the foundation receives it.`,
        true,
      );
    }
    window.location.href = mailtoFor(payload);
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const parsed = enquirySchema.safeParse({
      name: fd.get("name"),
      email: fd.get("email"),
      topic: fd.get("topic"),
      message: fd.get("message"),
      consent: fd.get("consent") === "on",
      website: fd.get("website") || "",
      token,
      idempotencyKey: (idempotencyKey.current ??= crypto.randomUUID()),
    });
    if (!parsed.success) {
      setFields(parsed.error.flatten().fieldErrors);
      setPhase("idle");
      announce("Please check the highlighted fields.");
      requestAnimationFrame(() =>
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setFields({});
    if (mode === "email-draft" && recordDrafts) {
      void saveDraftCopy(parsed.data);
      return;
    }
    if (mode === "email-draft") {
      window.location.href = mailtoFor(parsed.data);
      announce(
        "Your email app will open with a draft. Review it and press Send there. Nothing has been sent by this website.",
      );
      return;
    }
    if (!token) {
      announce(
        verification === "error"
          ? "Spam protection could not load. Use “Retry verification”, or email us directly."
          : "Please wait for the spam-protection check to finish, then send again.",
      );
      return;
    }
    setRetryPayload(parsed.data);
    void send(parsed.data, form);
  }

  // Editing after a definite rejection starts a new enquiry with a new key. While the
  // result is unconfirmed the key is kept, so a retry cannot create a duplicate.
  function edited() {
    if (phase === "failed" || phase === "received") {
      idempotencyKey.current = null;
      if (phase === "received") {
        setPhase("idle");
        setReference("");
        setStatus("");
      }
    }
  }

  if (mode === "unavailable")
    return (
      <div className="enquiry-form" id="enquiry">
        <h2>{title}</h2>
        <p className="form-notice" role="status">
          Online enquiries are temporarily unavailable. Nothing can be submitted
          here at the moment.
        </p>
        <p>
          Please email{" "}
          <a className="text-link" href={`mailto:${site.email}`}>
            {site.email} <Arrow diagonal />
          </a>{" "}
          or call <a href={`tel:${site.telephone}`}>{site.phone}</a>.
        </p>
      </div>
    );

  const busy = phase === "submitting";
  const canSend = hydrated && !busy && (!online || !!token);
  return (
    <form
      className="enquiry-form"
      id="enquiry"
      onSubmit={submit}
      onChange={edited}
      noValidate
      aria-busy={busy}
    >
      <h2>{title}</h2>
      <p>
        {online
          ? description
          : recordDrafts
            ? "Prepare an enquiry in your email app. This website keeps a copy of what you enter; the foundation receives your enquiry when you send the email."
            : "Prepare an enquiry in your email app. Website submission has not been activated yet."}
      </p>
      {/* Plain server HTML rather than <noscript>, so it also helps when scripts are
          blocked or fail to load. Removed once the form is interactive. */}
      {!hydrated && (
        <p className="form-notice">
          This form needs JavaScript for spam protection and becomes available
          once the page has loaded. If it stays unavailable, please email{" "}
          <a href={`mailto:${site.email}`}>{site.email}</a> or call{" "}
          <a href={`tel:${site.telephone}`}>{site.phone}</a>.
        </p>
      )}
      <fieldset className="enquiry-fields" disabled={!hydrated || busy}>
        <legend className="visually-hidden">Your enquiry</legend>
        <div className="form-row">
          <div>
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
              aria-invalid={!!fields.name}
              aria-describedby={fields.name ? "name-error" : undefined}
            />
            {fields.name && (
              <p className="field-error" id="name-error">
                {fields.name[0]}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              aria-invalid={!!fields.email}
              aria-describedby={fields.email ? "email-error" : undefined}
            />
            {fields.email && (
              <p id="email-error" className="field-error">
                {fields.email[0]}
              </p>
            )}
          </div>
        </div>
        <label htmlFor="topic">I’d like to talk about</label>
        <select
          name="topic"
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        >
          <option value="general">General enquiry</option>
          <option value="volunteer">Volunteering</option>
          <option value="partnership">Partnerships & support</option>
          <option value="donation">Donating to the foundation</option>
        </select>
        <label htmlFor="message">Your message</label>
        <textarea
          name="message"
          id="message"
          rows={5}
          required
          minLength={20}
          maxLength={3000}
          placeholder={
            topic === "donation"
              ? "Tell us how you’d like to support the foundation…"
              : "Tell us how you’d like to connect…"
          }
          aria-invalid={!!fields.message}
          aria-describedby={
            fields.message ? "message-help message-error" : "message-help"
          }
        />
        <p id="message-help" className="small muted">
          20–3,000 characters.{" "}
          {topic === "donation"
            ? "Please do not include card, bank or mobile-money details, or sensitive personal information."
            : "Please leave out sensitive personal details."}
        </p>
        {fields.message && (
          <p className="field-error" id="message-error">
            {fields.message[0]}
          </p>
        )}
        <div className="honeypot" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input id="website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <div className="consent">
          <input
            id="consent"
            name="consent"
            type="checkbox"
            required
            aria-invalid={!!fields.consent}
            aria-describedby={fields.consent ? "consent-error" : undefined}
          />
          <label htmlFor="consent">
            I have read the <Link href="/privacy">privacy notice</Link> and
            understand how my enquiry is handled.
          </label>
        </div>
        {fields.consent && (
          <p id="consent-error" className="field-error">
            {fields.consent[0]}
          </p>
        )}
      </fieldset>
      {online && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            onReady={() => setScriptReady(true)}
            onError={() => setVerification("error")}
          />
          <div ref={widget} className="turnstile" />
          {verification === "expired" && (
            <p className="small muted">
              Spam protection expired and is refreshing.
            </p>
          )}
          {verification === "error" && (
            <p className="field-error">
              Spam protection could not load.{" "}
              {scriptReady ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={resetVerification}
                >
                  Retry verification
                </button>
              ) : (
                "Please reload the page."
              )}{" "}
              You can also email{" "}
              <a href={`mailto:${site.email}`}>{site.email}</a>.
            </p>
          )}
        </>
      )}
      <div className="form-actions">
        {phase === "unconfirmed" && retryPayload ? (
          <button
            type="button"
            className="button"
            disabled={!canSend}
            onClick={() => send(retryPayload, null)}
          >
            Try again <Arrow />
          </button>
        ) : (
          <button type="submit" className="button" disabled={!canSend}>
            {busy
              ? "Sending…"
              : online
                ? "Send enquiry"
                : "Prepare email enquiry"}
            <Arrow />
          </button>
        )}
      </div>
      <p
        ref={statusRef}
        className={`form-status ${phase}`}
        role="status"
        aria-live="polite"
        tabIndex={-1}
      >
        {status}
        {phase === "received" && reference && (
          <>
            {" "}
            Your reference is <strong>{reference}</strong>.
          </>
        )}
      </p>
      {phase === "unconfirmed" && (
        <p className="small muted">
          If “Try again” keeps failing, email{" "}
          <a href={`mailto:${site.email}`}>{site.email}</a> and mention that you
          may already have submitted the form.
        </p>
      )}
      {fallback && (
        <p className="small">
          <a className="text-link" href={fallback}>
            Email this enquiry instead <Arrow diagonal />
          </a>
        </p>
      )}
    </form>
  );
}
