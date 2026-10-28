import Image from "next/image";
import Link from "next/link";
import { navigation, site } from "@/content/site";
import { Heart } from "@/components/ui/primitives";
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link href="/" className="footer-brand">
              <Image
                src="/brand/kctf-logo.png"
                alt={site.name}
                width={220}
                height={110}
                sizes="220px"
              />
            </Link>
            <p>People. Nature. A shared future.</p>
            <p className="muted">
              A community-led foundation taking shape in Rukungiri, Uganda.
            </p>
          </div>
          <div>
            <h2>Explore</h2>
            <nav aria-label="Footer navigation">
              {navigation.slice(1).map((n) => (
                <Link key={n.href} href={n.href}>
                  {n.label}
                </Link>
              ))}
              <Link href="/donate/give" className="footer-donate">
                <Heart />
                Donate
              </Link>
            </nav>
          </div>
          <div className="footer-contact">
            <h2>Find us in Kigezi</h2>
            <address>
              {site.address}
              <a href={`tel:${site.telephone}`}>{site.phone}</a>
              <a href={`mailto:${site.email}`}>{site.email}</a>
            </address>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} KCTF</span>
          <nav aria-label="Legal navigation">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/accessibility">Accessibility</Link>
            <Link href="/credits">Image credits</Link>
          </nav>
          <span>Rooted in community.</span>
        </div>
      </div>
    </footer>
  );
}
