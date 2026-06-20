"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="app-panel mx-auto max-w-2xl p-8 text-center">
      <p className="page-kicker">Something paused</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        This page could not load.
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        {error.message || "Refresh the page or try again in a moment."}
      </p>
      <button onClick={reset} className="btn-primary mt-6">
        Try Again
      </button>
    </section>
  );
}
