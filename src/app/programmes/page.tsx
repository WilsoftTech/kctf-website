import { PageHeader, Photo, CTA, Eyebrow } from "@/components/ui/primitives";
import { programmes } from "@/content/site";
import { metadata } from "@/lib/seo";
import Link from "next/link";
export const generateMetadata = () =>
  metadata(
    "Our programmes",
    "Explore KCTF’s four intended focus areas: wildlife conservation, environmental protection, climate action, and justice and human rights.",
    "/programmes",
  );
export default function Programmes() {
  return (
    <>
      <PageHeader
        eyebrow="Our programmes"
        title="Connected challenges. Shared possibilities."
      >
        Four areas of focus, united by a belief that thriving communities and a
        healthy natural world belong together.
      </PageHeader>
      <div className="container programme-jump">
        <nav aria-label="Programme sections">
          {programmes.map((p) => (
            <Link key={p.id} href={`#${p.id}`}>
              {p.short} <span aria-hidden="true">↓</span>
            </Link>
          ))}
        </nav>
      </div>
      {programmes.map((p, i) => (
        <section
          id={p.id}
          key={p.id}
          className={`section ${i % 2 ? "muted-surface" : ""}`}
        >
          <div className={`container split ${i % 2 ? "reverse" : ""}`}>
            <Photo photo={p.image} />
            <div data-reveal>
              <Eyebrow>0{i + 1} / Our focus</Eyebrow>
              <h2>{p.name}</h2>
              <p className="lead">{p.summary}</p>
              <p>{p.body}</p>
              <ul className="clean-list">
                {p.activities.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ))}
      <section className="container section-sm">
        <p className="notice">
          These are intended areas of work drawn from the proposed foundation
          constitution. Specific activities depend on registration, permissions,
          resources and community consultation.
        </p>
      </section>
      <CTA />
    </>
  );
}
