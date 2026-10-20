import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 pt-12 pb-16 md:px-6 md:pt-16">
      <h1 className="condensed text-display text-balance">This page doesn’t exist.</h1>
      <div className="mt-6 max-w-prose rounded-sm border border-label-edge bg-surface-label p-4 shadow-label md:p-6">
        <p>
          Check the address, or go back to{" "}
          <Link href="/" className="text-stamp underline underline-offset-4 hover:decoration-2">
            Lapar Wheel
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
