import Link from "next/link";
import { Hero } from "@/components/sections/hero";
import { ProgramExplorer } from "@/components/sections/program-explorer";
import { StoryScroller } from "@/components/sections/story-scroller";
import {
  Arrow,
  Button,
  CTA,
  DonateButton,
  Eyebrow,
  Heading,
  Photo,
} from "@/components/ui/primitives";
import { targets } from "@/content/site";
import { homeDonation } from "@/content/donate";
import { metadata } from "@/lib/seo";
export const generateMetadata = () =>
  metadata(
    { absolute: "Kigezi Community Transformation Foundation (KCTF) | Uganda" },
    "KCTF is a community-led foundation in Rukungiri, Uganda, at its planning stage, connecting wildlife conservation, environment, climate and human rights.",
    "/",
  );
export default function Home() {
  return (
    <>
      <Hero
        carousel
        title="Protecting nature.|Empowering people."
        description="Together, we can build a future where communities, wildlife and the landscapes we call home thrive."
      />
      <section id="introduction" className="section dark intro">
        <div className="container" data-reveal>
          <Eyebrow>A shared future begins here</Eyebrow>
          <h2>
            Healthy landscapes.
            <br />
            Resilient communities.
            <br />
            <em>Lasting transformation.</em>
          </h2>
          <div className="intro-bottom">
            <p>
              We are Kigezi Community Transformation Foundation. Rooted in
              Rukungiri, Uganda, our purpose connects the wellbeing of people
              with the wellbeing of the natural world.
            </p>
            <Link href="/about" className="text-link">
              Meet the foundation <Arrow diagonal />
            </Link>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="heading-row" data-reveal>
            <Heading eyebrow="Our focus" title="Four pillars. One future." />
            <Link href="/programmes" className="text-link">
              All programmes <Arrow diagonal />
            </Link>
          </div>
          <ProgramExplorer />
        </div>
      </section>
      <section className="section muted-surface">
        <div className="container">
          <Heading
            eyebrow="Our home, our responsibility"
            title="The places that shape us."
          >
            From green highlands to shared wildlife landscapes, a thriving
            future starts with the connections between land and life.
          </Heading>
          <StoryScroller />
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="heading-row">
            <Heading
              eyebrow="Featured initiative"
              title="Living alongside lions."
            />
            <span className="status">Proposed programme</span>
          </div>
          <div className="split project-feature" data-reveal>
            <Photo photo="lion" />
            <div>
              <Eyebrow>Community Lion Conservation</Eyebrow>
              <h3>
                Coexistence begins
                <br />
                with understanding.
              </h3>
              <p>
                A proposed 12-month initiative bringing residents and local
                leaders together through conservation education, community
                dialogue and safe incident reporting.
              </p>
              <p className="small muted">
                Activities depend on funding, confirmed locations and relevant
                approvals.
              </p>
              <Button href="/projects/community-lion-conservation">
                Explore the initiative
              </Button>
            </div>
          </div>
          <div className="target-heading">
            Planned targets · Not completed results
          </div>
          <div className="targets">
            {targets.map((t) => (
              <div key={t.label}>
                <strong>{t.value}</strong>
                <span>{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="presence dark">
        <div className="container split">
          <div data-reveal>
            <Eyebrow>Rooted in community</Eyebrow>
            <h2>
              Beginning in Bunura.
              <br />
              <em>Looking to tomorrow.</em>
            </h2>
            <p>
              Our proposed starting point is Bunura Cell, Rwakabengo Ward, in
              Rukungiri Municipality. The scope of activities will follow the
              geographical area authorised at registration.
            </p>
            <Link href="/about#our-home" className="text-link">
              Where we begin <Arrow diagonal />
            </Link>
          </div>
          <div className="place-panel">
            <span className="location-dot" aria-hidden="true" />
            <span>Uganda / South-western region</span>
            <h3>Rukungiri</h3>
            <p>
              Bunura Cell
              <br />
              Rwakabengo Ward
              <br />
              Southern Division
            </p>
            <span className="coordinates">People. Place. Possibility.</span>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container split" data-reveal>
          <Photo photo="forest" />
          <div>
            <Heading
              eyebrow="Conservation education"
              title="Knowledge that grows with a community."
            />
            <p>
              Our approach starts with listening. Household conversations,
              village dialogues and radio discussions are proposed ways to make
              conservation learning practical and accessible.
            </p>
            <Link
              href="/projects/community-lion-conservation#approach"
              className="text-link"
            >
              Our proposed approach <Arrow diagonal />
            </Link>
          </div>
        </div>
      </section>
      <section className="section muted-surface">
        <div className="container split reverse" data-reveal>
          <div>
            <Heading
              eyebrow="Community participation"
              title="Every voice belongs in the conversation."
            />
            <p>
              Women, young people, livestock keepers and trusted elders bring
              different knowledge to shared challenges. We aim to create space
              for meaningful participation and respectful dialogue.
            </p>
            <Link href="/programmes#justice" className="text-link">
              Justice & human rights <Arrow diagonal />
            </Link>
          </div>
          <Photo photo="culture" />
        </div>
      </section>
      <section className="full-image dark">
        <Photo photo="culture" />
        <div className="container">
          <Eyebrow>People and nature, together</Eyebrow>
          <h2>
            Care for the land.
            <br />
            <em>Care for each other.</em>
          </h2>
          <Link href="/programmes" className="text-link">
            Explore our purpose <Arrow diagonal />
          </Link>
        </div>
      </section>
      <section className="section dark involved">
        <div className="container">
          <Heading
            eyebrow="Get involved"
            title="Your part in a shared future."
          />
          <div className="action-panels">
            {[
              {
                n: "01",
                title: "Bring your time.",
                body: "Express an interest in future volunteer opportunities and community learning.",
                href: "/get-involved#volunteer",
                label: "Explore volunteering",
              },
              {
                n: "02",
                title: "Bring your perspective.",
                body: "Start a conversation about conservation, education or community partnerships.",
                href: "/get-involved#partner",
                label: "Partner with us",
              },
            ].map((p) => (
              <Link href={p.href} className="action-panel" key={p.n}>
                <span className="index">{p.n}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
                <span className="text-link">
                  {p.label}
                  <Arrow diagonal />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section
        className="section muted-surface home-donate"
        aria-labelledby="home-donate"
      >
        <div className="container split reverse" data-reveal>
          <div>
            <Heading
              id="home-donate"
              eyebrow={homeDonation.eyebrow}
              title={homeDonation.title}
            />
            <p>{homeDonation.body}</p>
            <div className="actions">
              <DonateButton label="Donate" />
              <Link href="/donate#give" className="text-link">
                Discuss a donation <Arrow diagonal />
              </Link>
            </div>
            <p className="small muted">{homeDonation.note}</p>
          </div>
          <Photo photo={homeDonation.photo} />
        </div>
      </section>
      <section className="section">
        <div className="container">
          <Heading
            eyebrow="From the foundation"
            title="The next chapter is taking shape."
          />
          <div className="update-row">
            <span className="status">Planning stage</span>
            <div>
              <h3>A community-led vision for Kigezi</h3>
              <p>
                Our founding documents set out a connected purpose for wildlife,
                environment, climate and human rights. Future updates will
                follow as plans develop.
              </p>
            </div>
            <Link href="/about" className="text-link">
              Our story <Arrow diagonal />
            </Link>
          </div>
        </div>
      </section>
      <CTA />
    </>
  );
}
