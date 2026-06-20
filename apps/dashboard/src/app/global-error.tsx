"use client";

import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <main className="grid min-h-screen place-items-center px-4">
          <section className="app-panel max-w-2xl p-8 text-center">
            <p className="page-kicker">Application error</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              The app needs a refresh.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {error.message || "Something interrupted the current page."}
            </p>
            <button onClick={reset} className="btn-primary mt-6">
              Try Again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
