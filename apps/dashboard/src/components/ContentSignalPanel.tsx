"use client";

import { useEffect, useState } from "react";
import { api, type ContentSignalConfig, type PostSignal } from "@/lib/api";

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

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "last week";
  return `${Math.floor(d / 7)} weeks ago`;
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
  const [loadingSignals, setLoadingSignals] = useState(false);

  // Config form state
  const [keyword, setKeyword] = useState(initialConfig?.keyword ?? "");
  const [dateRange, setDateRange] = useState(initialConfig?.dateRangeDays ?? 7);
  const [maxLeads, setMaxLeads] = useState(initialConfig?.maxLeads ?? 50);
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

  useEffect(() => {
    setLoadingSignals(true);
    api.contentSignal
      .getSignals(campaignId)
      .then(setSignals)
      .catch(() => {})
      .finally(() => setLoadingSignals(false));
  }, [campaignId]);

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

  async function handleRun() {
    if (!config) return;
    setRunning(true);
    setRunResult(null);
    try {
      const result = await api.contentSignal.run(campaignId);
      setRunResult(
        `Scrape job queued for keyword "${result.keyword}". Results will appear below once the worker completes.`
      );
      // Refresh signals after a short delay
      setTimeout(() => {
        api.contentSignal.getSignals(campaignId).then(setSignals).catch(() => {});
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
      <div className="app-panel border-teal-200 bg-teal-50/70 p-5">
        <h3 className="mb-1 text-sm font-semibold text-teal-950">
          Keyword Configuration
        </h3>
        <p className="mb-4 text-xs leading-5 text-teal-800">
          The scraper will search LinkedIn posts for this keyword, extract the
          authors, and add them as leads. Connection requests will reference
          their post using{" "}
          <code className="rounded bg-teal-100 px-1">{"{{postTopic}}"}</code>,{" "}
          <code className="rounded bg-teal-100 px-1">{"{{postExcerpt}}"}</code>,{" "}
          <code className="rounded bg-teal-100 px-1">{"{{postDate}}"}</code>.
        </p>

        <form onSubmit={handleSaveConfig} className="space-y-4">
          {saveError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {saveError}
            </div>
          )}
          {saved && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              Config saved.
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-900">
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
              <label className="mb-1 block text-xs font-semibold text-slate-900">
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
              <p className="mt-1 text-xs text-slate-700">
                Skip posts older than this
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-900">
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-900">
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
              <label className="mb-1 block text-xs font-semibold text-slate-900">
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
            <label className="mb-1 block text-xs font-semibold text-slate-900">
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
            <p className="mt-1 text-xs text-slate-700">
              Filters LinkedIn search results to post authors in this country.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-900">
              Connection note template{" "}
              <span className="font-normal text-slate-700">
                (max 300 chars — must include{" "}
                <code className="rounded bg-teal-100 px-1">{"{{postTopic}}"}</code>,{" "}
                <code className="rounded bg-teal-100 px-1">{"{{postExcerpt}}"}</code>,{" "}
                or{" "}
                <code className="rounded bg-teal-100 px-1">{"{{postDate}}"}</code>)
              </span>
            </label>
            <textarea
              rows={3}
              maxLength={300}
              value={connectionNote}
              onChange={(e) => setConnectionNote(e.target.value)}
              className="field w-full font-mono text-xs"
            />
            <p className="mt-1 text-right text-xs text-slate-600">
              {connectionNote.length}/300
            </p>
            <p className="text-xs text-slate-700">
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
              className="btn-secondary text-teal-700"
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
                ? "bg-red-50 border border-red-200 text-red-700"
                : "bg-emerald-50 border border-emerald-200 text-emerald-700"
            }`}
          >
            {runResult}
          </div>
        )}
      </div>

      {/* Post signals collected */}
      <div>
        <h3 className="mb-3 text-base font-semibold text-slate-950">
          Collected Post Signals
          {signals.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-400">
              {signals.length} posts
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
              <div className="w-48 shrink-0 space-y-1 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  Signal Context
                </p>
                <p>
                  <span className="text-slate-400">Keyword:</span>{" "}
                  <span className="font-medium text-slate-700">
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
                  className="mt-1 inline-block font-semibold text-teal-700 hover:underline"
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
                      className="text-sm font-semibold text-teal-700 hover:underline"
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
                <p className="line-clamp-3 text-sm italic text-slate-600">
                  &quot;{sig.excerpt}&quot;
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
