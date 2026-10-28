import { PageHeader } from "@/components/layout/page-header";
import { site } from "@/content/site";
import { PRIVACY_NOTICE_VERSION } from "@/content/privacy";
import { enquiryConfig, readRetentionConfig } from "@/server/config";
import { metadata } from "@/lib/seo";
export const dynamic = "force-dynamic";
export const generateMetadata = () =>
  metadata(
    "Privacy notice",
    "How the KCTF website handles enquiries, stored records, email delivery, spam protection, the optional Google map and your privacy choices.",
    "/privacy",
  );
export default function Privacy() {
  const enquiries = enquiryConfig();
  const { mode } = enquiries;
  const drafts = mode === "email-draft" && !!enquiries.drafts;
  const retention = readRetentionConfig();
  const retentionDays =
    retention.approved && retention.days ? retention.days : undefined;
  return (
    <>
      <PageHeader
        eyebrow="Privacy"
        title="Your information. Handled with care."
        trail={[{ name: "Privacy notice", path: "/privacy" }]}
      >
        How this website handles your visit and enquiries.
      </PageHeader>
      <article className="container legal">
        <p>
          This notice covers the Kigezi Community Transformation Foundation
          website. Contact <a href={`mailto:${site.email}`}>{site.email}</a>{" "}
          with questions about your information. Notice version{" "}
          {PRIVACY_NOTICE_VERSION}.
        </p>
        <h2>Current status of the enquiry form</h2>
        <p>
          {mode === "online"
            ? "Online enquiries are active. Submitted enquiries are stored and forwarded to the foundation as described below."
            : drafts
              ? "Online submission is not active. The form checks your details in your browser, saves a copy of them on this website and opens a draft in your own email app. You choose whether to send the email; the copy is kept either way, as described below, and no notification is sent from this website."
              : mode === "email-draft"
                ? "Online submission is not active. The form checks your details in your browser and opens a draft in your own email app. You choose whether to send it. Nothing is stored by this website in this mode."
                : "Online submission is temporarily unavailable. Nothing can be submitted through the form; please email the foundation directly."}
        </p>
        <h2>What an online enquiry collects</h2>
        <p>
          Your name, email address, enquiry topic, message, the time of
          submission, whether it was sent online or prepared as an email draft,
          and confirmation that you read this notice (with its version). A
          one-time form key is kept so that a retried submission is not saved
          twice.
        </p>
        <p>
          Please provide only the details needed for your question. Do not
          include identity documents, health information, sensitive case details
          or information about children.
        </p>
        <p>
          Donation enquiries, sent from the donate or contact page, are handled
          in the same way as other enquiries. The website does not process
          payments and never asks for card, bank or mobile-money details, so
          please do not include them.
        </p>
        <h2>Why information is used</h2>
        <p>
          The foundation uses enquiries to respond to questions and discuss
          volunteering, partnerships, donations or proposed work. An enquiry
          does not create a membership, placement, donation, pledge, funding
          commitment or formal partnership.
        </p>
        <h2>Where it is stored and who processes it</h2>
        <ul>
          <li>
            <strong>Neon</strong> hosts the website’s PostgreSQL database, where
            each online enquiry is saved together with a record of its email
            notification. A copy kept when you prepare an email draft has no
            notification record.
          </li>
          <li>
            <strong>Resend</strong> delivers a notification containing your
            enquiry to the foundation’s staff inbox. Your email address is set
            as the reply-to address so staff can answer you. Resend keeps
            delivery records under its own terms.
          </li>
          <li>
            <strong>Cloudflare Turnstile</strong> checks submissions for
            automated abuse and may process technical information about your
            device and interaction.
          </li>
          <li>
            The foundation’s <strong>email provider</strong> holds the
            notification and any reply in the staff inbox.
          </li>
        </ul>
        <p>
          These providers may process information outside Uganda. The website
          does not sell your information or use it for advertising.
        </p>
        <h2>Access</h2>
        <p>
          Enquiries are available to foundation staff responsible for responding
          and to people who administer the website and its database. Service
          providers process information only to provide their services.
        </p>
        <h2>Spam protection and technical records</h2>
        <p>
          To limit abuse, the website keeps short-lived counters derived from
          your network address and email address using a keyed, one-way
          function. The addresses themselves are not stored in these counters,
          which are deleted within hours. Application logs record events and
          reference numbers, not the content of your enquiry, your email address
          or your network address. The hosting provider may separately process
          ordinary request information such as IP addresses, request times and
          technical errors for delivery and security.
        </p>
        <h2>How long information is kept</h2>
        <p>
          {retentionDays
            ? `Stored enquiries are deleted ${retentionDays} days after they were received, unless they must be kept longer to deal with an ongoing matter or a legal obligation.`
            : "A retention period for stored enquiries has not yet been approved by the foundation. Online submission will not be activated until it has, and this notice will then state the period."}{" "}
          Copies in the staff inbox, provider delivery records and database
          backups follow their own schedules and may persist for a limited time
          after a stored enquiry is deleted.
        </p>
        <h2>Your choices and requests</h2>
        <p>
          You can contact the foundation directly instead of using the form, or
          leave the website without submitting anything. To ask for access to,
          correction of or deletion of your enquiry, email{" "}
          <a href={`mailto:${site.email}`}>{site.email}</a> and include your
          enquiry reference if you have one. Do not send sensitive documents to
          verify a request unless the foundation explains a suitable process.
          Records that must be retained for applicable obligations may need
          different handling.
        </p>
        <h2>Cookies</h2>
        <p>
          The website uses locally hosted fonts and photographs and does not
          install advertising or analytics trackers. When online enquiries are
          active, Cloudflare Turnstile runs on the contact and donate pages
          under its own privacy terms. Google may set cookies if you choose to
          load the optional map described below.
        </p>
        <h2 id="map">Optional Google map</h2>
        <p>
          The contact page can show a Google map of the foundation’s area. It is
          not loaded automatically: nothing is requested from Google until you
          select “Load Google map”. When you do, your browser connects directly
          to Google, which receives your IP address, the page you came from (the
          website address only) and technical information about your device, and
          may set or read cookies. Google handles this under its own privacy
          policy, and the foundation does not receive or store it. The map shows
          an approximate area found by searching for the address, not a
          confirmed office location.
        </p>
        <p>
          You do not need the map to contact the foundation. The written
          address, email and telephone details remain on the contact page, and
          the “Open in Google Maps” and “Get directions” links take you to
          Google only if you follow them.
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
