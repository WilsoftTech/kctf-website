"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="container not-found">
      <h1>Let’s try again.</h1>
      <p>
        This page couldn’t load. Your enquiry has not been submitted from this
        page.
      </p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
