"use client";
// Cloudflare Turnstile for public forms: explicit rendering, single-use tokens, and
// visible recovery when the script or the challenge fails.
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { site } from "@/content/site";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export type Verification =
  "loading" | "ready" | "verified" | "expired" | "error";

export function useTurnstile({
  enabled,
  siteKey,
  action,
}: {
  enabled: boolean;
  siteKey?: string;
  action: "enquiry" | "donation";
}) {
  const [token, setToken] = useState("");
  const [verification, setVerification] = useState<Verification>("loading");
  const [scriptReady, setScriptReady] = useState(false);
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled || !scriptReady || !widget.current || !window.turnstile)
      return;
    widgetId.current = window.turnstile.render(widget.current, {
      sitekey: siteKey,
      action,
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
  }, [enabled, scriptReady, siteKey, action]);

  /** Tokens are single-use: fetch a fresh one before any further attempt. */
  const reset = useCallback(() => {
    setToken("");
    if (widgetId.current) {
      setVerification("ready");
      window.turnstile?.reset(widgetId.current);
    }
  }, []);

  return {
    enabled,
    token,
    verification,
    scriptReady,
    reset,
    widget,
    onReady: () => setScriptReady(true),
    onError: () => setVerification("error"),
  };
}

export type TurnstileState = ReturnType<typeof useTurnstile>;

export function TurnstileField({ turnstile }: { turnstile: TurnstileState }) {
  const {
    enabled,
    verification,
    scriptReady,
    reset,
    widget,
    onReady,
    onError,
  } = turnstile;
  if (!enabled) return null;
  return (
    <div className="turnstile-field">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={onReady}
        onError={onError}
      />
      <div ref={widget} className="turnstile" />
      {verification === "loading" && (
        <p className="field-hint">Loading spam protection…</p>
      )}
      {verification === "expired" && (
        <p className="field-hint">Spam protection expired and is refreshing.</p>
      )}
      {verification === "error" && (
        <p className="field-error" role="alert">
          <span aria-hidden="true" className="field-error-icon">
            !
          </span>
          <span>
            Spam protection could not load.{" "}
            {scriptReady ? (
              <button type="button" className="link-button" onClick={reset}>
                Retry verification
              </button>
            ) : (
              "Please reload the page."
            )}{" "}
            You can also email <a href={`mailto:${site.email}`}>{site.email}</a>
            .
          </span>
        </p>
      )}
    </div>
  );
}
