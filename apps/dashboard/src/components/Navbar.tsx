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
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/70 bg-white/[0.78] backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-3 whitespace-nowrap">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-sm font-black text-white shadow-sm">
              LA
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-tight text-slate-950">
                LinkedIn Auto
              </span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-teal-700">
                Outreach control
              </span>
            </span>
          </Link>

          {user ? (
            <div className="flex flex-wrap items-center gap-2">
              <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/70 p-1 shadow-sm">
                {links.map((l) => {
                  const active = pathname.startsWith(l.href);
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                        active
                          ? "bg-slate-950 text-white shadow-sm"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                      }`}
                    >
                      {l.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/70 px-3 py-2 shadow-sm">
                <span className="hidden text-xs font-medium text-slate-500 sm:block">
                  {user.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-950 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-950 transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="btn-primary"
              >
                Get started free
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
