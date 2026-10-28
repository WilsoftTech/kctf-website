import { Arrow, Heading } from "@/components/ui/primitives";
import { PageHeader } from "@/components/layout/page-header";
import { ContactMap } from "@/components/sections/contact-map";
import { EnquiryForm } from "@/components/sections/enquiry-form";
import { enquiryConfig, readMapsEmbedKey } from "@/server/config";
import { officeLocation, site } from "@/content/site";
import { mapsDirectionsUrl, mapsEmbedUrl, mapsSearchUrl } from "@/lib/maps";
import { metadata } from "@/lib/seo";
export const dynamic = "force-dynamic";
export const generateMetadata = () =>
  metadata(
    "Contact the foundation in Rukungiri, Uganda",
    "Email, telephone, address and map for KCTF in Bunura Cell, Rukungiri Municipality, Uganda. Send a general, volunteering, partnership or donation enquiry.",
    "/contact",
  );
export default async function Contact({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  // Read at request time so configuration changes apply without a rebuild.
  const enquiries = enquiryConfig();
  const mapsKey = readMapsEmbedKey();
  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="Let’s start something meaningful."
        trail={[{ name: "Contact", path: "/contact" }]}
      >
        A question, an idea, or a shared purpose. We’d be glad to hear from you.
      </PageHeader>
      <section className="section-sm">
        <div className="container contact-grid">
          <div className="contact-details">
            <p className="eyebrow">Talk to the foundation</p>
            <h2>
              We’re here
              <br />
              in Rukungiri.
            </h2>
            <dl>
              <dt>Email</dt>
              <dd>
                <a href={`mailto:${site.email}`}>
                  {site.email}
                  <Arrow diagonal />
                </a>
              </dd>
              <dt>Telephone</dt>
              <dd>
                <a href={`tel:${site.telephone}`}>
                  {site.phone}
                  <Arrow diagonal />
                </a>
              </dd>
              <dt>Our location</dt>
              <dd>{site.address}</dd>
              <dt>Founder</dt>
              <dd>{site.founder}</dd>
            </dl>
            <p className="small muted">
              For general enquiries only. Please do not submit sensitive case
              details or urgent incident reports through this form.
            </p>
          </div>
          <EnquiryForm
            mode={enquiries.mode}
            siteKey={
              enquiries.mode === "online"
                ? enquiries.config.turnstileSiteKey
                : undefined
            }
            recordDrafts={
              enquiries.mode === "email-draft" && !!enquiries.drafts
            }
            initialTopic={
              topic === "volunteer" ||
              topic === "partnership" ||
              topic === "donation"
                ? topic
                : "general"
            }
          />
        </div>
      </section>
      <section
        className="section muted-surface"
        id="find-us"
        aria-labelledby="find-us-title"
      >
        <div className="container contact-location">
          <Heading
            id="find-us-title"
            eyebrow="Find us"
            title="Bunura, Rukungiri."
          >
            The foundation is based in Bunura Cell, Rwakabengo Ward, in the
            Southern Division of Rukungiri Municipality, south-western Uganda.
            Please contact the foundation before visiting.
          </Heading>
          <ContactMap
            address={site.address}
            embedSrc={
              mapsKey ? mapsEmbedUrl(mapsKey, officeLocation.query) : undefined
            }
            searchHref={mapsSearchUrl(officeLocation.query)}
            directionsHref={mapsDirectionsUrl(officeLocation.query)}
            verifiedPin={officeLocation.verifiedPin}
          />
        </div>
      </section>
    </>
  );
}
