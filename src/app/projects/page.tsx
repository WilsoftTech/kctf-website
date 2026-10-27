import {
  PageHeader,
  Photo,
  Button,
  CTA,
  Eyebrow,
} from "@/components/ui/primitives";
import { metadata } from "@/lib/seo";
export const generateMetadata = () =>
  metadata(
    "Projects",
    "Discover the proposed Community Lion Conservation initiative and KCTF’s approach to community-led conservation.",
    "/projects",
  );
export default function Projects() {
  return (
    <>
      <PageHeader eyebrow="Our projects" title="Ideas with a place to begin.">
        Thoughtful, community-led proposals for a future where people and nature
        thrive together.
      </PageHeader>
      <section className="section-sm">
        <div className="container">
          <article className="split project-feature">
            <Photo
              photo="lion"
              priority
              href="/projects/community-lion-conservation"
              linkLabel="Explore Community Lion Conservation"
            />
            <div>
              <span className="status">Proposed · 12 months</span>
              <h2>Community Lion Conservation</h2>
              <p>
                Community education, practical dialogue and safe incident
                reporting to strengthen human-wildlife coexistence.
              </p>
              <p className="small muted">
                Rukungiri District · Exact outreach locations to be confirmed
              </p>
              <Button href="/projects/community-lion-conservation">
                View project proposal
              </Button>
            </div>
          </article>
        </div>
      </section>
      <section className="section muted-surface">
        <div className="container split">
          <div>
            <Eyebrow>From proposal to practice</Eyebrow>
            <h2>
              Careful foundations.
              <br />
              Credible progress.
            </h2>
          </div>
          <div>
            <p>
              Our first documented initiative is in the planning stage. Its work
              plan sets out intended activities, an indicative budget and a
              framework for monitoring and accountability.
            </p>
            <p>
              Funding, local approvals and authority coordination are
              prerequisites for delivery. Future project updates will
              distinguish planned activities from verified results.
            </p>
          </div>
        </div>
      </section>
      <CTA />
    </>
  );
}
