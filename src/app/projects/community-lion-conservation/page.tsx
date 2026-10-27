import { Hero } from "@/components/sections/hero";
import { CTA, Heading, Button } from "@/components/ui/primitives";
import { projectStages, targets } from "@/content/site";
import { metadata } from "@/lib/seo";
export const generateMetadata = () =>
  metadata(
    "Community Lion Conservation",
    "A proposed 12-month community-led initiative for conservation education, dialogue and safe wildlife incident reporting in Rukungiri District.",
    "/projects/community-lion-conservation",
  );
export default function Project() {
  return (
    <>
      <Hero
        photo="lion"
        title="A future for lions.|A voice for communities."
        description="A proposed community-led initiative for understanding, safer responses and peaceful coexistence."
        eyebrow="Community Lion Conservation / Proposed initiative"
        project
      />
      <section className="section" id="project-overview">
        <div className="container split">
          <Heading
            eyebrow="The proposal"
            title="Conservation built on trust."
          />
          <div>
            <p>
              Households neighbouring protected landscapes face concerns about
              safety, livestock and livelihoods. This proposal begins with their
              experiences and aims to connect practical conservation education
              with safe, lawful incident reporting.
            </p>
            <p>
              Over a proposed 12 months, the initiative would bring residents,
              local leaders and relevant experts into a shared learning process.
              Locations and coordination arrangements remain to be confirmed.
            </p>
            <p className="notice">
              Planning stage. No grant award, formal partnership, field activity
              or completed outcome is claimed.
            </p>
          </div>
        </div>
        <div className="container">
          <div className="target-heading">Proposed outputs by month 12</div>
          <div className="targets">
            {targets.map((t) => (
              <div key={t.label}>
                <strong>{t.value}</strong>
                <span>{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section muted-surface" id="approach">
        <div className="container">
          <Heading
            eyebrow="The delivery approach"
            title="Listen. Learn. Build together."
          />
          <div className="three-columns">
            {projectStages.map(([n, t, time, body]) => (
              <article key={n}>
                <span className="eyebrow">
                  {n} / {time}
                </span>
                <h3>{t}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container split">
          <div>
            <Heading
              eyebrow="Resources & accountability"
              title="A clear plan for every contribution."
            />
            <p>
              The indicative budget is <strong>£6,960</strong>. This is a
              proposed funding request, subject to quotations, funder
              requirements and accepted exchange-rate assumptions.
            </p>
            <Button href="/contact?topic=partnership">
              Discuss the proposal
            </Button>
          </div>
          <div className="prose">
            <h3>What the work plan includes</h3>
            <ul>
              <li>
                120 household interviews and 12 key-informant discussions.
              </li>
              <li>
                12 community dialogues, four radio discussions and 300
                information sheets.
              </li>
              <li>
                20 volunteer focal persons trained in safe reporting and
                referral.
              </li>
              <li>
                Quarterly learning briefs and a final technical and financial
                report.
              </li>
            </ul>
            <h3>Responsible boundaries</h3>
            <p>
              The proposal excludes wildlife handling, enforcement and patrols.
              Protected-area activities require the relevant authorisation.
              Volunteers would not pursue wildlife or investigate suspects.
            </p>
            <h3>Measuring learning</h3>
            <p>
              A baseline and endline would assess changes in conservation
              understanding. A proposed 60% safe-response knowledge target
              remains subject to the baseline.
            </p>
          </div>
        </div>
      </section>
      <CTA />
    </>
  );
}
