import type { Metadata } from "next";
import Link from "next/link";
import { DonationStatusView } from "@/components/donate/donation-status";
import { Eyebrow } from "@/components/ui/primitives";
import { accessTokenSchema } from "@/validation/donation";
// Where the payment providers send donors back. The page shows only what the server has
// confirmed with the provider. It is private to the link holder: not indexed, and the
// token is never sent to other sites as a referrer.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Donation status",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function DonationStatus({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; cancelled?: string }>;
}) {
  const { token, cancelled } = await searchParams;
  const valid = accessTokenSchema.safeParse(token);
  return (
    <section className="section-sm give-status">
      <div className="container give-status-inner">
        <Eyebrow>Your donation</Eyebrow>
        {valid.success ? (
          <DonationStatusView
            token={valid.data}
            cameBackCancelled={cancelled === "1"}
          />
        ) : (
          <div className="form-card status-panel failed">
            <h2>This link is not complete.</h2>
            <p>
              Please use the full link from the payment page. If you made a
              payment, the provider’s email confirms it.
            </p>
            <div className="actions">
              <Link className="button" href="/donate/give">
                Go to the donation page
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
