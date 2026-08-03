"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth";

function isAdminUser(user: ReturnType<typeof useAuth>["user"]) {
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL?.toLowerCase();
  return Boolean(
    user &&
      (user.isAdmin ||
        (adminEmail && user.email.toLowerCase() === adminEmail))
  );
}

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isAdmin = isAdminUser(user);

  useEffect(() => {
    if (!loading && user && !isAdmin) {
      router.replace("/dashboard");
    }
  }, [user, loading, isAdmin, router]);

  if (loading || !user || !isAdmin) return null;
  return <>{children}</>;
}
