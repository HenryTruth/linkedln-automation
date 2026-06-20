import Link from "next/link";

export default function NotFound() {
  return (
    <section className="app-panel mx-auto max-w-2xl p-8 text-center">
      <p className="page-kicker">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        Page not found.
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        The page you opened does not exist in this dashboard.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Go Home
      </Link>
    </section>
  );
}
