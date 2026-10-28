import Link from "next/link";
import { Button } from "@/components/ui/primitives";
import { navigation } from "@/content/site";
// Next.js responds with HTTP 404 and adds `noindex` to this page.
export default function NotFound() {
  return (
    <section className="container not-found">
      <p className="eyebrow">Page not found</p>
      <h1>A different path.</h1>
      <p>
        We couldn’t find that page. It may have moved, or the address may be
        mistyped.
      </p>
      <Button href="/">Back to home</Button>
      <nav aria-label="Main pages" className="not-found-links">
        {navigation.slice(1).map((n) => (
          <Link key={n.href} href={n.href} className="text-link">
            {n.label}
          </Link>
        ))}
        <Link href="/donate" className="text-link">
          Donate
        </Link>
      </nav>
    </section>
  );
}
