// Experimental /llms.txt (https://llmstxt.org): a plain-Markdown guide to the site's
// canonical pages for AI tools. It is NOT a web standard, search engines do not require
// it, and it does not guarantee inclusion in any AI answer (see docs/SEO.md). It repeats
// only public, published content and is served only where the site is indexable.
import { aboutQuestions, programmes, site } from "@/content/site";
import { content } from "@/content/repository";
import { absoluteUrl, indexable } from "@/lib/seo";

export const dynamic = "force-static";

const notes: Record<string, string> = {
  "/about":
    "Mission, vision, founder, location, proposed governance and registration status",
  "/programmes": `The four intended focus areas: ${programmes.map((p) => p.name).join(", ")}`,
  "/projects": "Projects and their status",
  "/projects/community-lion-conservation":
    "Proposed 12-month initiative (planning stage): approach, planned outputs, indicative budget and boundaries",
  "/get-involved": "Volunteering interest and partnership conversations",
  "/donate":
    "How to enquire about donating. Online giving is not available; no payments are taken",
  "/contact": "Email, telephone, address and enquiry form",
  "/privacy": "Privacy notice",
  "/terms": "Website terms, including the status of the foundation",
  "/accessibility": "Accessibility statement",
  "/credits": "Photograph sources and licences",
};

export async function GET() {
  if (!indexable) return new Response("Not found", { status: 404 });
  const routes = (await content.getPublicRoutes()).filter(
    (r) => r.path !== "/",
  );
  const main = routes.filter(
    (r) =>
      !["/privacy", "/terms", "/accessibility", "/credits"].includes(r.path),
  );
  const optional = routes.filter((r) => !main.includes(r));
  const link = (r: (typeof routes)[number]) =>
    `- [${r.title}](${absoluteUrl(r.path)})${notes[r.path] ? `: ${notes[r.path]}` : ""}`;
  const body = [
    `# ${site.name} (${site.shortName})`,
    "",
    `> ${site.summary}`,
    "",
    "Key facts, as stated on this website:",
    "",
    ...aboutQuestions.map(([q, a]) => `- ${q} ${a}`),
    `- Contact: ${site.email}, ${site.phone}. Address: ${site.address}.`,
    "- Programme activities, project targets and the budget are proposals, not completed work. Photographs illustrate western Uganda and do not document KCTF activities.",
    "",
    "## Pages",
    "",
    ...main.map(link),
    "",
    "## Optional",
    "",
    ...optional.map(link),
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // A summary of pages that are indexed themselves; keep it out of search results.
      "x-robots-tag": "noindex",
    },
  });
}
