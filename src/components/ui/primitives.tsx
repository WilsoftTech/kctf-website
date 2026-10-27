import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
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
      {credit && (
        <figcaption>
          {p.caption} · <a href={p.source}>{p.author}</a> ·{" "}
          <a href={p.licenseUrl}>{p.license}</a>
        </figcaption>
      )}
    </figure>
  );
}
export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="page-header container">
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>{eyebrow}</span>
      </nav>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1>{title}</h1>
      <p className="lead">{children}</p>
    </section>
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
