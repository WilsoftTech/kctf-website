import Image from "next/image";
import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { photos, type PhotoKey } from "@/content/site";
export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <span aria-hidden="true" className="arrow">
      {diagonal ? "↗" : "→"}
    </span>
  );
}
export function Button({
  href,
  children,
  outline = false,
}: {
  href: string;
  children: ReactNode;
  outline?: boolean;
}) {
  return (
    <Link href={href} className={`button ${outline ? "button-outline" : ""}`}>
      {children}
      <Arrow />
    </Link>
  );
}
export function Heart() {
  return (
    <svg
      className="heart"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.6l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.6Z"
        fill="currentColor"
      />
    </svg>
  );
}
/**
 * Prominent donation calls to action link to the online giving page. It explains when
 * online giving is unavailable and always offers "Discuss a donation" (/donate#give).
 */
export function DonateButton({
  className = "",
  label = "Donate",
  current = false,
  onClick,
}: {
  className?: string;
  label?: string;
  current?: boolean;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link
      href="/donate/give"
      className={`donate-button ${className}`}
      aria-current={current ? "page" : undefined}
      onClick={onClick}
    >
      <Heart />
      {label}
    </Link>
  );
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="eyebrow">
      <span aria-hidden="true" />
      {children}
    </p>
  );
}
export function Heading({
  eyebrow,
  title,
  children,
  id,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <div className="section-heading">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id}>{title}</h2>
      {children && <p className="lead">{children}</p>}
    </div>
  );
}
export function Photo({
  photo,
  className = "",
  priority = false,
  credit = true,
  href,
  linkLabel,
}: {
  photo: PhotoKey;
  className?: string;
  priority?: boolean;
  credit?: boolean;
  href?: string;
  linkLabel?: string;
}) {
  const p = photos[photo];
  const image = (
    <Image
      src={p.src}
      alt={p.alt}
      fill
      sizes="(min-width:1024px) 50vw, 100vw"
      className="object-cover"
      preload={priority}
    />
  );
  return (
    <figure className={`photo ${className}`}>
      {href ? (
        <Link href={href} className="photo-image" aria-label={linkLabel}>
          {image}
        </Link>
      ) : (
        <div className="photo-image">{image}</div>
      )}
      {credit && <figcaption>{p.location}</figcaption>}
    </figure>
  );
}
export function CTA() {
  return (
    <section className="cta dark">
      <div className="container">
        <Eyebrow>Make a connection</Eyebrow>
        <h2>
          Change begins
          <br />
          with <em>all of us.</em>
        </h2>
        <div className="cta-bottom">
          <p>
            Bring your knowledge, your ideas, and your commitment to a thriving
            Kigezi.
          </p>
          <Button href="/get-involved">Get involved</Button>
        </div>
      </div>
    </section>
  );
}
