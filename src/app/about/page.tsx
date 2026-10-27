import {
  PageHeader,
  Photo,
  Heading,
  CTA,
  Eyebrow,
} from "@/components/ui/primitives";
import { site } from "@/content/site";
import { metadata } from "@/lib/seo";
export const generateMetadata = () =>
  metadata(
    "About the foundation",
    "Meet KCTF, a community-led foundation taking shape in Rukungiri, Uganda. Explore our mission, vision and proposed governance.",
    "/about",
  );
export default function About() {
  return (
    <>
      <PageHeader
        eyebrow="About the foundation"
        title="Rooted here. Looking forward."
      >
        A shared commitment to the communities and natural landscapes of Kigezi.
      </PageHeader>
      <div className="container about-landscape">
        <Photo photo="heritage" priority />
      </div>
      <section className="section">
        <div className="container split">
          <Heading
            eyebrow="Who we are"
            title="Transformation starts close to home."
          />
          <div className="prose">
            <p>
              Kigezi Community Transformation Foundation is a community-led
              initiative based in Rukungiri, Uganda. Its founding purpose brings
              wildlife conservation, environmental protection, climate action,
              and justice and human rights into one shared vision.
            </p>
            <p>
              Founded by {site.founder}, the foundation proposes to work through
              local knowledge, practical education, inclusive dialogue and
              responsible cooperation with public institutions.
            </p>
            <p className="notice">
              The foundation’s supplied constitution is proposed and subject to
              adoption and registration. This website does not claim that legal
              registration is complete.
            </p>
          </div>
        </div>
      </section>
      <section className="section dark">
        <div className="container mission-grid">
          <div data-reveal>
            <Eyebrow>Our vision</Eyebrow>
            <h2>
              A thriving future.
              <br />
              <em>Shared by all.</em>
            </h2>
            <p>{site.vision}</p>
          </div>
          <div data-reveal>
            <Eyebrow>Our mission</Eyebrow>
            <h3>
              People and nature,
              <br />
              moving forward together.
            </h3>
            <p>{site.mission}</p>
          </div>
        </div>
      </section>
      <section className="section" id="our-home">
        <div className="container split">
          <div>
            <Heading eyebrow="Where we begin" title="Bunura, Rukungiri." />
            <p>{site.address}.</p>
            <p>
              The proposed initial operational area is Bunura Cell, subject to
              the scope authorised at registration. Activities beyond that area,
              including outreach near protected areas, require the applicable
              approvals.
            </p>
          </div>
          <div className="facts">
            <div>
              <span>Founder</span>
              <strong>{site.founder}</strong>
            </div>
            <div>
              <span>Founding purpose</span>
              <strong>Community transformation</strong>
            </div>
            <div>
              <span>Proposed character</span>
              <strong>Non-profit and non-partisan</strong>
            </div>
            <div>
              <span>Starting point</span>
              <strong>Bunura Cell, Rukungiri</strong>
            </div>
          </div>
        </div>
      </section>
      <section className="section muted-surface">
        <div className="container">
          <Heading
            eyebrow="Our intended approach"
            title="Built on trust. Guided by care."
          />
          <div className="three-columns">
            {[
              [
                "Community first",
                "Listen to residents, respect local knowledge, and include women, young people and vulnerable groups in meaningful dialogue.",
              ],
              [
                "Accountable by design",
                "The proposed constitution provides for assembly oversight, documented spending, joint signatories and appropriate independent review.",
              ],
              [
                "Lawful and respectful",
                "Work within approved boundaries, protect personal information, and refer wildlife incidents and rights concerns to competent institutions.",
              ],
            ].map(([t, b], i) => (
              <article key={t}>
                <span className="eyebrow">0{i + 1}</span>
                <h3>{t}</h3>
                <p>{b}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <CTA />
    </>
  );
}
