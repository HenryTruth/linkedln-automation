"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type CampaignDetail, type Lead } from "@/lib/api";
import { Badge } from "@/components/Badge";
import { SequenceBuilder } from "@/components/SequenceBuilder";
import { ContentSignalPanel } from "@/components/ContentSignalPanel";

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
  return null;
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [startResult, setStartResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLimit, setEditLimit] = useState(10);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
  const [addingSearch, setAddingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearchForm, setShowSearchForm] = useState(false);

  function reload() {
    return api.campaigns.get(id).then(setCampaign);
  }

  useEffect(() => {
    reload()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function startEditing() {
    setEditName(campaign!.name);
    setEditLimit(campaign!.dailyLimit);
    setEditing(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.campaigns.update(id, {
        name: editName,
        dailyLimit: editLimit,
      });
      setCampaign((prev) => prev && { ...prev, name: updated.name, dailyLimit: updated.dailyLimit });
      setEditing(false);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${campaign!.name}"? This removes all leads and messages in this campaign and cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.campaigns.delete(id);
      router.push("/campaigns");
    } catch (e) {
      alert((e as Error).message);
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
      alert((e as Error).message);
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
    try {
      await api.campaigns.addSearchUrl(id, searchUrl);
      setSearchUrl("");
      setShowSearchForm(false);
      await reload();
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setAddingSearch(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;
  if (error || !campaign)
    return <p className="text-sm text-red-600">{error ?? "Not found"}</p>;

  const isMessage = campaign.type === "MESSAGE";
  const isScrape = campaign.type === "SCRAPE";
  const isContentSignal = campaign.type === "CONTENT_SIGNAL";

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="app-panel p-6 lg:p-8">
        <button
          onClick={() => router.push("/campaigns")}
          className="mb-4 text-sm font-semibold text-slate-500 hover:text-slate-950"
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
                  <label className="text-xs font-semibold text-slate-500">Daily limit</label>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={editLimit}
                    onChange={(e) => setEditLimit(Number(e.target.value))}
                    className="field w-20"
                  />
                </div>
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
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:border-teal-200 hover:text-teal-700"
                  >
                    Edit
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Badge value={campaign.type} />
                  <Badge value={campaign.status} />
                  <span className="text-sm font-medium text-slate-500">
                    {campaign.leads.length} lead
                    {campaign.leads.length !== 1 ? "s" : ""} -{" "}
                    {campaign.dailyLimit}/day limit
                  </span>
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
              onClick={handleDelete}
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
                ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {startResult.ok ? "OK " : "Error "}
            {startResult.msg}
          </div>
        )}
      </section>

      {/* Content Signal config + post signal list */}
      {isContentSignal && (
        <section>
          <div className="mb-4">
            <p className="page-kicker">Signal targeting</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Content Signal Targeting
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
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

      {/* Message sequence builder (MESSAGE campaigns only) */}
      {isMessage && (
        <section>
          <div className="mb-4">
            <p className="page-kicker">Sequence</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Message Sequence
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Drag steps to reorder them. Click Edit to change content or
              delays. Each step fires after its delay has passed since the
              previous one.
            </p>
          </div>
          <SequenceBuilder
            campaignId={id}
            initialMessages={campaign.messages}
          />
        </section>
      )}

      {/* Profiles / Leads section */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="page-kicker">Audience</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              {isScrape ? "Profiles to Scrape" : "Leads"}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
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
                  <span className="font-semibold text-slate-700">
                    not yet connected with
                  </span>{" "}
                  - already-connected profiles will be skipped.
                </>
              ) : (
                <>
                  Connected contacts to message. Only people who have{" "}
                  <span className="font-semibold text-slate-700">
                    accepted your connection
                  </span>{" "}
                  can receive messages - unconnected profiles will be skipped.
                </>
              )}
            </p>
          </div>

          <div className="flex gap-2">
            {isScrape && (
              <button
                onClick={() => {
                  setShowSearchForm((v) => !v);
                  setShowLeadForm(false);
                }}
                className="btn-secondary px-3 py-1.5 text-violet-700"
              >
                {showSearchForm ? "Cancel" : "Search URL"}
              </button>
            )}
            <button
              onClick={() => {
                setShowLeadForm((v) => !v);
                setShowSearchForm(false);
              }}
              className="btn-secondary px-3 py-1.5 text-teal-700"
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
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <span className="mt-0.5 text-sm font-semibold text-amber-700">Warning:</span>
            <div className="flex-1 text-sm text-amber-800">{leadWarning}</div>
            <button
              onClick={() => setLeadWarning(null)}
              className="text-xs font-semibold text-amber-600 hover:text-amber-800"
            >
              Close
            </button>
          </div>
        )}

        {/* Add search URL form (SCRAPE only) */}
        {showSearchForm && (
          <form
            onSubmit={handleAddSearchUrl}
            className="mb-4 space-y-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4"
          >
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                LinkedIn search URL
              </label>
              <p className="mb-2 text-xs leading-5 text-slate-500">
                Go to LinkedIn to search for people to copy the URL from the
                address bar. The scraper will crawl through the results pages
                and save every profile it finds.
              </p>
              <input
                required
                value={searchUrl}
                onChange={(e) => setSearchUrl(e.target.value)}
                placeholder="https://www.linkedin.com/search/results/people/?keywords=CEO+SaaS+London"
                className="field w-full font-mono"
              />
            </div>
            {searchError && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {searchError}
              </p>
            )}
            <button
              type="submit"
              disabled={addingSearch}
              className="btn-primary"
            >
              {addingSearch ? "Adding..." : "Add Search URL"}
            </button>
          </form>
        )}

        {/* Add profile / lead form */}
        {showLeadForm && (
          <form
            onSubmit={handleAddLead}
            className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
          >
            {leadError && (
              <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                {leadError}
              </p>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
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
              <p className="text-xs text-slate-500">
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
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="table-head">
              <tr>
                {(isScrape
                  ? ["Profile URL", "Name", "Company", "Title", "Stage"]
                  : ["Name", "Company", "Connection", "Stage", "Replied", "Last Action"]
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
            <tbody className="divide-y divide-slate-100">
              {campaign.leads.length === 0 && (
                <tr>
                  <td
                    colSpan={isScrape ? 5 : 6}
                    className="px-6 py-10 text-center text-sm text-slate-400"
                  >
                    {isScrape
                      ? "No profiles yet - add a profile URL or a search URL above."
                      : campaign.type === "CONNECT"
                      ? 'No leads yet - add people you want to connect with.'
                      : 'No leads yet - add connected contacts to message.'}
                  </td>
                </tr>
              )}
              {campaign.leads.map((cl) => (
                <tr key={cl.id} className="hover:bg-slate-50/80">
                  {isScrape ? (
                    <>
                      <td className="table-cell">
                        <a
                          href={cl.lead.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs font-semibold text-teal-700 hover:underline"
                        >
                          {cl.lead.linkedinUrl.replace(
                            "https://www.linkedin.com/in/",
                            "/in/"
                          )}
                        </a>
                      </td>
                      <td className="table-cell text-slate-700">
                        {cl.lead.firstName || cl.lead.lastName
                          ? `${cl.lead.firstName ?? ""} ${cl.lead.lastName ?? ""}`.trim()
                          : <span className="italic text-slate-300">pending</span>}
                      </td>
                      <td className="table-cell text-slate-600">
                        {cl.lead.company ?? <span className="italic text-slate-300">pending</span>}
                      </td>
                      <td className="table-cell text-slate-600">
                        {cl.lead.title ?? <span className="italic text-slate-300">pending</span>}
                      </td>
                      <td className="table-cell text-slate-600">
                        Step {cl.stage}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="table-cell">
                        <a
                          href={cl.lead.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-teal-700 hover:underline"
                        >
                          {cl.lead.firstName || cl.lead.lastName
                            ? `${cl.lead.firstName ?? ""} ${cl.lead.lastName ?? ""}`.trim()
                            : "Unknown"}
                        </a>
                      </td>
                      <td className="table-cell text-slate-600">
                        {cl.lead.company ?? "-"}
                      </td>
                      <td className="table-cell">
                        <Badge value={cl.lead.connectionStatus} />
                        {campaign.type === "CONNECT" &&
                          cl.lead.connectionStatus === "CONNECTED" && (
                            <span className="ml-1 text-xs font-medium text-amber-600">
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
                      <td className="table-cell text-slate-600">
                        Step {cl.stage}
                      </td>
                      <td className="table-cell">
                        {cl.repliedAt ? (
                          <span className="font-semibold text-emerald-600">Yes</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="table-cell text-slate-400">
                        {cl.lastActionAt
                          ? new Date(cl.lastActionAt).toLocaleDateString()
                          : "-"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {/* Post signal excerpts in dedicated rows to keep the table valid */}
              {isContentSignal && campaign.leads.map((cl) =>
                cl.postSignal ? (
                  <tr key={`${cl.id}-signal`} className="bg-teal-50/40">
                    <td colSpan={6} className="px-6 py-2">
                      <div className="flex items-start gap-2 rounded-2xl border border-teal-100 bg-teal-50 p-3 text-xs text-teal-800">
                        <span className="shrink-0 font-medium">Post:</span>
                        <span className="italic line-clamp-2">&quot;{cl.postSignal.excerpt}&quot;</span>
                        <a
                          href={cl.postSignal.postUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto shrink-0 font-semibold text-teal-700 hover:underline"
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
    </div>
  );
}
