import { Button } from "@/components/ui/primitives";
export default function NotFound() {
  return (
    <section className="container not-found">
      <p className="eyebrow">Page not found</p>
      <h1>A different path.</h1>
      <p>We couldn’t find that page. Explore the foundation from home.</p>
      <Button href="/">Back to home</Button>
    </section>
  );
}
