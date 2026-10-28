"use client";
// Restrained entrance for /donate/give: the photograph settles once and the form card's
// sections rise in a short stagger. Content is fully visible without JavaScript (GSAP
// only animates *from* an offset once it has loaded), nothing loops, nothing is tied to
// scrolling, and everything is skipped under prefers-reduced-motion. The headline's
// masked line reveal is pure CSS (`mask-rise`), shared with the homepage hero.
import { useEffect, useRef, type ReactNode } from "react";

export function GiveMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let cleanup: undefined | (() => void);
    import("gsap")
      .then(({ default: gsap }) => {
        if (cancelled || !ref.current) return;
        const mm = gsap.matchMedia();
        mm.add("(prefers-reduced-motion: no-preference)", () => {
          const ctx = gsap.context(() => {
            gsap.fromTo(
              "[data-give-media]",
              { scale: 1.06 },
              { scale: 1, duration: 2.4, ease: "power2.out" },
            );
            gsap.from("[data-give-stagger] > *", {
              y: 14,
              autoAlpha: 0,
              duration: 0.7,
              ease: "power3.out",
              stagger: 0.06,
              delay: 0.25,
              clearProps: "all",
            });
          }, ref);
          return () => ctx.revert();
        });
        cleanup = () => mm.revert();
      })
      .catch(() => {
        /* Content remains available if motion cannot load. */
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);
  return (
    <div ref={ref} className="give-layout">
      {children}
    </div>
  );
}
