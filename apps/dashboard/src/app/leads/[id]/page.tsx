"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type Lead, type Campaign, type PostSignal } from "@/lib/api";
import { Badge } from "@/components/Badge";

type LeadDetail = Lead & {
  campaigns: Array<{
    campaign: Campaign;
    stage: number;
    repliedAt: string | null;
    postSignal: PostSignal | null;
  }>;
  postSignals: PostSignal[];
};

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "last week";
  return `${Math.floor(d / 7)} weeks ago`;
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blacklistBusy, setBlacklistBusy] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState("");
  const [showBlacklistForm, setShowBlacklistForm] = useState(false);

  useEffect(() => {
    (api.leads.get as (id: string) => Promise<LeadDetail>)(id)
      .then(setLead)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleBlacklist(e: React.FormEvent) {
    e.preventDefault();
    setBlacklistBusy(true);
    try {
      const updated = await api.leads.blacklist(id, blacklistReason || undefined);
      setLead((prev) => prev && { ...prev, blacklisted: updated.blacklisted, blacklistReason: updated.blacklistReason });
      setShowBlacklistForm(false);
      setBlacklistReason("");
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBlacklistBusy(false);
    }
  }

  async function handleUnblacklist() {
    setBlacklistBusy(true);
    try {
      const updated = await api.leads.unblacklist(id);
      setLead((prev) => prev && { ...prev, blacklisted: updated.blacklisted, blacklistReason: updated.blacklistReason });
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBlacklistBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (error || !lead)
    return <p className="text-sm text-red-600">{error ?? "Lead not found"}</p>;

  const displayName =
    lead.firstName || lead.lastName
      ? `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim()
      : "Unknown";

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="app-panel p-6 lg:p-8">
        <button
          onClick={() => router.push("/leads")}
          className="mb-4 text-sm font-semibold text-slate-500 hover:text-slate-950"
        >
          Back to Leads
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title">{displayName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {lead.title && <span>{lead.title}</span>}
              {lead.title && lead.company && <span className="text-slate-300">·</span>}
              {lead.company && <span>{lead.company}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge value={lead.connectionStatus} />
              {lead.blacklisted && <Badge value="BLACKLISTED" />}
            </div>
            {lead.blacklisted && lead.blacklistReason && (
              <p className="mt-2 text-xs text-red-600">
                Reason: {lead.blacklistReason}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={lead.linkedinUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary text-teal-700"
            >
              View LinkedIn Profile
            </a>
            {lead.blacklisted ? (
              <button
                onClick={handleUnblacklist}
                disabled={blacklistBusy}
                className="btn-secondary text-emerald-700"
              >
                {blacklistBusy ? "..." : "Remove Blacklist"}
              </button>
            ) : (
              <button
                onClick={() => setShowBlacklistForm((v) => !v)}
                disabled={blacklistBusy}
                className="btn-danger"
              >
                Blacklist
              </button>
            )}
          </div>
        </div>

        {showBlacklistForm && !lead.blacklisted && (
          <form onSubmit={handleBlacklist} className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex-1 min-w-56">
              <label className="mb-1 block text-xs font-semibold text-red-700">
                Reason (optional)
              </label>
              <input
                value={blacklistReason}
                onChange={(e) => setBlacklistReason(e.target.value)}
                placeholder="e.g. Replied negatively, competitor, wrong target"
                className="field w-full"
              />
            </div>
            <button type="submit" disabled={blacklistBusy} className="btn-danger">
              {blacklistBusy ? "Saving..." : "Confirm Blacklist"}
            </button>
            <button type="button" onClick={() => setShowBlacklistForm(false)} className="btn-secondary">
              Cancel
            </button>
          </form>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Post signals sidebar — the conversation context panel */}
        <aside className="lg:col-span-1 space-y-4">
          <div className="app-panel p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Signal Context
            </p>

            {lead.postSignals.length === 0 ? (
              <p className="text-sm text-slate-400">
                No post signals — this lead was not sourced from a content signal campaign.
              </p>
            ) : (
              <div className="space-y-4">
                {lead.postSignals.map((sig) => (
                  <div
                    key={sig.id}
                    className="space-y-2 rounded-2xl border border-teal-100 bg-teal-50/60 p-4"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-teal-700">
                        &quot;{sig.keyword}&quot;
                      </span>
                      <span className="text-slate-400">{relativeDate(sig.publishedAt)}</span>
                    </div>
                    <p className="text-xs italic leading-5 text-slate-600 line-clamp-4">
                      &quot;{sig.excerpt}&quot;
                    </p>
                    <a
                      href={sig.postUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      View original post ↗
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lead metadata */}
          <div className="app-panel p-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Details
            </p>
            <dl className="space-y-2 text-sm">
              {[
                ["LinkedIn URL", lead.linkedinUrl],
                ["Added", new Date(lead.createdAt).toLocaleDateString()],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt className="text-xs font-semibold text-slate-400">{label}</dt>
                  <dd className="break-all text-slate-700">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>

        {/* Campaign membership */}
        <main className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-semibold text-slate-950">
            Campaign Membership
          </h2>

          {lead.campaigns.length === 0 ? (
            <div className="app-panel border-dashed p-8 text-center text-sm text-slate-400">
              This lead is not in any campaign yet.
            </div>
          ) : (
            <div className="space-y-3">
              {lead.campaigns.map((cl) => (
                <div key={cl.campaign.id} className="app-panel p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <button
                        onClick={() => router.push(`/campaigns/${cl.campaign.id}`)}
                        className="text-sm font-semibold text-teal-700 hover:underline text-left"
                      >
                        {cl.campaign.name}
                      </button>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge value={cl.campaign.type} />
                        <Badge value={cl.campaign.status} />
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500 shrink-0">
                      <div>Stage {cl.stage}</div>
                      {cl.repliedAt && (
                        <div className="mt-1 font-semibold text-emerald-600">Replied</div>
                      )}
                    </div>
                  </div>

                  {/* Post signal tied to this campaign membership */}
                  {cl.postSignal && (
                    <div className="flex items-start gap-2 rounded-2xl border border-teal-100 bg-teal-50 p-3 text-xs text-teal-800">
                      <span className="shrink-0 font-semibold">Post:</span>
                      <span className="italic line-clamp-2">&quot;{cl.postSignal.excerpt}&quot;</span>
                      <a
                        href={cl.postSignal.postUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto shrink-0 font-semibold text-teal-700 hover:underline"
                      >
                        Open ↗
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
