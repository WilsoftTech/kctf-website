"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { navigation, programmes } from "@/content/site";
import { Arrow } from "@/components/ui/primitives";
export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = useCallback(
    (value: boolean) => setOpenOn(value ? pathname : null),
    [pathname],
  );
  const [mobile, setMobile] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement>(null);
  const hero = pathname === "/" || pathname.startsWith("/projects/");
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 40);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, setOpen]);
  useEffect(() => {
    if (!mobile) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const mq = window.matchMedia("(min-width:1280px)");
    const resize = () => {
      if (mq.matches) {
        dialog.current?.close();
        setMobile(false);
      }
    };
    mq.addEventListener("change", resize);
    return () => {
      document.body.style.overflow = old;
      mq.removeEventListener("change", resize);
    };
  }, [mobile]);
  const closeMobile = () => {
    dialog.current?.close();
    setMobile(false);
  };
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <header
        ref={root}
        className={`site-header ${!hero || scrolled || open ? "solid" : ""}`}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            setOpen(false);
            trigger.current?.focus();
          }
        }}
      >
        <div className="header-container">
          <Link href="/" className="brand" aria-label="KCTF — Home">
            <Image
              src="/brand/kctf-logo.png"
              alt="Kigezi Community Transformation Foundation"
              width={1774}
              height={887}
              priority
            />
          </Link>
          <nav
            className="desktop-nav"
            aria-label="Main navigation"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
            }}
          >
            {navigation.map((item) =>
              item.href === "/programmes" ? (
                <div className="nav-group" key={item.href}>
                  <button
                    ref={trigger}
                    type="button"
                    aria-expanded={open}
                    aria-controls={open ? "programmes-menu" : undefined}
                    onClick={() => setOpen(!open)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setOpen(true);
                        requestAnimationFrame(() =>
                          document
                            .querySelector<HTMLAnchorElement>(
                              "#programmes-menu a",
                            )
                            ?.focus(),
                        );
                      }
                    }}
                    className={pathname.startsWith(item.href) ? "active" : ""}
                  >
                    {item.label}
                    <span className="chevron" aria-hidden="true">
                      ⌄
                    </span>
                  </button>
                  {open && (
                    <div id="programmes-menu" className="mega-menu">
                      <div className="container mega-grid">
                        <div>
                          <p className="eyebrow">Four connected pillars</p>
                          <h2>
                            A shared future.
                            <br />A common purpose.
                          </h2>
                          <Link
                            href="/programmes"
                            onClick={() => setOpen(false)}
                            className="text-link"
                          >
                            Explore all programmes <Arrow />
                          </Link>
                        </div>
                        <div className="mega-links">
                          {programmes.map((p, i) => (
                            <Link
                              href={`/programmes#${p.id}`}
                              key={p.id}
                              onClick={() => setOpen(false)}
                            >
                              <span className="index">0{i + 1}</span>
                              <span>
                                <strong>{p.name}</strong>
                                <small>{p.summary}</small>
                              </span>
                              <Arrow diagonal />
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  className={pathname === item.href ? "active" : ""}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
          <Link href="/get-involved" className="header-action">
            Let’s connect <Arrow diagonal />
          </Link>
          <button
            className="menu-toggle"
            onClick={() => {
              dialog.current?.showModal();
              setMobile(true);
            }}
            aria-label="Open menu"
            aria-expanded={mobile}
            aria-controls="mobile-menu"
          >
            <span>Menu</span>
            <span aria-hidden="true">☰</span>
          </button>
        </div>
      </header>
      <dialog
        ref={dialog}
        id="mobile-menu"
        className="mobile-menu"
        aria-label="Main navigation"
        onClose={() => {
          setMobile(false);
          document.querySelector<HTMLButtonElement>(".menu-toggle")?.focus();
        }}
      >
        <div className="mobile-top">
          <span>KCTF / Explore</span>
          <button onClick={closeMobile} aria-label="Close menu">
            ✕
          </button>
        </div>
        <nav aria-label="Mobile navigation">
          {navigation.map((n, i) => (
            <Link
              href={n.href}
              key={n.href}
              onClick={closeMobile}
              aria-current={pathname === n.href ? "page" : undefined}
            >
              <span className="index">0{i + 1}</span>
              {n.label}
              <Arrow />
            </Link>
          ))}
        </nav>
        <p>
          Rooted in Kigezi.
          <br />
          Working for tomorrow.
        </p>
        <Link href="/contact" onClick={closeMobile} className="text-link">
          Talk to the foundation <Arrow />
        </Link>
      </dialog>
    </>
  );
}
