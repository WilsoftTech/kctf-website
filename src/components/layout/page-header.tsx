import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/primitives";
import { Breadcrumbs } from "@/components/seo/structured-data";
import type { Crumb } from "@/lib/seo";
export function PageHeader({
  eyebrow,
  title,
  trail,
  children,
}: {
  eyebrow: string;
  title: string;
  /** Breadcrumbs after Home, ending with the current page. */
  trail: readonly Crumb[];
  children: ReactNode;
}) {
  return (
    <section className="page-header container">
      <Breadcrumbs trail={trail} />
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1>{title}</h1>
      <p className="lead">{children}</p>
    </section>
  );
}
