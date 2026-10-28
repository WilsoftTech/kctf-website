import { PageHeader } from "@/components/layout/page-header";
import { site } from "@/content/site";
import { metadata } from "@/lib/seo";
export const generateMetadata = () =>
  metadata(
    "Website terms",
    "Terms for using the KCTF website: the status of the foundation and its proposed initiatives, enquiries, photographs and responsible use.",
    "/terms",
  );
export default function Terms() {
  return (
    <>
      <PageHeader
        eyebrow="Website terms"
        title="Clarity builds trust."
        trail={[{ name: "Website terms", path: "/terms" }]}
      >
        Please read these notes when using the foundation’s website.
      </PageHeader>
      <article className="container legal">
        <h2>Purpose of the website</h2>
        <p>
          This website introduces Kigezi Community Transformation Foundation and
          its proposed work. It provides general information and ways to contact
          the founder.
        </p>
        <h2>Organisational and project status</h2>
        <p>
          The supplied constitution is proposed and subject to adoption and
          registration. No registration number or completed registration is
          claimed. Programme descriptions describe intended focus areas. Project
          activities, targets and the £6,960 budget are proposals, rather than
          evidence of funding or achieved results.
        </p>
        <h2>Enquiries and participation</h2>
        <p>
          Submitting an enquiry does not confirm a volunteer placement,
          membership, partnership or grant. Any future arrangement requires
          direct discussion and appropriate confirmation. A donation enquiry is
          a conversation, not a payment or pledge. Where online giving is
          offered, one-time gifts are paid on the payment provider’s own page
          (Stripe for cards, Pesapal for Mobile Money) and count as received
          only once the provider confirms them. An acknowledgement confirms a
          payment received; it is not a tax receipt, and no tax relief is
          implied.
        </p>
        <h2>Information and boundaries</h2>
        <p>
          Content does not provide individual legal advice, wildlife emergency
          response or authority to conduct field operations. Wildlife handling,
          enforcement and protected-area work require the relevant lawful
          authority and permissions.
        </p>
        <h2>Photographs and ownership</h2>
        <p>
          Illustrative landscape and wildlife photographs are credited to their
          creators and used under the licences shown on the{" "}
          <a href="/credits">image credits page</a>. They are not evidence of
          KCTF activities or ownership of a site. KCTF branding remains the
          foundation’s identity.
        </p>
        <h2>Responsible use</h2>
        <p>
          Use enquiry channels respectfully. Do not submit unlawful content,
          malicious files, impersonations or unnecessary sensitive information.
        </p>
        <h2>Questions or corrections</h2>
        <p>
          Please contact <a href={`mailto:${site.email}`}>{site.email}</a> if
          you identify an error or need clarification about the foundation’s
          proposed work.
        </p>
      </article>
    </>
  );
}
