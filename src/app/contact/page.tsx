import { PageHeader, Arrow } from "@/components/ui/primitives";
import { EnquiryForm } from "@/components/sections/enquiry-form";
import { enquiriesEnabled } from "@/lib/enquiries";
import { site } from "@/content/site";
import { metadata } from "@/lib/seo";
export const dynamic = "force-dynamic";
export const generateMetadata = () =>
  metadata(
    "Contact",
    "Contact KCTF in Rukungiri, Uganda, for general enquiries, volunteering and partnership conversations.",
    "/contact",
  );
export default async function Contact({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;
  return (
    <>
      <PageHeader eyebrow="Contact" title="Let’s start something meaningful.">
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
            enabled={enquiriesEnabled()}
            initialTopic={
              topic === "volunteer" || topic === "partnership"
                ? topic
                : "general"
            }
          />
        </div>
      </section>
    </>
  );
}
