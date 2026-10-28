"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Arrow } from "@/components/ui/primitives";

type Phase = "idle" | "loading" | "loaded" | "slow";
const noSubscription = () => () => {};
// After this long without a load event, suggest the external link instead.
const SLOW_AFTER_MS = 15_000;

/**
 * Click-to-load Google map. Nothing is requested from Google until the visitor chooses to
 * load the map; the address and the external Google Maps links work without it, without
 * JavaScript and if the embed fails.
 */
export function ContactMap({
  address,
  embedSrc,
  searchHref,
  directionsHref,
  verifiedPin,
}: {
  address: string;
  /** Maps Embed API URL, or undefined when no embed key is configured. */
  embedSrc?: string;
  searchHref: string;
  directionsHref: string;
  /** False while the result is an address search rather than a confirmed office pin. */
  verifiedPin: boolean;
}) {
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [phase, setPhase] = useState<Phase>("idle");
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = setTimeout(() => setPhase("slow"), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const label = verifiedPin
    ? "Google map showing the foundation’s office"
    : "Google map: approximate area from an address search for Bunura Cell, Rwakabengo Ward, Rukungiri Municipality";

  return (
    <div className="contact-map">
      <div className="map-frame">
        {phase === "idle" ? (
          <div className="map-placeholder">
            <span className="location-dot" aria-hidden="true" />
            {embedSrc ? (
              <>
                <p>
                  The map is not loaded yet. Loading it connects your browser to
                  Google Maps, which processes your IP address and may set
                  cookies under Google’s own terms. See the{" "}
                  <Link className="inline-link" href="/privacy#map">
                    privacy notice
                  </Link>
                  .
                </p>
                <button
                  type="button"
                  className="button"
                  disabled={!hydrated}
                  onClick={() => setPhase("loading")}
                >
                  Load Google map
                </button>
              </>
            ) : (
              <p>
                An embedded map is not available on this page. Use the Google
                Maps link below to see the area.
              </p>
            )}
          </div>
        ) : (
          <iframe
            src={embedSrc}
            title={label}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            onLoad={() => setPhase("loaded")}
          />
        )}
        {(phase === "loading" || phase === "slow") && (
          <p className="map-status" role="status">
            {phase === "loading"
              ? "Loading map…"
              : "The map is taking longer than expected. You can open the address in Google Maps instead."}
          </p>
        )}
      </div>
      {!verifiedPin && (
        <p className="small muted">
          Approximate area only: the map shows Google’s search result for the
          address, not a confirmed office pin.
        </p>
      )}
      <address className="map-address">{address}</address>
      <div className="map-links">
        <a
          href={searchHref}
          className="text-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in Google Maps
          <span className="visually-hidden"> (opens in a new tab)</span>
          <Arrow diagonal />
        </a>
        <a
          href={directionsHref}
          className="text-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get directions
          <span className="visually-hidden"> (opens in a new tab)</span>
          <Arrow diagonal />
        </a>
      </div>
      <noscript>
        <p className="small">
          The embedded map needs JavaScript. The Google Maps links above work
          without it.
        </p>
      </noscript>
    </div>
  );
}
