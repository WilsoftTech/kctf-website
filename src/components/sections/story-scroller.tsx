"use client";
import { useEffect, useRef, useState } from "react";
import { Photo } from "@/components/ui/primitives";
import type { PhotoKey } from "@/content/site";
const chapters: {
  title: string;
  label: string;
  body: string;
  image: PhotoKey;
}[] = [
  {
    title: "Landscapes worth caring for.",
    label: "The land",
    body: "The forests, wetlands and cultivated hills of south-western Uganda are the setting for everyday life. Caring for these landscapes means recognising both their ecological value and the needs of the people who depend on them.",
    image: "lake",
  },
  {
    title: "Conservation starts with listening.",
    label: "The people",
    body: "Our intended approach begins with residents, local leaders, women, young people and trusted elders. Their experiences should shape practical conservation education and decisions about shared natural resources.",
    image: "culture",
  },
  {
    title: "Coexistence is a shared responsibility.",
    label: "The future",
    body: "Safe communities and thriving wildlife belong in the same conversation. We propose dialogue, education and lawful referral pathways that respect both people and nature.",
    image: "savanna",
  },
];
export function StoryScroller() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    const o = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting)
            setActive(Number((e.target as HTMLElement).dataset.index));
        });
      },
      { rootMargin: "-35% 0px -35% 0px" },
    );
    refs.current.forEach((r) => {
      if (r) o.observe(r);
    });
    return () => o.disconnect();
  }, []);
  return (
    <div className="story-scroller">
      <div className="story-image">
        <div className="sticky-photo">
          {chapters.map((c, i) => (
            <div
              key={c.label}
              className={i === active ? "current" : ""}
              aria-hidden={i !== active}
            >
              <Photo photo={c.image} />
            </div>
          ))}
        </div>
      </div>
      <div>
        {chapters.map((c, i) => (
          <article
            key={c.label}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-index={i}
            className="story-chapter"
          >
            <div className="mobile-story-photo">
              <Photo photo={c.image} />
            </div>
            <p className="eyebrow">
              0{i + 1} / {c.label}
            </p>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
