"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
export function Motion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => {
    let cancelled = false;
    let cleanup: undefined | (() => void);
    Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([g, s]) => {
        if (cancelled) return;
        const gsap = g.default;
        gsap.registerPlugin(s.ScrollTrigger);
        const mm = gsap.matchMedia();
        mm.add("(prefers-reduced-motion: no-preference)", () => {
          const ctx = gsap.context(() => {
            gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
              gsap.from(el, {
                y: 30,
                duration: 1,
                ease: "power3.out",
                scrollTrigger: { trigger: el, start: "top 94%", once: true },
              });
            });
            const hero = ref.current?.querySelector("[data-hero]");
            if (hero) {
              gsap.to("[data-hero-media]", {
                yPercent: 18,
                ease: "none",
                scrollTrigger: {
                  trigger: hero,
                  start: "top top",
                  end: "bottom top",
                  scrub: 0.6,
                },
              });
            }
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
  }, [path]);
  return <div ref={ref}>{children}</div>;
}
