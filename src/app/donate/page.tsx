import Link from "next/link";
import { Arrow, Button, Heading, Photo } from "@/components/ui/primitives";
import { EnquiryForm } from "@/components/sections/enquiry-form";
import { content } from "@/content/repository";
import { site } from "@/content/site";
import { enquiryConfig } from "@/server/config";
import { paymentsConfig } from "@/server/payments/config";
import { PageHeader } from "@/components/layout/page-header";
import { JsonLd } from "@/components/seo/structured-data";
import { faqPage, metadata } from "@/lib/seo";
// Ways to support the foundation. Online gifts happen on /donate/give; this page keeps the
// donation-enquiry form (shared enquiry pipeline: never a payment). It renders per request
// because the form mode and payment availability are runtime configuration.
export const dynamic = "force-dynamic";
/** True when at least one online payment method is configured and usable. */
const onlineGiving = () => !!paymentsConfig().config;
export async function generateMetadata() {
  const { seo } = await content.getDonationPage();
  return metadata(
    seo.title,
    onlineGiving() ? seo.descriptionOnline : seo.description,
    "/donate",
  );
}
export default async function Donate() {
  const page = await content.getDonationPage();
  const enquiries = enquiryConfig();
  const online = onlineGiving();
  const panel = online ? page.panelOnline : page.panel;
  const faq = page.faq.items.map(
    ([question, answer, answerOnline]) =>
      [question, online && answerOnline ? answerOnline : answer] as const,
  );
  return (
    <>
      <PageHeader
        eyebrow={page.eyebrow}
        title={page.title}
        trail={[{ name: "Donate", path: "/donate" }]}
      >
        {page.lead}
      </PageHeader>
      <section className="section-sm">
        <div className="container split donate-intro">
          <Photo photo={page.intro.photo} priority />
          <div>
            <Heading eyebrow={page.intro.eyebrow} title={page.intro.title} />
            {page.intro.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <div className="actions">
              {online ? (
                <>
                  <Button href="/donate/give">Give online</Button>
                  <Button href="#give" outline>
                    Discuss a donation
                  </Button>
                </>
              ) : (
                <Button href="#give">Enquire about donating</Button>
              )}
            </div>
          </div>
        </div>
      </section>
      <section className="section muted-surface" aria-labelledby="donate-areas">
        <div className="container">
          <div className="heading-row">
            <Heading
              id="donate-areas"
              eyebrow={page.areas.eyebrow}
              title={page.areas.title}
            />
            <span className="status">Proposed activities</span>
          </div>
          <ul className="support-areas">
            {page.areas.items.map((area, i) => (
              <li key={area.programme}>
                <span className="index">0{i + 1}</span>
                <h3>{area.title}</h3>
                <p>{area.body}</p>
                <ul>
                  {area.activities.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
                <Link
                  href={`/programmes#${area.programme}`}
                  className="text-link"
                >
                  About this programme <Arrow diagonal />
                </Link>
              </li>
            ))}
          </ul>
          <p className="target-heading">{page.areas.note}</p>
        </div>
      </section>
      <section className="section" id="give" aria-labelledby="give-title">
        <div className="container donate-grid">
          <div className="donate-panel dark">
            <span className="status">{panel.status}</span>
            <h2 id="give-title">{panel.title}</h2>
            <p>{panel.body}</p>
            <ol>
              {panel.steps.map(([title, body], i) => (
                <li key={title}>
                  <span className="index">0{i + 1}</span>
                  <span>
                    <strong>{title}</strong>
                    {body}
                  </span>
                </li>
              ))}
            </ol>
            {online && (
              <p className="small">
                Ready to give now?{" "}
                <Link href="/donate/give">Use the secure donation page</Link>.
              </p>
            )}
            <p className="small">
              Prefer to talk directly? Email{" "}
              <a href={`mailto:${site.email}`}>{site.email}</a> or call{" "}
              <a href={`tel:${site.telephone}`}>{site.phone}</a>.
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
            initialTopic="donation"
            title="Send a donation enquiry."
            description="Tell the foundation how you would like to help. This sends an enquiry, not a payment."
          />
        </div>
      </section>
      <section className="section dark" aria-labelledby="donate-partners">
        <div className="container split">
          <div>
            <Heading
              id="donate-partners"
              eyebrow={page.partnership.eyebrow}
              title={page.partnership.title}
            />
            {page.partnership.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <Button href="/contact?topic=partnership">
              {page.partnership.cta}
            </Button>
          </div>
          <Photo photo={page.partnership.photo} />
        </div>
      </section>
      <section className="section" aria-labelledby="donate-faq">
        <div className="container faq-grid">
          <Heading
            id="donate-faq"
            eyebrow={page.faq.eyebrow}
            title={page.faq.title}
          >
            Something else? Email{" "}
            <a className="inline-link" href={`mailto:${site.email}`}>
              {site.email}
            </a>
            .
          </Heading>
          <div className="faq">
            {faq.map(([q, a]) => (
              <details key={q}>
                <summary>
                  <h3>{q}</h3>
                  <span className="faq-icon" aria-hidden="true" />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
        <JsonLd graph={faqPage("/donate", faq)} />
        <p className="container small muted photo-note">
          {page.photoNote} See the{" "}
          <Link className="inline-link" href="/credits">
            image credits
          </Link>
          .
        </p>
      </section>
    </>
  );
}
