import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto w-full max-w-[390px] px-4 pt-12 pb-16">
      <h1 className="font-sign text-title text-balance">This page doesn’t exist.</h1>
      <div className="panel mt-6 p-4">
        <p>
          Check the address, or go back to{" "}
          <Link href="/" className="text-accent underline underline-offset-4 hover:decoration-2">
            Lapar Wheel
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
