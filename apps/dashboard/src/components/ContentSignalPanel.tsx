"use client";

import { useEffect, useState } from "react";
import { api, type ContentSignalConfig, type ContentSignalJob, type PostSignal } from "@/lib/api";

const LOCATIONS: { label: string; geoUrn: string }[] = [
  { label: "United States",        geoUrn: "103644278" },
  { label: "United Kingdom",       geoUrn: "101165590" },
  { label: "Canada",               geoUrn: "101174742" },
  { label: "Australia",            geoUrn: "101452733" },
  { label: "Ireland",              geoUrn: "104738515" },
  { label: "New Zealand",          geoUrn: "105490917" },
  { label: "India",                geoUrn: "102713980" },
  { label: "Singapore",            geoUrn: "102454443" },
  { label: "United Arab Emirates", geoUrn: "104305776" },
  { label: "South Africa",         geoUrn: "104035573" },
  { label: "Germany",              geoUrn: "101282230" },
  { label: "France",               geoUrn: "105015875" },
  { label: "Netherlands",          geoUrn: "102890719" },
  { label: "Sweden",               geoUrn: "105117694" },
  { label: "Switzerland",          geoUrn: "106693272" },
  { label: "Belgium",              geoUrn: "100565514" },
  { label: "Spain",                geoUrn: "105646813" },
  { label: "Italy",                geoUrn: "103350119" },
  { label: "Brazil",               geoUrn: "106057199" },
  { label: "Mexico",               geoUrn: "103323778" },
  { label: "Israel",               geoUrn: "101620260" },
  { label: "Japan",                geoUrn: "101355337" },
  { label: "South Korea",          geoUrn: "105149562" },
];

const SIGNALS_LIMIT = 20;

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "last week";
  return `${Math.floor(d / 7)} weeks ago`;
}

const JOB_STYLES: Record<string, string> = {
  waiting: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  active: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  delayed: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  failed: "border-red-500/30 bg-red-500/10 text-red-300",
};

function jobLabel(state: string) {
  if (state === "waiting") return "Queued";
  if (state === "active") return "Scraping now";
  if (state === "delayed") return "Waiting to retry";
  if (state === "completed") return "Completed";
  if (state === "failed") return "Failed";
  return state;
}

function jobTime(value: number | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function jobProgress(job: ContentSignalJob) {
  if (typeof job.progress !== "object" || job.progress === null) {
    const target = job.data.maxLeads ?? 0;
    return {
      pct: typeof job.progress === "number" ? Math.min(100, Math.max(0, job.progress)) : 0,
      label: target ? `Queued for up to ${target} leads` : "Waiting for worker",
      collected: 0,
      skipped: 0,
    };
  }

  const page = job.progress.page ?? 0;
  const maxPages = job.progress.maxPages ?? 1;
  const startPage = job.progress.startPage ?? job.data.startPage ?? 1;
  const endPage = job.progress.endPage ?? maxPages;
  const collected = job.progress.collected ?? 0;
  const skipped = job.progress.skipped ?? 0;
  const scanned = job.progress.scanned ?? collected + skipped;
  const leadLimit = job.progress.leadLimit ?? job.data.maxLeads;
  const phase = job.progress.phase?.replace(/_/g, " ") ?? "working";
  const batchSize = Math.max(1, endPage - startPage + 1);
  const pagePct = ((Math.max(startPage, page) - startPage + 1) / batchSize) * 100;
  const leadPct = leadLimit ? (collected / leadLimit) * 100 : pagePct;
  const pct = job.state === "completed"
    ? 100
    : Math.min(100, Math.max(0, Math.round(Math.max(pagePct, leadPct))));

  return {
    pct,
    collected,
    skipped,
    scanned,
    label: `${phase} · page ${page} of ${endPage} · ${collected}${leadLimit ? ` / ${leadLimit}` : ""} leads · ${scanned} scanned`,
  };
}

function jobDetail(job: ContentSignalJob) {
  if (job.state === "waiting") {
    return "Accepted. The content scraper will start as soon as a worker is available.";
  }
  if (job.state === "active") {
    return "Browser automation is searching LinkedIn posts and collecting matching authors.";
  }
  if (job.state === "delayed") {
    return "The job is delayed, usually while BullMQ waits before retrying.";
  }
  if (job.state === "completed") {
    const progress = jobProgress(job);
    return `Scrape finished with ${progress.collected} collected, ${progress.skipped} skipped, and ${progress.scanned} scanned. Refresh if new leads are not visible yet.`;
  }
  if (job.state === "failed") {
    return job.failedReason ?? "The content scrape failed. Open Jobs for the full payload and error.";
  }
  return "Content scrape job recorded.";
}

interface ContentSignalPanelProps {
  campaignId: string;
  initialConfig?: ContentSignalConfig | null;
}

export function ContentSignalPanel({
  campaignId,
  initialConfig,
}: ContentSignalPanelProps) {
  const [config, setConfig] = useState<ContentSignalConfig | null>(
    initialConfig ?? null
  );
  const [signals, setSignals] = useState<PostSignal[]>([]);
  const [signalsTotal, setSignalsTotal] = useState(0);
  const [signalsPage, setSignalsPage] = useState(1);
  const [loadingSignals, setLoadingSignals] = useState(false);
  const [jobs, setJobs] = useState<ContentSignalJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  // Config form state
  const [keyword, setKeyword] = useState(initialConfig?.keyword ?? "");
  const [dateRange, setDateRange] = useState(initialConfig?.dateRangeDays ?? 7);
  const [maxLeads, setMaxLeads] = useState(initialConfig?.maxLeads ?? 50);
  const [maxPagesPerRun, setMaxPagesPerRun] = useState(initialConfig?.maxPagesPerRun ?? 3);
  const [titleFilter, setTitleFilter] = useState(initialConfig?.titleFilter ?? "");
  const [companyFilter, setCompanyFilter] = useState(initialConfig?.companyFilter ?? "");
  const [locationFilter, setLocationFilter] = useState(initialConfig?.locationFilter ?? "");
  const [connectionNote, setConnectionNote] = useState(
    initialConfig?.connectionNoteTemplate ??
      "Hi {{firstName}}, I came across your post on {{postTopic}} from {{postDate}} — great perspective. Would love to connect and follow your content."
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Run state
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  function reloadSignals() {
    setLoadingSignals(true);
    return api.contentSignal
      .getSignals(campaignId, { page: signalsPage, limit: SIGNALS_LIMIT })
      .then((result) => {
        setSignals(result.signals);
        setSignalsTotal(result.total);
      })
      .catch(() => {})
      .finally(() => setLoadingSignals(false));
  }

  useEffect(() => {
    void reloadSignals();
  }, [campaignId, signalsPage]);

  function reloadJobs() {
    setJobsLoading(true);
    return api.contentSignal
      .jobs(campaignId)
      .then((result) => setJobs(result.jobs))
      .catch(() => {})
      .finally(() => setJobsLoading(false));
  }

  useEffect(() => {
    void reloadJobs();
  }, [campaignId]);

  useEffect(() => {
    const hasActiveJob = jobs.some((job) =>
      ["waiting", "active", "delayed"].includes(job.state)
    );
    if (!hasActiveJob) return;
    const id = window.setInterval(() => {
      void reloadJobs();
      void reloadSignals();
    }, 4_000);
    return () => window.clearInterval(id);
  }, [campaignId, jobs]);

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await api.contentSignal.saveConfig(campaignId, {
        keyword,
        dateRangeDays: dateRange,
        maxLeads,
        maxPagesPerRun,
        titleFilter: titleFilter || null,
        companyFilter: companyFilter || null,
        locationFilter: locationFilter || null,
        connectionNoteTemplate: connectionNote.trim() || null,
      });
      setConfig(updated);
      setSaved(true);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetCursor() {
    setRunning(true);
    setRunResult(null);
    try {
      const updated = await api.contentSignal.resetCursor(campaignId);
      setConfig(updated);
      setRunResult("Search cursor reset. The next scrape will start from page 1.");
    } catch (e) {
      setRunResult(`Error: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  async function handleRun() {
    if (!config) return;
    setRunning(true);
    setRunResult(null);
    try {
      const result = await api.contentSignal.run(campaignId);
      setRunResult(
        `Scrape job queued for keyword "${result.keyword}" from page ${result.startPage} to ${result.startPage + result.pageCount - 1}${result.jobId ? ` (job ${result.jobId})` : ""}.`
      );
      await reloadJobs();
      setTimeout(() => {
        void reloadSignals();
        void reloadJobs();
      }, 3000);
    } catch (e) {
      setRunResult(`Error: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Config form */}
      <div className="rounded-2xl border border-teal-500/30 bg-teal-500/5 p-5">
        <h3 className="mb-1 text-sm font-semibold text-teal-300">
          Keyword Configuration
        </h3>
        <p className="mb-4 text-xs leading-5 text-slate-400">
          The scraper will search LinkedIn posts for this keyword, extract the
          authors, and add them as leads. Connection requests will reference
          their post using{" "}
          <code className="rounded bg-slate-800 px-1 text-teal-300">{"{{postTopic}}"}</code>,{" "}
          <code className="rounded bg-slate-800 px-1 text-teal-300">{"{{postExcerpt}}"}</code>,{" "}
          <code className="rounded bg-slate-800 px-1 text-teal-300">{"{{postDate}}"}</code>.
        </p>

        <form onSubmit={handleSaveConfig} className="space-y-4">
          {saveError && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {saveError}
            </div>
          )}
          {saved && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              Config saved.
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">
              Keyword / phrase *
            </label>
            <input
              required
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="e.g. AI automation, outbound sales, SaaS growth"
              className="field w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Post age limit (days)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={dateRange}
                onChange={(e) => setDateRange(Number(e.target.value))}
                className="field w-full"
              />
              <p className="mt-1 text-xs text-slate-500">
                Skip posts older than this
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Max leads to collect
              </label>
              <input
                type="number"
                min={1}
                max={200}
                value={maxLeads}
                onChange={(e) => setMaxLeads(Number(e.target.value))}
                className="field w-full"
              />
            </div>
          </div>

          <div className="grid gap-4 rounded-2xl border border-white/[0.06] bg-slate-950/30 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Pages per run
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={maxPagesPerRun}
                onChange={(e) => setMaxPagesPerRun(Number(e.target.value))}
                className="field w-full"
              />
              <p className="mt-1 text-xs text-slate-500">
                Max 10 pages per scrape session.
              </p>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-300">
                Next scrape starts
              </p>
              <div className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-200">
                Page {config?.nextPageToScrape ?? 1}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Successful runs advance this automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetCursor}
              disabled={running || !config}
              className="btn-secondary px-3 py-2 text-xs"
            >
              Reset to page 1
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Title filter (optional)
              </label>
              <input
                value={titleFilter}
                onChange={(e) => setTitleFilter(e.target.value)}
                placeholder="e.g. Founder, Head of Sales"
                className="field w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Company filter (optional)
              </label>
              <input
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                placeholder="e.g. Salesforce, startup"
                className="field w-full"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">
              Location (optional)
            </label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="field w-full"
            >
              <option value="">All locations</option>
              {LOCATIONS.map((loc) => (
                <option key={loc.geoUrn} value={loc.geoUrn}>
                  {loc.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Filters LinkedIn search results to post authors in this country.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">
              Connection note template{" "}
              <span className="font-normal text-slate-500">
                (max 300 chars — must include{" "}
                <code className="rounded bg-slate-800 px-1 text-teal-300">{"{{postTopic}}"}</code>,{" "}
                <code className="rounded bg-slate-800 px-1 text-teal-300">{"{{postExcerpt}}"}</code>,{" "}
                or{" "}
                <code className="rounded bg-slate-800 px-1 text-teal-300">{"{{postDate}}"}</code>)
              </span>
            </label>
            <textarea
              rows={3}
              maxLength={300}
              value={connectionNote}
              onChange={(e) => setConnectionNote(e.target.value)}
              className="field w-full font-mono text-xs"
            />
            <p className="mt-1 text-right text-xs text-slate-500">
              {connectionNote.length}/300
            </p>
            <p className="text-xs text-slate-500">
              Leave blank to collect leads without auto-sending connection requests.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="btn-primary"
            >
              {saving ? "Saving..." : "Save Config"}
            </button>
            <button
              type="button"
              onClick={handleRun}
              disabled={running || !config}
              title={!config ? "Save config first" : "Run a scrape job now"}
              className="btn-secondary text-teal-400"
            >
              {running ? "Queuing..." : "Run Now"}
            </button>
            {config?.lastScrapedAt && (
              <span className="text-xs text-slate-500">
                Last run: {relativeDate(config.lastScrapedAt)}
              </span>
            )}
          </div>
        </form>

        {runResult && (
          <div
            className={`mt-3 rounded-2xl p-3 text-sm ${
              runResult.startsWith("Error")
                ? "border border-red-500/30 bg-red-500/10 text-red-400"
                : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            }`}
          >
            {runResult}
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-white/[0.08] bg-slate-950/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Scrape progress
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Tracks the current Content Signal queue job from accepted to finished.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={reloadJobs}
                disabled={jobsLoading}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                {jobsLoading ? "Refreshing..." : "Refresh"}
              </button>
              <a
                href="/jobs?queue=contentSignal"
                className="btn-secondary px-3 py-1.5 text-xs text-violet-400"
              >
                Open Jobs
              </a>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {jobs.length === 0 ? (
              <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-400">
                No content scrape jobs have been queued for this campaign yet.
              </div>
            ) : (
              jobs.slice(0, 3).map((job) => {
                const progress = jobProgress(job);
                return (
                  <div
                    key={job.id ?? `${job.timestamp}-${job.data.keyword}`}
                    className={`rounded-xl border p-3 ${
                      JOB_STYLES[job.state] ?? "border-slate-700 bg-slate-800/50 text-slate-300"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {jobLabel(job.state)}
                        {job.id ? ` · Job ${job.id}` : ""}
                      </p>
                      <p className="text-xs opacity-80">
                        Updated {jobTime(job.finishedOn ?? job.processedOn ?? job.timestamp)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs opacity-80">
                      Keyword: <span className="font-semibold">{job.data.keyword ?? keyword}</span>
                    </p>
                    {["waiting", "active", "delayed", "completed"].includes(job.state) && (
                      <div className="mt-3">
                        <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-semibold opacity-90">
                          <span>{progress.label}</span>
                          <span>{progress.pct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-950/50">
                          <div
                            className="h-full rounded-full bg-teal-400 transition-all"
                            style={{ width: `${progress.pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                    <p className="mt-2 text-xs leading-5 opacity-90">
                      {jobDetail(job)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Post signals collected */}
      <div>
        <h3 className="mb-3 text-base font-semibold text-white">
          Collected Post Signals
          {signalsTotal > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-400">
              {signalsTotal} post{signalsTotal === 1 ? "" : "s"}
            </span>
          )}
        </h3>

        {loadingSignals && (
          <p className="text-sm text-slate-400">Loading...</p>
        )}

        {!loadingSignals && signals.length === 0 && (
          <div className="app-panel border-dashed p-8 text-center text-sm text-slate-400">
            No posts collected yet. Save a config and click &quot;Run Now&quot; to start
            scraping.
          </div>
        )}

        <div className="space-y-3">
          {signals.map((sig) => (
            <div
              key={sig.id}
              className="app-panel flex gap-4 p-4"
            >
              {/* Signal context panel (per plan) */}
              <div className="w-48 shrink-0 space-y-1 rounded-2xl border border-white/[0.06] bg-slate-950/40 p-3 text-xs">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Signal Context
                </p>
                <p>
                  <span className="text-slate-400">Keyword:</span>{" "}
                  <span className="font-medium text-slate-300">
                    &quot;{sig.keyword}&quot;
                  </span>
                </p>
                <p>
                  <span className="text-slate-400">Posted:</span>{" "}
                  {relativeDate(sig.publishedAt)}
                </p>
                <a
                  href={sig.postUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block font-semibold text-teal-400 hover:underline"
                >
                  View original post
                </a>
              </div>

              {/* Author + excerpt */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <a
                      href={sig.lead.linkedinUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-teal-400 hover:underline"
                    >
                      {sig.lead.firstName || sig.lead.lastName
                        ? `${sig.lead.firstName ?? ""} ${sig.lead.lastName ?? ""}`.trim()
                        : "Unknown"}
                    </a>
                    {(sig.lead.title || sig.lead.company) && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {sig.lead.title}
                        {sig.lead.title && sig.lead.company ? " at " : ""}
                        {sig.lead.company}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">
                    {new Date(sig.scrapedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="line-clamp-3 text-sm italic text-slate-400">
                  &quot;{sig.excerpt}&quot;
                </p>
              </div>
            </div>
          ))}
        </div>

        {signalsTotal > SIGNALS_LIMIT && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-slate-900/60 p-3 text-sm text-slate-300">
            <span>
              Showing {(signalsPage - 1) * SIGNALS_LIMIT + 1}-
              {Math.min(signalsPage * SIGNALS_LIMIT, signalsTotal)} of {signalsTotal}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSignalsPage((page) => Math.max(1, page - 1))}
                disabled={signalsPage <= 1}
                className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-xs text-slate-400">
                Page {signalsPage} of {Math.max(1, Math.ceil(signalsTotal / SIGNALS_LIMIT))}
              </span>
              <button
                type="button"
                onClick={() =>
                  setSignalsPage((page) =>
                    Math.min(Math.max(1, Math.ceil(signalsTotal / SIGNALS_LIMIT)), page + 1)
                  )
                }
                disabled={signalsPage >= Math.ceil(signalsTotal / SIGNALS_LIMIT)}
                className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
