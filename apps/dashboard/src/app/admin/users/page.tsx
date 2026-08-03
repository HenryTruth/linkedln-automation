"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type AdminUserSummary } from "@/lib/api";
import { AdminGuard } from "@/components/AdminGuard";
import { Badge } from "@/components/Badge";
import { Skeleton, SkeletonTableRows, SkeletonPageHeader } from "@/components/Skeleton";

function AdminUsersList() {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);

  function reload() {
    return api.admin.users.list().then(setUsers);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    const id = setInterval(() => {
      reload().catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading)
    return (
      <div className="space-y-6">
        <SkeletonPageHeader />
        <div className="table-shell">
          <table className="min-w-full">
            <tbody className="divide-y divide-white/[0.06]">
              <SkeletonTableRows cols={6} rows={6} />
            </tbody>
          </table>
        </div>
      </div>
    );

  return (
    <div className="space-y-8">
      <section className="app-panel p-6 lg:p-8">
        <p className="page-kicker">Back office</p>
        <h1 className="page-title mt-2">Users</h1>
        <p className="page-copy">
          Every signup across the product — {users.length} total.
        </p>
      </section>

      <div className="table-shell">
        <table className="min-w-full divide-y divide-white/[0.06]">
          <thead className="table-head">
            <tr>
              {["Email", "Plan", "Verified", "Suspended", "Accounts", "Campaigns", "Signed up"].map((h) => (
                <th key={h} className="px-6 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-white/[0.03]">
                <td className="table-cell font-medium text-white">
                  <Link href={`/admin/users/${u.id}`} className="text-teal-400 hover:underline">
                    {u.email}
                  </Link>
                </td>
                <td className="table-cell text-slate-400">{u.plan}</td>
                <td className="table-cell">
                  {u.emailVerifiedAt ? <Badge value="ACTIVE" /> : <Badge value="PENDING" />}
                </td>
                <td className="table-cell">
                  {u.suspendedAt ? <Badge value="RESTRICTED" /> : <span className="text-slate-500">—</span>}
                </td>
                <td className="table-cell text-slate-400">{u.accountCount}</td>
                <td className="table-cell text-slate-400">{u.campaignCount}</td>
                <td className="table-cell text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <AdminGuard>
      <AdminUsersList />
    </AdminGuard>
  );
}
