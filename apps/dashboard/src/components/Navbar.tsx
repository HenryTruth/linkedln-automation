"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/campaigns", label: "Campaigns" },
  { href: "/leads", label: "Leads" },
  { href: "/accounts", label: "Accounts" },
  { href: "/proxies", label: "Proxies" },
  { href: "/checkpoints", label: "Checkpoints" },
  { href: "/rate-limits", label: "Rate Limits" },
  { href: "/jobs", label: "Jobs" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-3 whitespace-nowrap">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-blue-600 text-sm font-black text-white shadow-sm">
              V
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight text-white">
                Vectra
              </span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-teal-400">
                Outreach control
              </span>
            </span>
          </Link>

          {user ? (
            <div className="flex flex-wrap items-center gap-2">
              <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-white/[0.07] bg-slate-900/70 p-1">
                {links.map((l) => {
                  const active = pathname.startsWith(l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                        active
                          ? "bg-white/10 text-white"
                          : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      {l.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-slate-900/70 px-3 py-2">
                <span className="hidden text-xs font-medium text-slate-500 sm:block">
                  {user.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-xs font-semibold text-slate-500 transition-colors hover:text-white"
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : loading ? null : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                Sign in
              </Link>
              <Link href="/signup" className="btn-accent">
                Get started free
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
