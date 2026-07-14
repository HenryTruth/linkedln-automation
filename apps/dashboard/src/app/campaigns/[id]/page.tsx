"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type CampaignDetail, type CampaignLeadJobStatus, type CampaignStats, type Lead, type SearchScrapeCampaignJob } from "@/lib/api";
import { Badge } from "@/components/Badge";
import { SequenceBuilder } from "@/components/SequenceBuilder";
import { SequenceGraphBuilder, STEP_TYPE_LABELS } from "@/components/SequenceGraphBuilder";
import { ContentSignalPanel } from "@/components/ContentSignalPanel";
import { Skeleton, SkeletonTableRows } from "@/components/Skeleton";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "sonner";

const SEARCH_LOCATIONS: { label: string; geoUrn: string }[] = [
  // Americas
  { label: "United States",        geoUrn: "103644278" },
  { label: "Canada",               geoUrn: "101174742" },
  { label: "Brazil",               geoUrn: "106057199" },
  { label: "Mexico",               geoUrn: "103323778" },
  { label: "Colombia",             geoUrn: "100877388" },
  { label: "Argentina",            geoUrn: "100446943" },
  { label: "Chile",                geoUrn: "104621616" },
  // Europe
  { label: "United Kingdom",       geoUrn: "101165590" },
  { label: "Ireland",              geoUrn: "104738515" },
  { label: "Germany",              geoUrn: "101282230" },
  { label: "France",               geoUrn: "105015875" },
  { label: "Netherlands",          geoUrn: "102890719" },
  { label: "Sweden",               geoUrn: "105117694" },
  { label: "Switzerland",          geoUrn: "106693272" },
  { label: "Belgium",              geoUrn: "100565514" },
  { label: "Spain",                geoUrn: "105646813" },
  { label: "Italy",                geoUrn: "103350119" },
  { label: "Denmark",              geoUrn: "104514075" },
  { label: "Norway",               geoUrn: "103819153" },
  { label: "Finland",              geoUrn: "100456013" },
  { label: "Poland",               geoUrn: "105072130" },
  { label: "Portugal",             geoUrn: "100364837" },
  { label: "Austria",              geoUrn: "103883259" },
  { label: "Turkey",               geoUrn: "102105699" },
  // Africa
  { label: "Nigeria",              geoUrn: "101356196" },
  { label: "South Africa",         geoUrn: "104035573" },
  { label: "Kenya",                geoUrn: "101686952" },
  { label: "Ghana",                geoUrn: "105769760" },
  { label: "Egypt",                geoUrn: "106556538" },
  { label: "Ethiopia",             geoUrn: "107357706" },
  { label: "Tanzania",             geoUrn: "101525285" },
  { label: "Uganda",               geoUrn: "102572633" },
  { label: "Morocco",              geoUrn: "102262120" },
  { label: "Rwanda",               geoUrn: "105115402" },
  // Middle East
  { label: "United Arab Emirates", geoUrn: "104305776" },
  { label: "Saudi Arabia",         geoUrn: "103424752" },
  { label: "Israel",               geoUrn: "101620260" },
  { label: "Qatar",                geoUrn: "104338233" },
  { label: "Kuwait",               geoUrn: "104098652" },
  // Asia-Pacific
  { label: "India",                geoUrn: "102713980" },
  { label: "Singapore",            geoUrn: "102454443" },
  { label: "Australia",            geoUrn: "101452733" },
  { label: "New Zealand",          geoUrn: "105490917" },
  { label: "Japan",                geoUrn: "101355337" },
  { label: "South Korea",          geoUrn: "105149562" },
  { label: "Pakistan",             geoUrn: "105214831" },
  { label: "Bangladesh",           geoUrn: "105563663" },
  { label: "Philippines",          geoUrn: "103121230" },
  { label: "Indonesia",            geoUrn: "102478259" },
  { label: "Malaysia",             geoUrn: "103032786" },
  { label: "Thailand",             geoUrn: "105084113" },
  { label: "Vietnam",              geoUrn: "104195383" },
];

const JOB_STATUS_STYLES: Record<CampaignLeadJobStatus, string> = {
  IDLE:    "bg-slate-700/50 text-slate-400",
  QUEUED:  "bg-amber-500/15 text-amber-400",
  RUNNING: "bg-blue-500/15 text-blue-400",
  SENT:    "bg-emerald-500/15 text-emerald-400",
  SKIPPED: "bg-slate-700/40 text-slate-400",
  FAILED:  "bg-red-500/15 text-red-400",
};

const SEARCH_JOB_STYLES: Record<string, string> = {
  waiting: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  active: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  delayed: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  failed: "border-red-500/30 bg-red-500/10 text-red-300",
};

function searchJobLabel(state: string) {
  if (state === "waiting") return "Queued";
  if (state === "active") return "Running now";
  if (state === "delayed") return "Waiting to retry";
  if (state === "completed") return "Completed";
  if (state === "failed") return "Failed";
  return state;
}

function searchJobDetail(job: SearchScrapeCampaignJob) {
  if (job.state === "waiting") {
    return "Accepted. The worker will pick this up automatically; no Start Campaign click is needed.";
  }
  if (job.state === "active") {
    return "Browser automation is currently scraping this search URL.";
  }
  if (job.state === "delayed") {
    return "The job is delayed, usually because it is retrying after a temporary failure.";
  }
  if (job.state === "completed") {
    const scraped = job.returnvalue?.scraped;
    if (typeof scraped === "number") {
      if (scraped === 0) {
        return "Scrape finished but found 0 profiles. LinkedIn may have served an unrecognized page layout or an expired session — check the Activity page for the landing URL and screenshot artifact.";
      }
      return `Scrape finished — discovered ${scraped} profile${scraped === 1 ? "" : "s"} across ${job.returnvalue?.pagesScraped ?? "?"} page${job.returnvalue?.pagesScraped === 1 ? "" : "s"}. Refresh to see them in the table below.`;
    }
    return "Scrape finished. Newly discovered profiles should appear in the table below after refresh.";
  }
  if (job.state === "failed") {
    return job.failedReason ?? "The search scrape failed. Open Jobs for the full payload and error.";
  }
  return "Search scrape job recorded.";
}

// Mirrors isSalesNavigatorUrl in apps/api/src/routes/campaigns.ts so the
// source dropdown can auto-sync with whatever URL gets pasted in, instead of
// silently defaulting to the wrong source and tripping the backend's guard.
function detectSearchSource(value: string): "LINKEDIN" | "SALES_NAVIGATOR" | null {
  try {
    const url = new URL(value);
    if (!url.hostname.endsWith("linkedin.com")) return null;
    if (
      url.pathname.startsWith("/sales/search/people") ||
      url.pathname.startsWith("/sales/lists/people") ||
      url.pathname.startsWith("/sales/lead/")
    ) {
      return "SALES_NAVIGATOR";
    }
    return "LINKEDIN";
  } catch {
    return null;
  }
}

function fmtJobTime(value: number | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function JobStatusBadge({ status, error }: { status: CampaignLeadJobStatus; error?: string | null }) {
  return (
    <div>
      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${JOB_STATUS_STYLES[status]}`}>
        {status}
      </span>
      {error && (
        <p className="mt-0.5 max-w-xs truncate text-[11px] text-red-500" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}

// Warning shown after adding a lead whose status doesn't match the campaign type
function statusMismatchWarning(
  campaignType: string,
  lead: Lead
): string | null {
  if (
    campaignType === "CONNECT" &&
    (lead.connectionStatus === "CONNECTED" ||
      lead.connectionStatus === "PENDING")
  ) {
    return `This person is already ${lead.connectionStatus.toLowerCase()} - sending another connection request will be ignored by LinkedIn. Consider adding them to a MESSAGE campaign instead.`;
  }
  if (campaignType === "MESSAGE" && lead.connectionStatus !== "CONNECTED") {
    return `This person is not connected yet (status: ${lead.connectionStatus}). LinkedIn only allows messages to first-degree connections. They need to accept a connection request first.`;
  }
  if (campaignType === "INMAIL" && !lead.linkedinUrl.includes("/sales/lead/")) {
    return "InMail campaigns work best with Sales Navigator lead URLs or profiles where LinkedIn shows an InMail button.";
  }
  return null;
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [startResult, setStartResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  const TIMEZONES = [
    "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
    "America/Toronto", "America/Vancouver", "Europe/London", "Europe/Paris",
    "Europe/Berlin", "Europe/Amsterdam", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai",
  ];

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLimit, setEditLimit] = useState(10);
  const [editTimezone, setEditTimezone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Connection note editor state
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  // Add-lead / add-profile form
  const [leadUrl, setLeadUrl] = useState("");
  const [leadFirst, setLeadFirst] = useState("");
  const [leadLast, setLeadLast] = useState("");
  const [leadCompany, setLeadCompany] = useState("");
  const [leadTitle, setLeadTitle] = useState("");
  const [addingLead, setAddingLead] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadWarning, setLeadWarning] = useState<string | null>(null);
  const [showLeadForm, setShowLeadForm] = useState(false);

  // Add search URL form (SCRAPE only)
  const [searchUrl, setSearchUrl] = useState("");
  const [searchSource, setSearchSource] = useState<"LINKEDIN" | "SALES_NAVIGATOR">("LINKEDIN");
  const [searchLeadLimit, setSearchLeadLimit] = useState(10);
  const [addingSearch, setAddingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [searchJobs, setSearchJobs] = useState<SearchScrapeCampaignJob[]>([]);
  const [searchJobsLoading, setSearchJobsLoading] = useState(false);
  const [clearingSearchJobs, setClearingSearchJobs] = useState(false);
  const [showSearchForm, setShowSearchForm] = useState(false);

  // LinkedIn search URL builder
  const [showUrlBuilder, setShowUrlBuilder] = useState(false);
  const [builderKeywords, setBuilderKeywords] = useState("");
  const [builderTitle, setBuilderTitle] = useState("");
  const [builderLocation, setBuilderLocation] = useState("");
  const [builderNetwork, setBuilderNetwork] = useState("SO");

  function applyBuilder() {
    const params = new URLSearchParams({ origin: "FACETED_SEARCH" });
    if (builderKeywords.trim()) params.set("keywords", builderKeywords.trim());
    if (builderLocation) params.set("geoUrn", JSON.stringify([builderLocation]));
    if (builderTitle.trim()) params.set("titleFreeText", builderTitle.trim());
    const networkMap: Record<string, string[]> = {
      F: ["F"], S: ["S"], O: ["O"], SO: ["S", "O"],
    };
    const net = networkMap[builderNetwork];
    if (net) params.set("network", JSON.stringify(net));
    setSearchUrl(`https://www.linkedin.com/search/results/people/?${params}`);
    setSearchSource("LINKEDIN");
    setShowUrlBuilder(false);
  }

  // Bulk CSV import
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importingCsv, setImportingCsv] = useState(false);
  const [csvResult, setCsvResult] = useState<{ imported: number; errors: { row: number; error: string }[] } | null>(null);

  function reload() {
    return Promise.all([
      api.campaigns.get(id).then(setCampaign),
      api.campaigns.stats(id).then(setStats).catch(() => {}),
    ]);
  }

  async function clearSearchJobs() {
    setClearingSearchJobs(true);
    try {
      await api.campaigns.clearSearchJobs(id);
      const result = await api.campaigns.searchJobs(id);
      setSearchJobs(result.jobs);
    } catch {
      // Clearing history is cosmetic — a failure here shouldn't break the page.
    } finally {
      setClearingSearchJobs(false);
    }
  }

  async function reloadSearchJobs() {
    setSearchJobsLoading(true);
    try {
      const result = await api.campaigns.searchJobs(id);
      setSearchJobs(result.jobs);
    } catch {
      // Job status is helpful context, but the campaign page should still work without it.
    } finally {
      setSearchJobsLoading(false);
    }
  }

  useEffect(() => {
    reload()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (campaign?.type !== "SCRAPE") return;
    reloadSearchJobs();
    const interval = window.setInterval(() => {
      reloadSearchJobs();
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [campaign?.id, campaign?.type]);

  useEffect(() => {
    if (campaign?.type === "CONNECT") {
      setNoteText(campaign.connectionNoteTemplate ?? "");
    }
  }, [campaign?.id]);

  function startEditing() {
    setEditName(campaign!.name);
    setEditLimit(campaign!.dailyLimit);
    setEditTimezone(campaign!.targetTimezone ?? null);
    setEditing(true);
  }

  async function handleSaveNote() {
    setNoteSaving(true);
    setNoteSaved(false);
    try {
      await api.campaigns.update(id, {
        connectionNoteTemplate: noteText.trim() || null,
      });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 3000);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setNoteSaving(false);
    }
  }

  function insertNoteVariable(v: string) {
    setNoteText((t) => t + v);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.campaigns.update(id, {
        name: editName,
        dailyLimit: editLimit,
        targetTimezone: editTimezone || null,
      });
      setCampaign((prev) => prev && { ...prev, name: updated.name, dailyLimit: updated.dailyLimit, targetTimezone: updated.targetTimezone });
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setConfirmDeleteOpen(false);
    setDeleting(true);
    try {
      await api.campaigns.delete(id);
      toast.success(`"${campaign!.name}" deleted`);
      router.push("/campaigns");
    } catch (e) {
      toast.error((e as Error).message);
      setDeleting(false);
    }
  }

  async function handleToggleStatus() {
    if (!campaign) return;
    setBusy(true);
    try {
      const updated = await api.campaigns.update(id, {
        status: campaign.status === "PAUSED" ? "ACTIVE" : "PAUSED",
      });
      setCampaign((prev) => prev && { ...prev, status: updated.status });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleStart() {
    setBusy(true);
    setStartResult(null);
    try {
      const result = await api.campaigns.start(id);
      setStartResult({
        ok: true,
        msg: `Dispatched ${result.dispatched} job${result.dispatched !== 1 ? "s" : ""} to the queue`,
      });
      await reload();
    } catch (e) {
      setStartResult({ ok: false, msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddLead(e: React.FormEvent) {
    e.preventDefault();
    setAddingLead(true);
    setLeadError(null);
    setLeadWarning(null);
    try {
      const added = await api.campaigns.addLead(id, {
        linkedinUrl: leadUrl,
        firstName: leadFirst || undefined,
        lastName: leadLast || undefined,
        company: leadCompany || undefined,
        title: leadTitle || undefined,
      });

      const warning = statusMismatchWarning(campaign!.type, added.lead);
      if (warning) setLeadWarning(warning);

      setLeadUrl("");
      setLeadFirst("");
      setLeadLast("");
      setLeadCompany("");
      setLeadTitle("");
      setShowLeadForm(false);
      await reload();
    } catch (e) {
      setLeadError((e as Error).message);
    } finally {
      setAddingLead(false);
    }
  }

  async function handleAddSearchUrl(e: React.FormEvent) {
    e.preventDefault();
    setAddingSearch(true);
    setSearchError(null);
    setSearchNotice(null);
    try {
      const result = await api.campaigns.addSearchUrl(id, searchUrl, searchSource, searchLeadLimit);
      setSearchNotice(
        `Search URL accepted and queued${result.jobId ? ` as job ${result.jobId}` : ""} for up to ${searchLeadLimit} leads. It starts automatically when the search worker is available and account guardrails allow it.`
      );
      setSearchUrl("");
      setShowSearchForm(false);
      await Promise.all([reload(), reloadSearchJobs()]);
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setAddingSearch(false);
    }
  }

  async function handleImportCsv(e: React.FormEvent) {
    e.preventDefault();
    setImportingCsv(true);
    setCsvResult(null);
    try {
      const result = await api.leads.importCsv({ csvText, campaignId: id });
      setCsvResult(result);
      if (result.imported > 0) {
        setCsvText("");
        await reload();
      }
    } catch (e) {
      setCsvResult({ imported: 0, errors: [{ row: 0, error: (e as Error).message }] });
    } finally {
      setImportingCsv(false);
    }
  }

  if (loading)
    return (
      <div className="space-y-6">
        <div className="app-panel p-6 lg:p-8 space-y-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-64" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.06] bg-slate-800/50 p-3 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
        </div>
        <div className="table-shell">
          <table className="min-w-full">
            <tbody className="divide-y divide-white/[0.06]">
              <SkeletonTableRows cols={5} rows={5} />
            </tbody>
          </table>
        </div>
      </div>
    );
  if (error || !campaign)
    return <p className="text-sm text-red-400">{error ?? "Not found"}</p>;

  const isMessage = campaign.type === "MESSAGE";
  const isInMail = campaign.type === "INMAIL";
  const isScrape = campaign.type === "SCRAPE";
  const isContentSignal = campaign.type === "CONTENT_SIGNAL";
  const isConnect = campaign.type === "CONNECT";
  const isSequence = campaign.type === "SEQUENCE";
  const stepById = new Map((campaign.steps ?? []).map((s) => [s.id, s]));

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="app-panel p-6 lg:p-8">
        <button
          onClick={() => router.push("/campaigns")}
          className="mb-4 text-sm font-semibold text-slate-400 hover:text-white"
        >
          Back to Campaigns
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editing ? (
              <form onSubmit={handleSaveEdit} className="flex flex-wrap items-end gap-3">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="field min-w-72 text-xl font-semibold"
                />
                <div className="flex items-center gap-1">
                  <label className="text-xs font-semibold text-slate-400">Daily limit</label>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={editLimit}
                    onChange={(e) => setEditLimit(Number(e.target.value))}
                    className="field w-20"
                  />
                </div>
                {!isContentSignal && (
                  <div className="flex items-center gap-1">
                    <label className="text-xs font-semibold text-slate-400">Timezone</label>
                    <select
                      value={editTimezone ?? ""}
                      onChange={(e) => setEditTimezone(e.target.value || null)}
                      className="field"
                    >
                      <option value="">Account default</option>
                      {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary px-3 py-1.5"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="btn-secondary px-3 py-1.5"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h1 className="page-title">{campaign.name}</h1>
                  <button
                    onClick={startEditing}
                    className="rounded-lg border border-white/[0.08] px-2 py-1 text-xs font-semibold text-slate-400 hover:border-teal-500/40 hover:text-teal-400"
                  >
                    Edit
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge value={campaign.type} />
                  <Badge value={campaign.status} />
                  <span className="text-sm font-medium text-slate-400">
                    {campaign.leads.length} lead
                    {campaign.leads.length !== 1 ? "s" : ""} -{" "}
                    {campaign.dailyLimit}/day limit
                  </span>
                  {!isContentSignal && campaign.targetTimezone && (
                    <span className="text-sm font-medium text-slate-500">
                      · {campaign.targetTimezone}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleStart}
              disabled={busy || campaign.status === "PAUSED"}
              title={
                campaign.status === "PAUSED"
                  ? "Resume the campaign first"
                  : "Dispatch jobs to the queue now"
              }
              className="btn-accent"
            >
              {busy ? "..." : "Start Campaign"}
            </button>
            <button
              onClick={handleToggleStatus}
              disabled={busy || campaign.status === "COMPLETED"}
              className="btn-secondary"
            >
              {campaign.status === "PAUSED" ? "Resume" : "Pause"}
            </button>
            <button
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleting}
              className="btn-danger"
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>

        {startResult && (
          <div
            className={`mt-4 rounded-2xl p-3 text-sm ${
              startResult.ok
                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border border-red-500/30 bg-red-500/10 text-red-400"
            }`}
          >
            {startResult.ok ? "OK " : "Error "}
            {startResult.msg}
          </div>
        )}
      </section>

      {/* Conversion funnel stats */}
      {stats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Total leads", value: stats.totalLeads, color: "text-white" },
            { label: "Pending", value: stats.pending, color: "text-amber-400" },
            { label: "Connected", value: stats.connected, color: "text-teal-400" },
            { label: "Replied", value: stats.replied, color: "text-emerald-400" },
            { label: "Acceptance", value: `${stats.acceptanceRate}%`, color: stats.acceptanceRate >= 30 ? "text-emerald-400" : "text-amber-400" },
            { label: "Reply rate", value: `${stats.replyRate}%`, color: stats.replyRate >= 10 ? "text-emerald-400" : "text-slate-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="app-panel p-4 text-center">
              <p className={`text-2xl font-semibold ${color}`}>{value}</p>
              <p className="mt-1 text-xs font-medium text-slate-400">{label}</p>
            </div>
          ))}
        </section>
      )}

      {/* Connection note editor (CONNECT campaigns only) */}
      {isConnect && (
        <section className="app-panel p-6">
          <div className="mb-4">
            <p className="page-kicker">Personalisation</p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              Connection Note
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              Sent with every connection request in this campaign. Use dynamic
              variables to personalise each note automatically. LinkedIn limits
              notes to{" "}
              <span className="font-semibold text-slate-200">
                300 characters
              </span>
              . Leave blank to send without a note.
            </p>
          </div>

          <div className="mb-2 flex flex-wrap gap-1.5">
            {[
              { label: "{{firstName}}", tip: "e.g. Sarah" },
              { label: "{{lastName}}", tip: "e.g. Johnson" },
              { label: "{{company}}", tip: "e.g. Acme Corp" },
              { label: "{{title}}", tip: "e.g. Head of Product" },
            ].map(({ label, tip }) => (
              <button
                key={label}
                type="button"
                title={tip}
                onClick={() => insertNoteVariable(label)}
                className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-teal-400 hover:bg-teal-500/20"
              >
                {label}
              </button>
            ))}
          </div>

          <textarea
            rows={5}
            maxLength={300}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={`Hi {{firstName}}, I came across your work at {{company}} and would love to connect!`}
            className="field w-full resize-none font-mono text-sm"
          />

          <div className="mt-2 flex items-center justify-between gap-4">
            <p
              className={`text-xs font-medium ${
                noteText.length > 280 ? "text-red-500" : "text-slate-400"
              }`}
            >
              {noteText.length}/300
            </p>
            <div className="flex items-center gap-3">
              {noteSaved && (
                <span className="text-xs font-semibold text-emerald-400">
                  Saved
                </span>
              )}
              {noteText.trim() && (
                <button
                  type="button"
                  onClick={() => setNoteText("")}
                  className="text-xs font-semibold text-slate-400 hover:text-red-500"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveNote}
                disabled={noteSaving}
                className="btn-primary px-4 py-1.5 text-sm"
              >
                {noteSaving ? "Saving..." : "Save note"}
              </button>
            </div>
          </div>

          {noteText.trim() && (
            <div className="mt-4 rounded-2xl border border-white/[0.06] bg-slate-800/50 p-4">
              <p className="mb-1 text-xs font-semibold text-slate-400">
                Preview (example lead)
              </p>
              <p className="text-sm text-slate-300">
                {noteText
                  .replace(/\{\{firstName\}\}/g, "Sarah")
                  .replace(/\{\{lastName\}\}/g, "Johnson")
                  .replace(/\{\{company\}\}/g, "Acme Corp")
                  .replace(/\{\{title\}\}/g, "Head of Product")}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Content Signal config + post signal list */}
      {isContentSignal && (
        <section>
          <div className="mb-4">
            <p className="page-kicker">Signal targeting</p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              Content Signal Targeting
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              Configure the keyword to search, then run the scraper to find
              people who posted about it. Each collected author becomes a lead
              with their post stored as context for personalised outreach.
            </p>
          </div>
          <ContentSignalPanel
            campaignId={id}
            initialConfig={campaign.contentSignalConfig}
          />
        </section>
      )}

      {/* Message template builder */}
      {(isMessage || isInMail) && (
        <section>
          <div className="mb-4">
            <p className="page-kicker">{isInMail ? "InMail" : "Sequence"}</p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              {isInMail ? "InMail Template" : "Message Sequence"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              {isInMail
                ? "Create the body Vectra will send through the Sales Navigator InMail composer. The subject is generated from the lead name."
                : "Drag steps to reorder them. Click Edit to change content or delays. Each step fires after its delay has passed since the previous one."}
            </p>
          </div>
          <SequenceBuilder
            campaignId={id}
            initialMessages={campaign.messages}
            showSubject={isInMail}
          />
        </section>
      )}

      {/* Profiles / Leads section */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="page-kicker">Audience</p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              {isScrape ? "Profiles to Scrape" : "Leads"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              {isScrape ? (
                <>
                  Add specific profile URLs you found manually, or add a
                  LinkedIn search URL to bulk-discover people from search
                  results. No messages are sent - data is collected only.
                </>
              ) : campaign.type === "CONNECT" ? (
                <>
                  Profiles to send connection requests to. Only add people you
                  are{" "}
                  <span className="font-semibold text-slate-200">
                    not yet connected with
                  </span>{" "}
                  - already-connected profiles will be skipped.
                </>
              ) : campaign.type === "INMAIL" ? (
                <>
                  Add Sales Navigator lead URLs or imported lead lists for
                  InMail outreach. Leads do not need to be first-degree
                  connections, but the account must have Sales Navigator InMail
                  access.
                </>
              ) : isSequence ? (
                <>
                  Add leads the same way as any other campaign — manually,
                  via CSV, or from a search URL. They don&apos;t need to be
                  pre-connected. Each lead enters the graph at its entry step
                  the next time you click{" "}
                  <span className="font-semibold text-slate-200">
                    Start Campaign
                  </span>
                  .
                </>
              ) : (
                <>
                  Connected contacts to message. Only people who have{" "}
                  <span className="font-semibold text-slate-200">
                    accepted your connection
                  </span>{" "}
                  can receive messages - unconnected profiles will be skipped.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setShowSearchForm((v) => !v);
                setShowLeadForm(false);
                setShowCsvImport(false);
              }}
              className="btn-secondary px-3 py-1.5 text-violet-400"
            >
              {showSearchForm ? "Cancel" : "Search URL"}
            </button>
            <button
              onClick={() => {
                setShowCsvImport((v) => !v);
                setShowLeadForm(false);
                setShowSearchForm(false);
                setCsvResult(null);
              }}
              className="btn-secondary px-3 py-1.5 text-indigo-400"
            >
              {showCsvImport ? "Cancel" : "Import CSV"}
            </button>
            <button
              onClick={() => {
                setShowLeadForm((v) => !v);
                setShowSearchForm(false);
                setShowCsvImport(false);
              }}
              className="btn-secondary px-3 py-1.5 text-teal-400"
            >
              {showLeadForm
                ? "Cancel"
                : isScrape
                ? "+ Add Profile URL"
                : "Add Lead"}
            </button>
          </div>
        </div>

        {/* Status mismatch warning (persists until dismissed) */}
        {leadWarning && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <span className="mt-0.5 text-sm font-semibold text-amber-400">Warning:</span>
            <div className="flex-1 text-sm text-amber-300">{leadWarning}</div>
            <button
              onClick={() => setLeadWarning(null)}
              className="text-xs font-semibold text-amber-400 hover:text-amber-300"
            >
              Close
            </button>
          </div>
        )}

        {isScrape && searchNotice && (
          <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            <p className="font-semibold">Search URL accepted</p>
            <p className="mt-1 leading-6">{searchNotice}</p>
          </div>
        )}

        {isScrape && (
          <div className="mb-4 rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Search automation status
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  Search URLs run as soon as they are queued. They can still wait on worker availability, active hours, warm-up/search caps, proxy health, or LinkedIn session checks.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={reloadSearchJobs}
                  disabled={searchJobsLoading}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  {searchJobsLoading ? "Refreshing..." : "Refresh status"}
                </button>
                <a
                  href="/jobs?queue=searchScrape"
                  className="btn-secondary px-3 py-1.5 text-xs text-violet-400"
                >
                  Open Jobs
                </a>
                <button
                  type="button"
                  onClick={clearSearchJobs}
                  disabled={clearingSearchJobs || searchJobs.length === 0}
                  className="btn-secondary px-3 py-1.5 text-xs text-rose-400 disabled:opacity-40"
                >
                  {clearingSearchJobs ? "Clearing..." : "Clear history"}
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {searchJobs.length === 0 ? (
                <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-400">
                  No search URL jobs have been queued for this campaign yet.
                </div>
              ) : (
                searchJobs.slice(0, 5).map((job) => (
                  <div
                    key={job.id ?? `${job.timestamp}-${job.data.searchUrl}`}
                    className={`rounded-xl border p-3 ${
                      SEARCH_JOB_STYLES[job.state] ?? "border-slate-700 bg-slate-800/50 text-slate-300"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {searchJobLabel(job.state)}
                        {job.id ? ` · Job ${job.id}` : ""}
                      </p>
                      <p className="text-xs opacity-80">
                        Updated {fmtJobTime(job.finishedOn ?? job.processedOn ?? job.timestamp)}
                      </p>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px] opacity-80">
                      {job.data.source ?? "LINKEDIN"} · {job.data.searchUrl ?? "Search URL unavailable"}
                    </p>
                    <p className="mt-2 text-xs leading-5 opacity-90">
                      {searchJobDetail(job)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Bulk CSV import */}
        {showCsvImport && (
          <form
            onSubmit={handleImportCsv}
            className="mb-4 space-y-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4"
          >
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Paste CSV
              </label>
              <p className="mb-2 text-xs leading-5 text-slate-400">
                Required column: <code className="rounded bg-slate-800 px-1 font-mono">linkedinUrl</code>.
                Sales Navigator lead URLs are supported.
                Optional: <code className="rounded bg-slate-800 px-1 font-mono">firstName</code>,{" "}
                <code className="rounded bg-slate-800 px-1 font-mono">lastName</code>,{" "}
                <code className="rounded bg-slate-800 px-1 font-mono">company</code>,{" "}
                <code className="rounded bg-slate-800 px-1 font-mono">title</code>.
                All imported leads are added to this campaign.
              </p>
              <textarea
                required
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={"linkedinUrl,firstName,lastName,company,title\nhttps://www.linkedin.com/sales/lead/ACwAA...,Alice,Smith,Acme,CEO"}
                className="field w-full font-mono text-xs"
              />
            </div>
            {csvResult && (
              <div className={`rounded-xl border p-3 text-sm ${csvResult.errors.length > 0 ? "border-amber-500/30 bg-amber-500/10" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}`}>
                {csvResult.imported > 0 && (
                  <p className="font-semibold text-emerald-400">{csvResult.imported} lead{csvResult.imported !== 1 ? "s" : ""} imported.</p>
                )}
                {csvResult.errors.length > 0 && (
                  <ul className="mt-1 space-y-1 text-amber-300">
                    {csvResult.errors.map((e, i) => (
                      <li key={i} className="text-xs">Row {e.row}: {e.error}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <button type="submit" disabled={importingCsv} className="btn-primary">
              {importingCsv ? "Importing…" : "Import leads"}
            </button>
          </form>
        )}

        {/* Add search URL form (SCRAPE only) */}
        {showSearchForm && (
          <div className="mb-4 space-y-3 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-300">LinkedIn search URL</p>
              <button
                type="button"
                onClick={() => setShowUrlBuilder((v) => !v)}
                className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-300 hover:bg-violet-500/20"
              >
                {showUrlBuilder ? "Enter URL manually" : "Build URL"}
              </button>
            </div>

            {showUrlBuilder ? (
              <div className="space-y-3 rounded-xl border border-violet-500/20 bg-slate-900/60 p-4">
                <p className="text-xs text-slate-400">
                  Fill in the fields and click Apply — the search URL will be generated for you.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">Keywords</label>
                    <input
                      value={builderKeywords}
                      onChange={(e) => setBuilderKeywords(e.target.value)}
                      placeholder="e.g. doctor, software engineer"
                      className="field w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">Job title (optional)</label>
                    <input
                      value={builderTitle}
                      onChange={(e) => setBuilderTitle(e.target.value)}
                      placeholder="e.g. Medical Doctor, Cardiologist"
                      className="field w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">Location (optional)</label>
                    <select
                      value={builderLocation}
                      onChange={(e) => setBuilderLocation(e.target.value)}
                      className="field w-full"
                    >
                      <option value="">Any location</option>
                      {SEARCH_LOCATIONS.map((loc) => (
                        <option key={loc.geoUrn} value={loc.geoUrn}>{loc.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">Connection degree</label>
                    <select
                      value={builderNetwork}
                      onChange={(e) => setBuilderNetwork(e.target.value)}
                      className="field w-full"
                    >
                      <option value="SO">2nd &amp; 3rd+ degree (recommended)</option>
                      <option value="S">2nd degree only</option>
                      <option value="O">3rd+ degree only</option>
                      <option value="F">1st degree only</option>
                      <option value="">Any connection</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applyBuilder}
                  disabled={!builderKeywords.trim() && !builderTitle.trim()}
                  className="btn-primary"
                >
                  Apply — Generate URL
                </button>
              </div>
            ) : (
              <p className="text-xs leading-5 text-slate-400">
                Paste a LinkedIn people search URL or a Sales Navigator people
                search/list URL. The source controls which result layout Vectra
                extracts from.
              </p>
            )}

            <form onSubmit={handleAddSearchUrl} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">
                  Source
                </label>
                <select
                  value={searchSource}
                  onChange={(e) =>
                    setSearchSource(e.target.value as "LINKEDIN" | "SALES_NAVIGATOR")
                  }
                  className="field w-full"
                >
                  <option value="LINKEDIN">LinkedIn people search</option>
                  <option value="SALES_NAVIGATOR">Sales Navigator search/list</option>
                </select>
              </div>
              <input
                required
                value={searchUrl}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchUrl(value);
                  const detected = detectSearchSource(value);
                  if (detected) setSearchSource(detected);
                }}
                placeholder={
                  searchSource === "SALES_NAVIGATOR"
                    ? "https://www.linkedin.com/sales/search/people?query=..."
                    : "https://www.linkedin.com/search/results/people/?keywords=doctor&geoUrn=..."
                }
                className="field w-full font-mono text-xs"
              />
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">
                  Number of leads to import
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={searchLeadLimit}
                  onChange={(e) =>
                    setSearchLeadLimit(
                      Math.min(200, Math.max(1, parseInt(e.target.value, 10) || 1))
                    )
                  }
                  className="field w-full"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  LinkedIn shows 10 results per page — Vectra pages through search
                  results until it collects this many leads (up to 200).
                </p>
              </div>
              {searchUrl && detectSearchSource(searchUrl) && (
                <p className="text-xs text-slate-500">
                  Detected{" "}
                  <span className="font-semibold text-slate-300">
                    {detectSearchSource(searchUrl) === "SALES_NAVIGATOR"
                      ? "Sales Navigator"
                      : "LinkedIn people search"}
                  </span>{" "}
                  — source set automatically.
                </p>
              )}
              {searchError && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  {searchError}
                </p>
              )}
              <button type="submit" disabled={addingSearch} className="btn-primary">
                {addingSearch ? "Adding..." : "Add Search URL"}
              </button>
            </form>
          </div>
        )}

        {/* Add profile / lead form */}
        {showLeadForm && (
          <form
            onSubmit={handleAddLead}
            className="mb-4 space-y-3 rounded-2xl border border-white/[0.06] bg-slate-800/40 p-4"
          >
            {leadError && (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {leadError}
              </p>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                LinkedIn profile URL *
              </label>
              <input
                required
                value={leadUrl}
                onChange={(e) => setLeadUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/username"
                className="field w-full max-w-lg"
              />
            </div>
            {!isScrape && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "First name", val: leadFirst, set: setLeadFirst },
                  { label: "Last name", val: leadLast, set: setLeadLast },
                  { label: "Company", val: leadCompany, set: setLeadCompany },
                  { label: "Title", val: leadTitle, set: setLeadTitle },
                ].map(({ label, val, set }) => (
                  <input
                    key={label}
                    placeholder={label}
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    className="field"
                  />
                ))}
              </div>
            )}
            {isScrape && (
              <p className="text-xs text-slate-400">
                Name, title, and company will be filled in automatically after
                the scraper visits the profile.
              </p>
            )}
            <button
              type="submit"
              disabled={addingLead}
              className="btn-primary"
            >
              {addingLead
                ? "Adding..."
                : isScrape
                ? "Add Profile"
                : "Add Lead"}
            </button>
          </form>
        )}

        <div className="table-shell">
          <table className="min-w-full divide-y divide-white/[0.06]">
            <thead className="table-head">
              <tr>
                {(isScrape
                  ? ["Profile URL", "Name", "Company", "Title", "Status"]
                  : ["Name", "Company", "Connection", "Stage", "Replied", "Last Action", "Status"]
                ).map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {campaign.leads.length === 0 && (
                <tr>
                  <td
                    colSpan={isScrape ? 5 : 7}
                    className="px-6 py-10 text-center text-sm text-slate-400"
                  >
                    {isScrape
                      ? "No profiles yet - add a profile URL or a search URL above."
                      : campaign.type === "CONNECT"
                      ? 'No leads yet - add people you want to connect with.'
                      : isSequence
                      ? "No leads yet - add people to run through the sequence graph below."
                      : 'No leads yet - add connected contacts to message.'}
                  </td>
                </tr>
              )}
              {campaign.leads.map((cl) => (
                <tr key={cl.id} className="hover:bg-white/[0.03]">
                  {isScrape ? (
                    <>
                      <td className="table-cell">
                        <a
                          href={cl.lead.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs font-semibold text-teal-400 hover:underline"
                        >
                          {cl.lead.linkedinUrl.replace(
                            "https://www.linkedin.com/in/",
                            "/in/"
                          )}
                        </a>
                      </td>
                      <td className="table-cell text-slate-300">
                        {cl.lead.firstName || cl.lead.lastName
                          ? `${cl.lead.firstName ?? ""} ${cl.lead.lastName ?? ""}`.trim()
                          : <span className="italic text-slate-300">pending</span>}
                      </td>
                      <td className="table-cell text-slate-400">
                        {cl.lead.company ?? <span className="italic text-slate-300">pending</span>}
                      </td>
                      <td className="table-cell text-slate-400">
                        {cl.lead.title ?? <span className="italic text-slate-300">pending</span>}
                      </td>
                      <td className="table-cell">
                        <JobStatusBadge status={cl.jobStatus} error={cl.lastJobError} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="table-cell">
                        <a
                          href={cl.lead.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-teal-400 hover:underline"
                        >
                          {cl.lead.firstName || cl.lead.lastName
                            ? `${cl.lead.firstName ?? ""} ${cl.lead.lastName ?? ""}`.trim()
                            : "Unknown"}
                        </a>
                      </td>
                      <td className="table-cell text-slate-400">
                        {cl.lead.company ?? "-"}
                      </td>
                      <td className="table-cell">
                        <Badge value={cl.lead.connectionStatus} />
                        {campaign.type === "CONNECT" &&
                          cl.lead.connectionStatus === "CONNECTED" && (
                            <span className="ml-1 text-xs font-medium text-amber-400">
                              already connected
                            </span>
                          )}
                        {campaign.type === "MESSAGE" &&
                          cl.lead.connectionStatus !== "CONNECTED" && (
                            <span className="ml-1 text-xs font-medium text-red-500">
                              not connected
                            </span>
                          )}
                      </td>
                      <td className="table-cell text-slate-400">
                        {isSequence ? (
                          cl.currentStepId && stepById.get(cl.currentStepId) ? (
                            <div>
                              <p className="font-medium text-slate-300">
                                {STEP_TYPE_LABELS[stepById.get(cl.currentStepId)!.type]}
                              </p>
                              <p className="text-xs text-slate-500">
                                since{" "}
                                {cl.stepEnteredAt
                                  ? new Date(cl.stepEnteredAt).toLocaleDateString()
                                  : "-"}
                              </p>
                            </div>
                          ) : (
                            <span className="italic text-slate-500">graph complete</span>
                          )
                        ) : (
                          `Step ${cl.stage}`
                        )}
                      </td>
                      <td className="table-cell">
                        {cl.repliedAt ? (
                          <span className="font-semibold text-emerald-400">Yes</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="table-cell text-slate-400">
                        {cl.lastActionAt
                          ? new Date(cl.lastActionAt).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="table-cell">
                        <JobStatusBadge status={cl.jobStatus} error={cl.lastJobError} />
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {/* Post signal excerpts in dedicated rows to keep the table valid */}
              {isContentSignal && campaign.leads.map((cl) =>
                cl.postSignal ? (
                  <tr key={`${cl.id}-signal`} className="bg-teal-500/[0.04]">
                    <td colSpan={7} className="px-6 py-2">
                      <div className="flex items-start gap-2 rounded-2xl border border-teal-500/20 bg-teal-500/5 p-3 text-xs text-teal-300">
                        <span className="shrink-0 font-medium">Post:</span>
                        <span className="italic line-clamp-2">&quot;{cl.postSignal.excerpt}&quot;</span>
                        <a
                          href={cl.postSignal.postUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto shrink-0 font-semibold text-teal-400 hover:underline"
                        >
                          Open
                        </a>
                      </div>
                    </td>
                  </tr>
                ) : null
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sequence graph builder */}
      {isSequence && (
        <section>
          <div className="mb-4">
            <p className="page-kicker">Sequence</p>
            <h2 className="mt-1 text-xl font-semibold text-white">
              Sequence Graph
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              Drag steps from the palette onto the canvas, connect them, and
              configure each one. Connection request steps have two outputs —
              wire up what happens when a request is accepted vs. times out.
            </p>
          </div>
          <SequenceGraphBuilder
            campaignId={id}
            campaignStatus={campaign.status}
            initialSteps={campaign.steps ?? []}
            initialEdges={campaign.edges ?? []}
          />
        </section>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete campaign"
        description={`Delete "${campaign.name}"? This removes all leads and messages in this campaign and cannot be undone.`}
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
