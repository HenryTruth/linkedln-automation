"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth";

export function HeroCTA() {
  const { user, loading } = useAuth();

  if (loading) return <div className="h-10" />;

  if (user) {
    return (
      <div className="animate-fade-up mt-8 flex flex-wrap gap-3" style={{ animationDelay: "0.24s" }}>
        <Link href="/dashboard" className="btn-accent">Enter Dashboard</Link>
        <Link
          href="/campaigns/new"
          className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/[0.15]"
        >
          Create Campaign
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-up mt-8 flex flex-wrap gap-3" style={{ animationDelay: "0.24s" }}>
      <Link href="/signup" className="btn-accent">Get started free</Link>
      <Link href="/login"
        className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/[0.15]"
      >
        Sign in
      </Link>
    </div>
  );
}
