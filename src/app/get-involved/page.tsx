import {
  PageHeader,
  Heading,
  Button,
  Photo,
  Eyebrow,
} from "@/components/ui/primitives";
import { metadata } from "@/lib/seo";
export const generateMetadata = () =>
  metadata(
    "Get involved",
    "Express an interest in future volunteer opportunities or start a partnership conversation with KCTF in Rukungiri.",
    "/get-involved",
  );
export default function Involved() {
  return (
    <>
      <PageHeader
        eyebrow="Get involved"
        title="A shared future needs all of us."
      >
        Your knowledge, time and perspective can help shape what comes next.
      </PageHeader>
      <section className="section-sm" id="volunteer">
        <div className="container split">
          <Photo photo="forest" priority />
          <div>
            <Eyebrow>01 / Volunteer</Eyebrow>
            <h2>
              Bring your time.
              <br />
              Grow your purpose.
            </h2>
            <p>
              Express an interest in future opportunities for community
              education, communications, project learning and coordination.
            </p>
            <p>
              Our plans are still developing. An expression of interest is a
              conversation, rather than an offer of a placement. Activities will
              depend on approvals, resources and safeguarding arrangements.
            </p>
            <Button href="/contact?topic=volunteer">
              Express volunteer interest
            </Button>
          </div>
        </div>
      </section>
      <section className="section muted-surface" id="partner">
        <div className="container split">
          <div>
            <Heading
              eyebrow="02 / Partner"
              title="Connect your purpose with ours."
            />
            <p>
              We welcome conversations with conservation practitioners,
              educators, community groups and prospective supporters who share
              our commitment to people and nature.
            </p>
            <p>
              Possible areas for discussion include conservation education,
              technical advice, climate learning and support for the proposed
              lion conservation initiative.
            </p>
            <Button href="/contact?topic=partnership">
              Start a partnership conversation
            </Button>
          </div>
          <Photo photo="lake" />
        </div>
      </section>
      <section className="section dark">
        <div className="container split">
          <Heading eyebrow="03 / Support" title="Help shape the first steps." />
          <div>
            <p>
              Our proposed work needs thoughtful collaboration and lawful
              resources. If you would like to discuss supporting an initiative,
              please contact the founder.
            </p>
            <p>
              The website does not collect donations or display unconfirmed
              banking details. Funding and partnership conversations are handled
              directly by the foundation.
            </p>
            <Button href="/contact?topic=partnership">
              Discuss ways to support
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
