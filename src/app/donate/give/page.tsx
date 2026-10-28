import Image from "next/image";
import Link from "next/link";
import { content } from "@/content/repository";
import { photos } from "@/content/site";
import { Breadcrumbs } from "@/components/seo/structured-data";
import { Eyebrow } from "@/components/ui/primitives";
import { DonationForm } from "@/components/donate/donation-form";
import { GiveMotion } from "@/components/donate/give-motion";
import { metadata } from "@/lib/seo";
import { paymentsConfig, publicPaymentOptions } from "@/server/payments/config";
// Online giving. Methods, currencies and test/live mode are runtime configuration, so the
// page renders per request. Only availability reaches the browser, never keys.
export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const { seo } = await content.getGivePage();
  return metadata(seo.title, seo.description, "/donate/give");
}
export default async function Give() {
  const page = await content.getGivePage();
  const photo = photos[page.photo];
  const options = publicPaymentOptions(paymentsConfig());
  return (
    <GiveMotion>
      <section className="give-intro dark" aria-labelledby="give-heading">
        <div className="give-media" data-give-media>
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            preload
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="give-shade" aria-hidden="true" />
        <div className="give-intro-content">
          <Breadcrumbs
            trail={[
              { name: "Donate", path: "/donate" },
              { name: "Give online", path: "/donate/give" },
            ]}
            className="breadcrumbs hero-breadcrumbs"
          />
          <Eyebrow>{page.eyebrow}</Eyebrow>
          <h1 id="give-heading">
            {page.headline.map((line, i) => (
              <span className="hero-line" key={line}>
                <span style={{ animationDelay: `${i * 140 + 120}ms` }}>
                  {line}{" "}
                </span>
              </span>
            ))}
          </h1>
          <p className="give-lead">{page.body}</p>
          <ul className="give-trust">
            {page.trust.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="give-credit">
            {page.photoNote} {photo.caption} ·{" "}
            <a href={photo.source}>{photo.author}</a> ·{" "}
            <a href={photo.licenseUrl}>{photo.license}</a> ·{" "}
            <Link href="/credits">All credits</Link>
          </p>
        </div>
      </section>
      <section className="give-panel" aria-label="Donation form">
        <div className="give-panel-inner" data-give-stagger>
          <DonationForm
            options={{
              test: options.mode === "test",
              turnstileSiteKey: options.turnstileSiteKey,
              methods: options.methods,
            }}
          />
        </div>
      </section>
    </GiveMotion>
  );
}
