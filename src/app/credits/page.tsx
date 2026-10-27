import { PageHeader } from "@/components/ui/primitives";
import { photos } from "@/content/site";
import { metadata } from "@/lib/seo";
export const generateMetadata = () =>
  metadata(
    "Image credits",
    "Photography sources, creators and reuse licences for the KCTF website.",
    "/credits",
  );
export default function Credits() {
  const unique = Object.values(photos).filter(
    (p, i, a) => a.findIndex((x) => x.src === p.src) === i,
  );
  return (
    <>
      <PageHeader eyebrow="Image credits" title="Seen through their eyes.">
        With acknowledgement to the photographers whose work illustrates
        Uganda’s landscapes and wildlife.
      </PageHeader>
      <div className="container legal credits-list">
        <p>
          These photographs illustrate the website’s themes. They do not
          document KCTF field activities, partnerships or project sites.
          Original files may be resized and re-encoded for performance; layouts
          crop the display area.
        </p>
        {unique.map((p) => (
          <article key={p.src}>
            <h2>{p.caption}</h2>
            <p>
              Photograph by <a href={p.source}>{p.author}</a>.{" "}
              <a href={p.licenseUrl}>{p.license}</a>.
            </p>
            <p>
              <a href={p.source}>View original source and licensing</a>
            </p>
          </article>
        ))}
        <article>
          <h2>Typography</h2>
          <p>
            Fraunces by Undercase Type and Geist by Vercel, distributed under
            the SIL Open Font License through Fontsource. Fonts are hosted
            locally.
          </p>
        </article>
        <article>
          <h2>KCTF identity</h2>
          <p>
            The approved transparent KCTF logo was supplied for this project and
            is used without redesign.
          </p>
        </article>
      </div>
    </>
  );
}
