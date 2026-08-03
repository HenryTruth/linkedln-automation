"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth";

const PUBLIC_PATHS = ["/", "/login", "/signup", "/verify-email"];

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (!loading && !user && !isPublic) {
      const currentPath = `${pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(currentPath)}`);
    }
    if (!loading && user && (pathname === "/login" || pathname === "/signup")) {
      const params = new URLSearchParams(window.location.search);
      router.replace(safeNextPath(params.get("next")));
    }
  }, [user, loading, isPublic, pathname, router]);

  // Public pages render immediately — no auth gate needed.
  // Protected pages wait for the session check before rendering.
  if (loading && !isPublic) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!loading && !user && !isPublic) return null;

  return <>{children}</>;
}
