"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initAnalytics, trackPageview } from "@/lib/analytics";

function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    trackPageview(`${window.location.origin}${pathname}${query ? `?${query}` : ""}`);
  }, [pathname, searchParams]);

  return null;
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      {children}
    </>
  );
}
