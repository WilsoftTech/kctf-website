"use client";

import Image from "next/image";
import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { heroSlides } from "@/content/hero-slides";

const INTERVAL = 7000;
const FADE = 1200;
const count = heroSlides.length;
const number = (index: number) => String(index + 1).padStart(2, "0");

export function HeroCarousel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [outgoing, setOutgoing] = useState<number | null>(null);
  const [requested, setRequested] = useState<number | null>(null);
  // Only the first image is in the server HTML. Mount one neighbour at a time.
  const [loaded, setLoaded] = useState([0]);
  const [ready, setReady] = useState<number[]>([]);
  const [failed, setFailed] = useState<number[]>([]);
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [intent, setIntent] = useState<"play" | "pause" | null>(null);
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const automaticRequest = useRef(false);
  const wantsPlay = intent === "play" || (intent === null && reduced === false);
  const playing = wantsPlay && visible && tabVisible && !hovered && !focused;

  const neighbour = useCallback(
    (from: number, direction = 1) => {
      for (let step = 1; step < count; step++) {
        const next = (from + direction * step + count) % count;
        if (!failed.includes(next)) return next;
      }
      return from;
    },
    [failed],
  );

  const queue = useCallback(
    (index: number, automatic = false) => {
      if (failed.includes(index)) return;
      automaticRequest.current = automatic;
      setRequested(index === active ? null : index);
      setLoaded((previous) =>
        previous.includes(index) ? previous : [...previous, index],
      );
    },
    [active, failed],
  );

  function request(index: number) {
    if (outgoing === null) queue(index);
  }

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(media.matches);
    const visibility = () => setTabVisible(!document.hidden);
    motion();
    visibility();
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    if (requested === null || !ready.includes(requested)) return;
    if (!visible || !tabVisible || (automaticRequest.current && !playing))
      return;
    // Never replace the current layer until the requested image has decoded.
    // Commit on a paint boundary, cancelling if pause conditions change.
    const frame = requestAnimationFrame(() => {
      setOutgoing(reduced || failed.includes(active) ? null : active);
      setActive(requested);
      setRequested(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [requested, ready, reduced, active, failed, visible, tabVisible, playing]);

  useEffect(() => {
    if (outgoing === null) return;
    const timer = window.setTimeout(() => setOutgoing(null), FADE);
    return () => window.clearTimeout(timer);
  }, [outgoing]);

  useEffect(() => {
    if (!playing || requested !== null || neighbour(active) === active) return;
    const timer = window.setTimeout(() => {
      const next = neighbour(active);
      queue(next, true);
    }, INTERVAL);
    return () => window.clearTimeout(timer);
  }, [playing, active, requested, neighbour, queue]);

  useEffect(() => {
    if (!visible || !tabVisible || outgoing !== null || !ready.includes(active))
      return;
    const next = neighbour(active);
    const timer = window.setTimeout(() => {
      setLoaded((previous) =>
        previous.includes(next) ? previous : [...previous, next],
      );
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [active, ready, neighbour, visible, tabVisible, outgoing]);

  // A failed pending slide is skipped; first-image failure can recover too.
  useEffect(() => {
    const broken = requested ?? active;
    if (!failed.includes(broken)) return;
    const next = neighbour(broken);
    // Batch failure callbacks before selecting the replacement at next paint.
    const frame = requestAnimationFrame(() => {
      if (next === broken || next === active) {
        setRequested(null);
        return;
      }
      setRequested(next);
      setLoaded((previous) =>
        previous.includes(next) ? previous : [...previous, next],
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [failed, active, requested, neighbour]);

  const slide = heroSlides[active];
  const unavailable = failed.length === count;
  return (
    <section
      ref={ref}
      className="hero hero-carousel dark"
      data-hero
      data-playing={playing && !unavailable}
      aria-labelledby="hero-title"
      aria-roledescription="carousel"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={(event) => {
        setFocused(true);
        if (
          !event.currentTarget.contains(event.relatedTarget) &&
          event.target.matches(":focus-visible")
        )
          setIntent("pause");
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
      onKeyDownCapture={(event) => {
        // Allow an explicit Play choice to take effect after tabbing out.
        if (event.key === "Tab") return;
        const play = (event.target as HTMLElement).closest(
          "[data-carousel-play]",
        );
        if (!play || !["Enter", " "].includes(event.key)) setIntent("pause");
      }}
    >
      <div
        className="hero-media hero-carousel-media"
        data-hero-media
        aria-hidden="true"
      >
        {heroSlides.map((photo, index) =>
          loaded.includes(index) ? (
            <div
              key={photo.id}
              data-slide={index + 1}
              className={`hero-slide ${index === active ? "is-active" : ""} ${index === outgoing ? "is-outgoing" : ""} ${index === active && outgoing !== null ? "is-entering" : ""} ${failed.includes(index) ? "is-failed" : ""}`}
            >
              <div className="hero-slide-drift">
                <Image
                  src={photo.src}
                  alt=""
                  fill
                  preload={index === 0}
                  loading={index === 0 ? undefined : "eager"}
                  sizes="100vw"
                  style={
                    {
                      "--hero-position": photo.position,
                      "--hero-mobile-position": photo.mobilePosition,
                    } as CSSProperties
                  }
                  onLoad={async (event) => {
                    const image = event.currentTarget;
                    try {
                      await image.decode();
                      setReady((previous) =>
                        previous.includes(index)
                          ? previous
                          : [...previous, index],
                      );
                    } catch {
                      setFailed((previous) =>
                        previous.includes(index)
                          ? previous
                          : [...previous, index],
                      );
                    }
                  }}
                  onError={() =>
                    setFailed((previous) =>
                      previous.includes(index)
                        ? previous
                        : [...previous, index],
                    )
                  }
                />
              </div>
            </div>
          ) : null,
        )}
      </div>
      <div className="hero-shade" />
      {children}
      <div className="container carousel-bottom">
        <div
          className="carousel-navigation"
          role="group"
          aria-label="Hero photographs"
          hidden={reduced === null}
        >
          <button
            type="button"
            aria-label="Previous photograph"
            aria-disabled={unavailable}
            onClick={() => request(neighbour(active, -1))}
          >
            <span aria-hidden="true">←</span>
          </button>
          <span
            className="carousel-counter"
            role="img"
            aria-label={`Photograph ${active + 1} of ${count}`}
          >
            {number(active)} <span aria-hidden="true">/ 05</span>
          </span>
          <button
            type="button"
            aria-label="Next photograph"
            aria-disabled={unavailable}
            onClick={() => request(neighbour(active))}
          >
            <span aria-hidden="true">→</span>
          </button>
          <div
            className="carousel-selectors"
            role="group"
            aria-label="Choose photograph"
          >
            {heroSlides.map((photo, index) => (
              <button
                type="button"
                key={photo.id}
                aria-label={`Show photograph ${index + 1}: ${photo.caption}${failed.includes(index) ? " (unavailable)" : ""}`}
                aria-current={index === active ? "true" : undefined}
                aria-disabled={failed.includes(index)}
                onClick={() => request(index)}
              >
                <span />
              </button>
            ))}
          </div>
          <button
            type="button"
            data-carousel-play
            aria-label={wantsPlay ? "Pause slideshow" : "Play slideshow"}
            aria-disabled={unavailable}
            onClick={() => {
              if (!unavailable) setIntent(wantsPlay ? "pause" : "play");
            }}
          >
            <span aria-hidden="true">{wantsPlay ? "Ⅱ" : "▷"}</span>
          </button>
        </div>
        <div className="carousel-credit">
          <span>
            {unavailable
              ? "Regional photographs are currently unavailable."
              : slide.caption}
          </span>
          {!unavailable && (
            <span>
              <a href={slide.source}>{slide.author}</a> ·{" "}
              <a href={slide.licenseUrl}>{slide.license}</a>
            </span>
          )}
          <a href="/credits#homepage-photographs">
            Illustrative regional photography · Credits & modifications
          </a>
        </div>
        <p className="visually-hidden" aria-live="off">
          {!unavailable && slide.alt} These regional photographs do not document
          KCTF activities or partnerships.
        </p>
      </div>
    </section>
  );
}
