"use client";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { enquirySchema } from "@/validation/enquiry";
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
export function EnquiryForm({
  enabled,
  initialTopic = "general",
}: {
  enabled: boolean;
  initialTopic?: string;
}) {
  const [fields, setFields] = useState<Record<string, string[] | undefined>>(
    {},
  );
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [topic, setTopic] = useState(initialTopic);
  const widget = useRef<HTMLDivElement>(null);
  const id = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!ready || !widget.current || !window.turnstile) return;
    id.current = window.turnstile.render(widget.current, {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      action: "enquiry",
      callback: (t: string) => setToken(t),
      "expired-callback": () => setToken(""),
      "error-callback": () =>
        setStatus("Verification could not load. Please email us directly."),
    });
    return () => {
      if (id.current) window.turnstile?.remove(id.current);
    };
  }, [ready]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const data = {
      name: fd.get("name"),
      email: fd.get("email"),
      topic: fd.get("topic"),
      message: fd.get("message"),
      consent: fd.get("consent") === "on",
      website: fd.get("website") || "",
      token,
    };
    const parsed = enquirySchema.safeParse(data);
    if (!parsed.success) {
      setFields(parsed.error.flatten().fieldErrors);
      setStatus("Please check the highlighted fields.");
      requestAnimationFrame(() =>
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setFields({});
    if (!enabled) {
      const subject = encodeURIComponent(`KCTF ${parsed.data.topic} enquiry`);
      const body = encodeURIComponent(
        `Name: ${parsed.data.name}\nEmail: ${parsed.data.email}\n\n${parsed.data.message}`,
      );
      window.location.href = `mailto:${site.email}?subject=${subject}&body=${body}`;
      setStatus(
        "Your email app will open with a draft. Review it and press Send there. Nothing has been sent by this website.",
      );
      return;
    }
    if (!token) {
      setStatus("Please complete the verification.");
      return;
    }
    setBusy(true);
    setStatus("Sending your enquiry…");
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      setStatus(result.message || result.error || "Please try again.");
      if (response.ok) {
        form.reset();
        setTopic(initialTopic);
      } else if (result.fields) setFields(result.fields);
    } catch {
      setStatus("Delivery could not be confirmed. Please email us directly.");
    } finally {
      setBusy(false);
      setToken("");
      if (id.current) window.turnstile?.reset(id.current);
    }
  }
  return (
    <form className="enquiry-form" onSubmit={submit} noValidate>
      <h2>Start a conversation.</h2>
      <p>
        {enabled
          ? "Send the foundation a general, volunteer or partnership enquiry."
          : "Prepare an enquiry in your email app. Website email delivery has not been activated yet."}
      </p>
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
      </select>
      <label htmlFor="message">Your message</label>
      <textarea
        name="message"
        id="message"
        rows={5}
        required
        minLength={20}
        maxLength={3000}
        placeholder="Tell us how you’d like to connect…"
        aria-invalid={!!fields.message}
        aria-describedby="message-help message-error"
      />
      <p id="message-help" className="small muted">
        20–3,000 characters. Please leave out sensitive personal details.
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
      {enabled && (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            onReady={() => setReady(true)}
            onError={() =>
              setStatus(
                "Verification could not load. Please email us directly.",
              )
            }
          />
          <div ref={widget} />
        </>
      )}
      <button type="submit" className="button" disabled={busy}>
        {busy ? "Sending…" : enabled ? "Send enquiry" : "Prepare email enquiry"}
        <Arrow />
      </button>
      <p className="form-status" role="status" aria-live="polite">
        {status}
      </p>
      <noscript>
        <p>
          Please email <a href={`mailto:${site.email}`}>{site.email}</a>{" "}
          directly to make an enquiry.
        </p>
      </noscript>
    </form>
  );
}
