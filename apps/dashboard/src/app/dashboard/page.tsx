"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Stats, type ActivityLog, type Checkpoint } from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [openCheckpoints, setOpenCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function fetchAll() {
    return Promise.all([
      api.stats.get(),
      api.activity.list({ limit: 10 }),
      api.checkpoints.list({ unresolved: true }),
    ]).then(([s, a, c]) => {
      setStats(s);
      setActivity(a.logs);
      setOpenCheckpoints(c);
    });
  }

  useEffect(() => {
    fetchAll()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));

    const id = setInterval(() => {
      fetchAll().catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading)
    return <p className="text-sm text-slate-500">Loading dashboard...</p>;
  if (error)
    return (
      <p className="text-sm text-red-600">Failed to load dashboard: {error}</p>
    );

  const healthy =
    stats && stats.openCheckpoints === 0 ? "Systems clear" : "Review needed";

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-slate-900 bg-slate-950 px-6 py-8 text-white shadow-2xl shadow-slate-900/20 sm:px-8 lg:px-10">
        <div className="absolute inset-0 opacity-80">
          <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-teal-300/60 to-transparent" />
        </div>
        <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">
              LinkedIn automation cockpit
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Run safer outreach with every account, campaign, and lead in view.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Monitor daily caps, queue activity, replies, checkpoints, and
              account health from one calm operating surface.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/campaigns/new" className="btn-accent">
                New Campaign
              </Link>
              <Link
                href="/leads"
                className="inline-flex items-center justify-center rounded-xl border border-white/[0.15] bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/[0.15]"
              >
                Import Leads
              </Link>
            </div>
          </div>

          <div className="app-surface border-white/10 bg-white/10 p-5 text-white shadow-none">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-100">
                  Safety status
                </p>
                <p className="mt-2 text-2xl font-semibold">{healthy}</p>
              </div>
              <div
                className={`h-14 w-14 rounded-2xl ${
                  stats?.openCheckpoints ? "bg-red-400/20" : "bg-teal-300/20"
                } grid place-items-center text-2xl`}
                aria-hidden
              >
                {stats?.openCheckpoints ? "!" : "OK"}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white/10 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">
                  Accounts
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {stats?.activeAccounts ?? 0}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">
                  Leads
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {stats?.totalLeads ?? 0}
                </p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">
                  Replies
                </p>
                <p className="mt-1 text-2xl font-semibold">
                  {stats?.replyRate ?? 0}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {openCheckpoints.length > 0 && (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50/90 p-4 shadow-sm">
          <div>
            <p className="font-semibold text-red-800">
              {openCheckpoints.length} open checkpoint
              {openCheckpoints.length > 1 ? "s" : ""} - action required
            </p>
            <p className="mt-0.5 text-sm text-red-600">
              LinkedIn flagged one or more accounts. Automation is paused until
              you resolve them manually.
            </p>
          </div>
          <Link
            href="/checkpoints"
            className="shrink-0 text-sm font-semibold text-red-700 underline underline-offset-4"
          >
            Resolve
          </Link>
        </div>
      )}

      <div>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="page-kicker">Live metrics</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              Today&apos;s operating picture
            </h2>
          </div>
          <Link href="/accounts" className="hidden text-sm font-semibold text-teal-700 hover:text-teal-800 sm:block">
            View account health
          </Link>
        </div>
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Connections Today"
              value={stats.connectsSentToday}
              sub="of 15 daily cap"
              accent="blue"
            />
            <StatCard
              title="Messages Today"
              value={stats.messagesSentToday}
              sub="of 40 daily cap"
              accent="purple"
            />
            <StatCard
              title="Total Leads"
              value={stats.totalLeads}
              sub={`${stats.connectedLeads} connected`}
              accent="green"
            />
            <StatCard
              title="Reply Rate"
              value={`${stats.replyRate}%`}
              sub="all-time across campaigns"
              accent="purple"
            />
          </div>
        )}
      </div>

      {stats && (
        <div className="grid max-w-md grid-cols-2 gap-4">
          <StatCard
            title="Active Accounts"
            value={stats.activeAccounts}
            accent="gray"
          />
          <StatCard
            title="Open Checkpoints"
            value={stats.openCheckpoints}
            accent="gray"
            alert={stats.openCheckpoints > 0}
          />
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <p className="page-kicker">Event stream</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
              Recent activity
            </h2>
          </div>
          <Link href="/campaigns" className="text-sm font-semibold text-slate-600 hover:text-slate-950">
            Campaigns
          </Link>
        </div>
        <div className="table-shell">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="table-head">
              <tr>
                {["Action", "Target", "Result", "Time"].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activity.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-10 text-center text-sm text-slate-400"
                  >
                    No activity yet. Start a campaign to see logs here.
                  </td>
                </tr>
              )}
              {activity.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80">
                  <td className="table-cell">
                    <Badge value={log.actionType} />
                  </td>
                  <td className="table-cell max-w-xs truncate text-slate-600">
                    {log.targetUrl ?? "-"}
                  </td>
                  <td className="table-cell text-slate-600">
                    {log.result ?? "-"}
                  </td>
                  <td className="table-cell whitespace-nowrap text-slate-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
