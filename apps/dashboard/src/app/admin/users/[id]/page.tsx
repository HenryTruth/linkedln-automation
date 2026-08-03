"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type AdminUserDetail } from "@/lib/api";
import { AdminGuard } from "@/components/AdminGuard";
import { Badge } from "@/components/Badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Skeleton, SkeletonTableRows } from "@/components/Skeleton";
import { toast } from "sonner";

function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function reload() {
    return api.admin.users
      .get(id)
      .then(setUser)
      .catch((e: Error) => setError(e.message));
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [id]);

  async function handleResendVerification() {
    setBusy(true);
    try {
      await api.admin.users.resendVerification(id);
      toast.success("Verification email sent");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSuspendToggle() {
    if (!user) return;
    setBusy(true);
    try {
      const updated = user.suspendedAt
        ? await api.admin.users.unsuspend(id)
        : await api.admin.users.suspend(id);
      setUser((prev) => prev && { ...prev, suspendedAt: updated.suspendedAt });
      toast.success(user.suspendedAt ? "User unsuspended" : "User suspended");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await api.admin.users.remove(id);
      toast.success("User deleted");
      router.push("/admin/users");
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (loading)
    return (
      <div className="space-y-6">
        <div className="app-panel p-6 lg:p-8 space-y-4">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="table-shell">
          <table className="min-w-full">
            <tbody className="divide-y divide-white/[0.06]">
              <SkeletonTableRows cols={4} rows={3} />
            </tbody>
          </table>
        </div>
      </div>
    );
  if (error || !user)
    return <p className="text-sm text-red-400">{error ?? "User not found"}</p>;

  return (
    <div className="space-y-8">
      <section className="app-panel p-6 lg:p-8">
        <button
          onClick={() => router.push("/admin/users")}
          className="mb-4 text-sm font-semibold text-slate-400 hover:text-white"
        >
          Back to Users
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{user.email}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge value={user.plan} />
              {user.emailVerifiedAt ? <Badge value="ACTIVE" /> : <Badge value="PENDING" />}
              {user.suspendedAt && <Badge value="RESTRICTED" />}
            </div>
            <p className="mt-3 text-sm text-slate-400">
              Signed up {new Date(user.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!user.emailVerifiedAt && (
              <button onClick={handleResendVerification} disabled={busy} className="btn-secondary">
                {busy ? "Working…" : "Resend verification"}
              </button>
            )}
            <button
              onClick={handleSuspendToggle}
              disabled={busy}
              className={user.suspendedAt ? "btn-secondary text-emerald-400" : "btn-secondary text-amber-400"}
            >
              {busy ? "Working…" : user.suspendedAt ? "Unsuspend" : "Suspend"}
            </button>
            <button onClick={() => setConfirmDelete(true)} disabled={busy} className="btn-danger">
              Delete user
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-white">LinkedIn accounts</h2>
        {user.accounts.length === 0 ? (
          <div className="app-panel border-dashed p-8 text-center text-sm text-slate-400">
            This user has not connected any LinkedIn accounts.
          </div>
        ) : (
          <div className="space-y-4">
            {user.accounts.map((account) => (
              <div key={account.id} className="app-panel p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-white">{account.email}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge value={account.status} />
                      <Badge value={account.warmUpPhase} />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    Added {new Date(account.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {account.campaigns.length === 0 ? (
                  <p className="text-sm text-slate-500">No campaigns.</p>
                ) : (
                  <div className="table-shell">
                    <table className="min-w-full divide-y divide-white/[0.06]">
                      <thead className="table-head">
                        <tr>
                          {["Campaign", "Type", "Status", "Created"].map((h) => (
                            <th key={h} className="px-4 py-2">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {account.campaigns.map((c) => (
                          <tr key={c.id}>
                            <td className="px-4 py-2 text-sm font-medium text-white">{c.name}</td>
                            <td className="px-4 py-2"><Badge value={c.type} /></td>
                            <td className="px-4 py-2"><Badge value={c.status} /></td>
                            <td className="px-4 py-2 text-sm text-slate-500">
                              {new Date(c.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this user?"
        description={`This permanently deletes ${user.email} and all of their accounts, campaigns, leads, and proxies. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export default function AdminUserDetailPageWrapper() {
  return (
    <AdminGuard>
      <AdminUserDetailPage />
    </AdminGuard>
  );
}
