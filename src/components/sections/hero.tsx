import Image from "next/image";
import { photos, type PhotoKey } from "@/content/site";
import { Button, Eyebrow } from "@/components/ui/primitives";
export function Hero({
  title,
  description,
  photo = "hero",
  eyebrow = "Rooted in Kigezi. Working for tomorrow.",
  project = false,
}: {
  title: string;
  description: string;
  photo?: PhotoKey;
  eyebrow?: string;
  project?: boolean;
}) {
  const p = photos[photo];
  return (
    <section
      className={`hero dark ${project ? "hero-inner" : ""}`}
      data-hero
      aria-labelledby="hero-title"
    >
      <div className="hero-media" data-hero-media>
        <Image
          src={p.src}
          alt={p.alt}
          fill
          preload
          sizes="100vw"
          className="object-cover"
        />
      </div>
      <div className="hero-shade" />
      <div className="container hero-content">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 id="hero-title">
          {title.split("|").map((line, i) => (
            <span className="hero-line" key={line}>
              <span style={{ animationDelay: `${i * 120 + 100}ms` }}>
                {line}{" "}
              </span>
            </span>
          ))}
        </h1>
        <p>{description}</p>
        <div className="actions">
          <Button href={project ? "/contact?topic=partnership" : "/programmes"}>
            {project ? "Discuss this initiative" : "Explore our work"}
          </Button>
          <Button
            href={project ? "#project-overview" : "/get-involved"}
            outline
          >
            {project ? "Project overview" : "Be part of the change"}
          </Button>
        </div>
      </div>
      <div className="container hero-bottom">
        <a
          className="scroll-cue"
          href={project ? "#project-overview" : "#introduction"}
        >
          <span aria-hidden="true">↓</span> Discover more
        </a>
        <span>
          {p.caption}
          <br />
          <a href={p.source}>{p.author}</a> ·{" "}
          <a href={p.licenseUrl}>{p.license}</a>
        </span>
      </div>
    </section>
  );
}
