"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  type AdminQueueHealth,
  type AdminCheckpoint,
  type AdminProxy,
  type AdminAccountBreakdown,
} from "@/lib/api";
import { AdminGuard } from "@/components/AdminGuard";
import { Badge } from "@/components/Badge";
import { StatCard } from "@/components/StatCard";
import { Skeleton, SkeletonTableRows } from "@/components/Skeleton";

function fmt(value: number | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function AdminOverview() {
  const [queues, setQueues] = useState<AdminQueueHealth | null>(null);
  const [checkpoints, setCheckpoints] = useState<AdminCheckpoint[]>([]);
  const [proxies, setProxies] = useState<AdminProxy[]>([]);
  const [accounts, setAccounts] = useState<AdminAccountBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  function reload() {
    return Promise.all([
      api.admin.queues(),
      api.admin.checkpoints(true),
      api.admin.proxies(),
      api.admin.accounts(),
    ]).then(([q, c, p, a]) => {
      setQueues(q);
      setCheckpoints(c);
      setProxies(p);
      setAccounts(a);
    });
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
        <div className="app-panel p-6 lg:p-8 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );

  return (
    <div className="space-y-8">
      <section className="app-panel p-6 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="page-kicker">Back office</p>
            <h1 className="page-title mt-2">Admin overview</h1>
            <p className="page-copy">
              System-wide operational health across every tenant — queues, checkpoints,
              proxies, and account status.
            </p>
          </div>
          <Link href="/admin/users" className="btn-secondary">
            Manage users
          </Link>
        </div>
      </section>

      {queues && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-white">Queues</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard title="Active" value={queues.totals.active} accent="blue" />
            <StatCard title="Waiting" value={queues.totals.waiting} accent="gray" />
            <StatCard title="Delayed" value={queues.totals.delayed} accent="gray" />
            <StatCard title="Completed" value={queues.totals.completed} accent="green" />
            <StatCard
              title="Failed"
              value={queues.totals.failed}
              accent="red"
              alert={queues.totals.failed > 0}
            />
          </div>
          <div className="table-shell mt-4">
            <table className="min-w-full divide-y divide-white/[0.06]">
              <thead className="table-head">
                <tr>
                  {["Queue", "Active", "Waiting", "Delayed", "Completed", "Failed"].map((h) => (
                    <th key={h} className="px-6 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {Object.entries(queues.byQueue).map(([name, counts]) => (
                  <tr key={name} className="hover:bg-white/[0.03]">
                    <td className="table-cell font-semibold text-slate-100">{name}</td>
                    <td className="table-cell text-slate-400">{counts.active}</td>
                    <td className="table-cell text-slate-400">{counts.waiting}</td>
                    <td className="table-cell text-slate-400">{counts.delayed}</td>
                    <td className="table-cell text-slate-400">{counts.completed}</td>
                    <td className={`table-cell ${counts.failed > 0 ? "text-red-400" : "text-slate-400"}`}>
                      {counts.failed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {queues.recentFailures.length > 0 && (
            <div className="table-shell mt-4">
              <table className="min-w-full divide-y divide-white/[0.06]">
                <thead className="table-head">
                  <tr>
                    {["Queue", "Job", "Attempts", "Reason", "When", "Payload"].map((h) => (
                      <th key={h} className="px-6 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {queues.recentFailures.map((job) => (
                    <tr key={`${job.queue}-${job.id}`} className="align-top hover:bg-white/[0.03]">
                      <td className="table-cell font-semibold text-slate-100">{job.queue}</td>
                      <td className="table-cell">
                        <div className="font-semibold text-white">{job.name}</div>
                        <div className="mt-1 font-mono text-xs text-slate-400">{job.id ?? "-"}</div>
                      </td>
                      <td className="table-cell text-slate-400">{job.attemptsMade}</td>
                      <td className="table-cell max-w-xs">
                        {job.failedReason ? (
                          <p className="whitespace-pre-wrap text-sm text-red-400 line-clamp-4" title={job.failedReason}>
                            {job.failedReason}
                          </p>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="table-cell text-slate-500">{fmt(job.finishedOn ?? job.timestamp)}</td>
                      <td className="table-cell">
                        <pre className="max-w-xs overflow-auto rounded-lg bg-slate-800 p-2 text-xs text-slate-300">
                          {JSON.stringify(job.data, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {accounts && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-white">Accounts</h2>
          <div className="flex flex-wrap gap-2">
            {accounts.byStatus.map((s) => (
              <div key={s.status} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-slate-900 px-3 py-2">
                <Badge value={s.status} />
                <span className="text-sm font-semibold text-slate-300">{s._count}</span>
              </div>
            ))}
            {accounts.byWarmUp.map((w) => (
              <div key={w.warmUpPhase} className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-slate-900 px-3 py-2">
                <Badge value={w.warmUpPhase} />
                <span className="text-sm font-semibold text-slate-300">{w._count}</span>
              </div>
            ))}
          </div>
          <div className="table-shell mt-4">
            <table className="min-w-full divide-y divide-white/[0.06]">
              <thead className="table-head">
                <tr>
                  {["Account", "Owner", "Status", "Warm-up", "Created"].map((h) => (
                    <th key={h} className="px-6 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {accounts.accounts.map((a) => (
                  <tr key={a.id} className="hover:bg-white/[0.03]">
                    <td className="table-cell font-medium text-white">{a.email}</td>
                    <td className="table-cell text-slate-400">{a.user.email}</td>
                    <td className="table-cell"><Badge value={a.status} /></td>
                    <td className="table-cell"><Badge value={a.warmUpPhase} /></td>
                    <td className="table-cell text-slate-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold text-white">Unresolved checkpoints</h2>
        <div className="table-shell">
          <table className="min-w-full divide-y divide-white/[0.06]">
            <thead className="table-head">
              <tr>
                {["Account", "Owner", "Detected"].map((h) => (
                  <th key={h} className="px-6 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {checkpoints.length === 0 ? (
                <tr>
                  <td className="px-6 py-10 text-center text-sm text-slate-400" colSpan={3}>
                    No unresolved checkpoints across any tenant.
                  </td>
                </tr>
              ) : (
                checkpoints.map((cp) => (
                  <tr key={cp.id} className="hover:bg-white/[0.03]">
                    <td className="table-cell font-medium text-white">{cp.account.email}</td>
                    <td className="table-cell text-slate-400">{cp.account.user.email}</td>
                    <td className="table-cell text-slate-500">{new Date(cp.detectedAt).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-white">Proxies</h2>
        <div className="table-shell">
          <table className="min-w-full divide-y divide-white/[0.06]">
            <thead className="table-head">
              <tr>
                {["Host", "Owner", "Health", "Exit IP", "Last used"].map((h) => (
                  <th key={h} className="px-6 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {proxies.length === 0 ? (
                <tr>
                  <td className="px-6 py-10 text-center text-sm text-slate-400" colSpan={5}>
                    No proxies configured across any tenant.
                  </td>
                </tr>
              ) : (
                proxies.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.03]">
                    <td className="table-cell font-medium text-white">{p.host}:{p.port}</td>
                    <td className="table-cell text-slate-400">{p.user.email}</td>
                    <td className="table-cell"><Badge value={p.healthStatus} /></td>
                    <td className="table-cell text-slate-400">{p.currentExitIp ?? "-"}</td>
                    <td className="table-cell text-slate-500">
                      {p.lastUsed ? new Date(p.lastUsed).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AdminGuard>
      <AdminOverview />
    </AdminGuard>
  );
}
