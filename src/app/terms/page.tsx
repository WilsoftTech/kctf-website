import { PageHeader } from "@/components/ui/primitives";
import { site } from "@/content/site";
import { metadata } from "@/lib/seo";
export const generateMetadata = () =>
  metadata(
    "Website terms",
    "Information about KCTF’s website, proposed initiatives, content and responsible use.",
    "/terms",
  );
export default function Terms() {
  return (
    <>
      <PageHeader eyebrow="Website terms" title="Clarity builds trust.">
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
          direct discussion and appropriate confirmation. The website does not
          accept online donations.
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
