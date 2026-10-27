import { PageHeader } from "@/components/ui/primitives";
import { site } from "@/content/site";
import { enquiriesEnabled } from "@/lib/enquiries";
import { metadata } from "@/lib/seo";
export const dynamic = "force-dynamic";
export const generateMetadata = () =>
  metadata(
    "Privacy notice",
    "How KCTF’s website handles enquiries, email drafts, technical requests and your privacy choices.",
    "/privacy",
  );
export default function Privacy() {
  const live = enquiriesEnabled();
  return (
    <>
      <PageHeader
        eyebrow="Privacy"
        title="Your information. Handled with care."
      >
        How this website handles your visit and enquiries.
      </PageHeader>
      <article className="container legal">
        <p>
          This notice covers the Kigezi Community Transformation Foundation
          website. Contact <a href={`mailto:${site.email}`}>{site.email}</a>{" "}
          with questions about your information.
        </p>
        <h2>Enquiries</h2>
        <p>
          {live
            ? "The enquiry form collects your name, email address, enquiry topic, message and acknowledgement of this notice. Submitted details are forwarded to the foundation’s enquiry inbox using Resend."
            : "Website email delivery is currently inactive. The enquiry form validates your details in your browser and opens a draft in your email app. You choose whether to send it. No form details are submitted to the website’s enquiry endpoint in this mode."}
        </p>
        <p>
          Please provide only the details needed for your question. Do not
          include identity documents, health information, sensitive case details
          or information about children.
        </p>
        <h2>Why information is used</h2>
        <p>
          The foundation uses enquiries to respond to questions and discuss
          volunteering, partnerships or proposed work. An enquiry does not
          create a membership, placement, funding commitment or formal
          partnership.
        </p>
        <h2>Delivery and service providers</h2>
        <p>
          {live
            ? "Cloudflare Turnstile checks form submissions for automated abuse. It may process technical information about your device and interaction. Resend processes the enquiry to deliver an email to the foundation. The receiving email provider processes the message in the foundation’s inbox."
            : "If you send the prepared email, your email provider and the foundation’s receiving email provider process the message. Cloudflare Turnstile and Resend are not loaded for the inactive form."}
        </p>
        <h2>Storage and retention</h2>
        <p>
          The website has no enquiry database or user accounts. When direct web
          delivery is active, the server processes form details to send email
          and does not intentionally log message contents. Delivered
          correspondence is held in the foundation’s email inbox.
        </p>
        <p>
          A fixed inbox retention period has not yet been published. You can
          request deletion of correspondence by contacting the foundation.
          Records that must be retained for applicable obligations may need
          different handling.
        </p>
        <h2>Technical requests and cookies</h2>
        <p>
          The website uses locally hosted fonts and photographs and does not
          install advertising or analytics trackers. Its hosting provider may
          process ordinary request information such as IP addresses, request
          times and technical errors for delivery and security. When enabled,
          anti-abuse verification may process additional technical data under
          the provider’s privacy terms.
        </p>
        <h2>Your choices</h2>
        <p>
          You can contact the foundation directly, leave the website without
          submitting anything, or ask about access, correction or deletion of
          enquiry information. Do not send sensitive documents to verify a
          request unless the foundation explains a suitable process.
        </p>
        <h2>External links</h2>
        <p>
          Photo credits and licence links lead to other websites with their own
          privacy practices. Visiting those links is optional.
        </p>
      </article>
    </>
  );
}
