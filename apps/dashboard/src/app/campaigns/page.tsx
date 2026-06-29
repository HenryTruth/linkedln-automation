"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Campaign } from "@/lib/api";
import { Badge } from "@/components/Badge";
import { Skeleton, SkeletonTableRows } from "@/components/Skeleton";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.campaigns
      .list()
      .then(setCampaigns)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function toggleStatus(c: Campaign) {
    setBusy(c.id);
    try {
      const updated = await api.campaigns.update(c.id, {
        status: c.status === "PAUSED" ? "ACTIVE" : "PAUSED",
      });
      setCampaigns((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x))
      );
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteCampaign(c: Campaign) {
    if (
      !confirm(
        `Delete "${c.name}"? This removes all its leads and messages and cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(c.id);
    try {
      await api.campaigns.delete(c.id);
      setCampaigns((prev) => prev.filter((x) => x.id !== c.id));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const active = campaigns.filter((c) => c.status === "ACTIVE").length;
  const totalLeads = campaigns.reduce((sum, c) => sum + (c._count?.leads ?? 0), 0);

  if (loading)
    return (
      <div className="space-y-8">
        <section className="app-panel overflow-hidden">
          <div className="p-6 lg:p-8">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-9 w-44" />
            <Skeleton className="mt-3 h-4 w-96 max-w-full" />
          </div>
          <div className="grid border-t border-white/[0.06] bg-slate-950/40 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border-white/[0.06] p-5 sm:border-r last:border-r-0">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-3 h-8 w-16" />
              </div>
            ))}
          </div>
        </section>
        <div className="table-shell">
          <table className="min-w-full">
            <tbody className="divide-y divide-white/[0.06]">
              <SkeletonTableRows cols={6} rows={4} />
            </tbody>
          </table>
        </div>
      </div>
    );
  if (error) return <p className="text-sm text-red-400">{error}</p>;

  return (
    <div className="space-y-8">
      <section className="app-panel overflow-hidden">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-end lg:p-8">
          <div>
            <p className="page-kicker">Campaign center</p>
            <h1 className="page-title mt-2">Campaigns</h1>
            <p className="page-copy">
              Create, pause, inspect, and dispatch outreach workflows across
              connection, messaging, scraping, and content-signal campaigns.
            </p>
          </div>
          <Link href="/campaigns/new" className="btn-primary">
            New Campaign
          </Link>
        </div>
        <div className="grid border-t border-white/[0.06] bg-slate-950/40 sm:grid-cols-3">
          {[
            ["Total campaigns", campaigns.length],
            ["Active", active],
            ["Assigned leads", totalLeads],
          ].map(([label, value]) => (
            <div key={label} className="border-white/[0.06] p-5 sm:border-r last:border-r-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                {label}
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="table-shell">
        <table className="min-w-full divide-y divide-white/[0.06]">
          <thead className="table-head">
            <tr>
              {["Name", "Type", "Status", "Leads", "Daily Limit", "Actions"].map(
                (h) => (
                  <th key={h} className="px-6 py-3">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-14 text-center text-sm text-slate-400">
                  No campaigns yet.{" "}
                  <Link href="/campaigns/new" className="font-semibold text-teal-400 underline underline-offset-4">
                    Create one
                  </Link>{" "}
                  to start the workflow.
                </td>
              </tr>
            )}
            {campaigns.map((c) => (
              <tr key={c.id} className="hover:bg-white/[0.03]">
                <td className="table-cell font-semibold text-white">
                  {c.name}
                </td>
                <td className="table-cell">
                  <Badge value={c.type} />
                </td>
                <td className="table-cell">
                  <Badge value={c.status} />
                </td>
                <td className="table-cell text-slate-400">
                  {c._count?.leads ?? 0}
                </td>
                <td className="table-cell text-slate-400">{c.dailyLimit}/day</td>
                <td className="table-cell">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/campaigns/${c.id}`} className="btn-secondary px-3 py-1.5">
                      View
                    </Link>
                    <button
                      onClick={() => toggleStatus(c)}
                      disabled={busy === c.id || c.status === "COMPLETED"}
                      className="btn-secondary px-3 py-1.5"
                    >
                      {c.status === "PAUSED" ? "Resume" : "Pause"}
                    </button>
                    <button
                      onClick={() => deleteCampaign(c)}
                      disabled={busy === c.id}
                      className="btn-danger px-3 py-1.5"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
