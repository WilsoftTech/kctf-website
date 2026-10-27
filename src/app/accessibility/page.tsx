import { PageHeader } from "@/components/ui/primitives";
import { site } from "@/content/site";
import { metadata } from "@/lib/seo";
export const generateMetadata = () =>
  metadata(
    "Accessibility",
    "KCTF’s approach to accessible navigation, readable content, reduced motion and enquiry support.",
    "/accessibility",
  );
export default function Accessibility() {
  return (
    <>
      <PageHeader eyebrow="Accessibility" title="A website for more people.">
        We aim to make the foundation’s information readable, navigable and
        accessible.
      </PageHeader>
      <article className="container legal">
        <h2>Features included</h2>
        <ul>
          <li>
            Keyboard navigation, visible focus indicators and a skip-to-content
            link.
          </li>
          <li>
            A mobile menu with native modal focus management and Escape-to-close
            support.
          </li>
          <li>Text alternatives for photographs and meaningful links.</li>
          <li>Reduced-motion support for animations and scrolling.</li>
          <li>
            Responsive layouts, labelled form fields and readable validation
            messages.
          </li>
        </ul>
        <h2>Using the site</h2>
        <p>
          Use Tab to move between links and controls, Enter to activate them,
          and Escape to close open navigation. Your device’s reduced-motion
          preference disables animation. Browser zoom can be used to enlarge
          content.
        </p>
        <h2>Known limitations</h2>
        <p>
          Photography is illustrative. Enquiry forms require JavaScript for
          validation and spam protection; direct email and telephone links
          remain available without it. When enabled, anti-abuse verification
          depends on an external provider. Accessibility is an ongoing process;
          this statement is not a claim of certified compliance.
        </p>
        <h2>Tell us about a barrier</h2>
        <p>
          Email <a href={`mailto:${site.email}`}>{site.email}</a> or call{" "}
          <a href={`tel:${site.telephone}`}>{site.phone}</a>. Please describe
          the page and the difficulty you encountered.
        </p>
      </article>
    </>
  );
}
