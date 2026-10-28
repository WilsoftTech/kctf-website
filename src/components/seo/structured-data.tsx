// Server components that render JSON-LD. Kept apart from components/ui/primitives.tsx,
// which client components also import, so the site configuration stays server-side.
import Link from "next/link";
import { breadcrumbList, jsonLd, type Crumb } from "@/lib/seo";

export function JsonLd({ graph }: { graph: object | object[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd(graph) }}
    />
  );
}

/**
 * Visible breadcrumb trail and its BreadcrumbList structured data, built from one list so
 * they cannot disagree. The first crumb is always Home; the last is the current page.
 */
export function Breadcrumbs({
  trail,
  className = "breadcrumbs",
}: {
  trail: readonly Crumb[];
  className?: string;
}) {
  const crumbs: Crumb[] = [{ name: "Home", path: "/" }, ...trail];
  return (
    <>
      <nav aria-label="Breadcrumb" className={className}>
        <ol>
          {crumbs.map((crumb, i) => (
            <li key={crumb.path}>
              {i === crumbs.length - 1 ? (
                <span aria-current="page">{crumb.name}</span>
              ) : (
                <>
                  <Link href={crumb.path}>{crumb.name}</Link>
                  <span aria-hidden="true">/</span>
                </>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd graph={breadcrumbList(crumbs)} />
    </>
  );
}
