"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, type Lead, type Campaign } from "@/lib/api";
import { Badge } from "@/components/Badge";
import { SkeletonTableRows } from "@/components/Skeleton";

const STATUS_OPTIONS = ["", "NONE", "PENDING", "CONNECTED", "WITHDRAWN"];
const LIMIT_OPTIONS = [25, 50, 100];

interface ParsedLead {
  linkedinUrl: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
}

function parseCsv(raw: string): ParsedLead[] {
  const lines = raw.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0]
    .toLowerCase()
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""));

  const get = (row: string[], ...keys: string[]) => {
    for (const k of keys) {
      const i = headers.indexOf(k);
      if (i !== -1) return (row[i] ?? "").replace(/^"|"$/g, "").trim();
    }
    return "";
  };

  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(",");
      return {
        linkedinUrl: get(
          cols,
          "url",
          "linkedinurl",
          "linkedin_url",
          "linkedin url",
          "profile url",
          "profileurl"
        ),
        firstName: get(cols, "firstname", "first_name", "first name"),
        lastName: get(cols, "lastname", "last_name", "last name"),
        company: get(cols, "company", "organization"),
        title: get(cols, "title", "jobtitle", "job title", "job_title"),
      };
    })
    .filter((r) => r.linkedinUrl.startsWith("http"));
}

export default function LeadsPage() {
  // Table state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);

  // Filters
  const [status, setStatus] = useState("");
  const [company, setCompany] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [keyword, setKeyword] = useState("");

  // Add-single form
  const [tab, setTab] = useState<"single" | "csv">("single");
  const [sUrl, setSUrl] = useState("");
  const [sFirst, setSFirst] = useState("");
  const [sLast, setSLast] = useState("");
  const [sCompany, setSCompany] = useState("");
  const [sTitle, setSTitle] = useState("");
  const [sCampaign, setSCampaign] = useState("");
  const [addingOne, setAddingOne] = useState(false);
  const [addOneError, setAddOneError] = useState<string | null>(null);
  const [addOneSuccess, setAddOneSuccess] = useState(false);

  // Bulk CSV form
  const [csvText, setCsvText] = useState("");
  const [csvCampaign, setCsvCampaign] = useState("");
  const [csvParsed, setCsvParsed] = useState<ParsedLead[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<
    Array<{ row: number; error: string }>
  >([]);

  const fetchLeads = useCallback(() => {
    setLoading(true);
    setTableError(null);
    api.leads
      .list({
        status: status || undefined,
        company: company || undefined,
        campaignId: campaignId || undefined,
        keyword: keyword || undefined,
        page,
        limit,
      })
      .then((r) => {
        setLeads(r.leads);
        setTotal(r.total);
      })
      .catch((e: Error) => setTableError(e.message))
      .finally(() => setLoading(false));
  }, [status, company, campaignId, keyword, page, limit]);

  useEffect(() => {
    api.campaigns.list().then(setCampaigns).catch(() => {});
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  async function handleAddOne(e: React.FormEvent) {
    e.preventDefault();
    setAddingOne(true);
    setAddOneError(null);
    setAddOneSuccess(false);
    try {
      await api.leads.create({
        linkedinUrl: sUrl,
        firstName: sFirst || undefined,
        lastName: sLast || undefined,
        company: sCompany || undefined,
        title: sTitle || undefined,
        campaignId: sCampaign || undefined,
      });
      setSUrl("");
      setSFirst("");
      setSLast("");
      setSCompany("");
      setSTitle("");
      setAddOneSuccess(true);
      fetchLeads();
    } catch (err) {
      setAddOneError((err as Error).message);
    } finally {
      setAddingOne(false);
    }
  }

  function handleCsvChange(text: string) {
    setCsvText(text);
    setCsvParsed(parseCsv(text));
    setImportResult(null);
    setImportErrors([]);
  }

  function handleCsvFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => handleCsvChange(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function handleBulkImport() {
    if (csvParsed.length === 0) return;
    setImporting(true);
    setImportResult(null);
    setImportErrors([]);
    try {
      const result = await api.leads.importCsv({
        csvText,
        campaignId: csvCampaign || undefined,
      });
      setCsvText("");
      setCsvParsed([]);
      setImportErrors(result.errors);
      setImportResult(
        `Imported ${result.imported} lead${result.imported !== 1 ? "s" : ""}: ${result.created} created, ${result.updated} updated${
          result.attached > 0 ? `, ${result.attached} attached to campaign` : ""
        }${result.skipped > 0 ? `, ${result.skipped} skipped` : ""}.`
      );
      fetchLeads();
    } catch (err) {
      setImportErrors([{ row: 0, error: (err as Error).message }]);
    } finally {
      setImporting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(total, page * limit);

  useEffect(() => {
    if (!loading && total > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [loading, page, total, totalPages]);

  const pagination = (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-slate-950/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold text-slate-300">
        Showing {rangeStart}-{rangeEnd} of {total} lead{total === 1 ? "" : "s"}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={limit}
          onChange={(e) => {
            setLimit(Number(e.target.value));
            setPage(1);
          }}
          className="field py-1.5 text-xs"
          aria-label="Leads per page"
        >
          {LIMIT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} / page
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setPage(1)}
          disabled={page === 1}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
        >
          First
        </button>
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Previous
        </button>
        <span className="min-w-24 text-center text-sm font-semibold text-slate-400">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Next
        </button>
        <button
          type="button"
          onClick={() => setPage(totalPages)}
          disabled={page >= totalPages}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Last
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="app-panel p-6 lg:p-8">
        <p className="page-kicker">Audience hub</p>
        <h1 className="page-title mt-2">Leads</h1>
        <p className="page-copy">
          Add prospects one by one, import CSV lists, assign them to campaigns,
          and filter the database by status, company, or workflow.
        </p>
      </section>

      {/* Add leads panel */}
      <div className="app-panel overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-white/[0.06] bg-slate-950/40 p-1">
          {(["single", "csv"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-xl px-5 py-3 text-sm font-semibold transition-colors ${
                tab === t
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t === "single" ? "Add Single Lead" : "Bulk CSV Import"}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Single lead form */}
          {tab === "single" && (
            <form onSubmit={handleAddOne} className="space-y-4">
              {addOneError && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  {addOneError}
                </div>
              )}
              {addOneSuccess && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                  Lead added successfully.
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">
                  LinkedIn URL *
                </label>
                <input
                  required
                  value={sUrl}
                  onChange={(e) => setSUrl(e.target.value)}
                  placeholder="https://www.linkedin.com/in/username"
                  className="field w-full max-w-lg"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "First name", val: sFirst, set: setSFirst },
                  { label: "Last name", val: sLast, set: setSLast },
                  { label: "Company", val: sCompany, set: setSCompany },
                  { label: "Title", val: sTitle, set: setSTitle },
                ].map(({ label, val, set }) => (
                  <div key={label}>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">
                      {label}
                    </label>
                    <input
                      value={val}
                      onChange={(e) => set(e.target.value)}
                      placeholder={label}
                      className="field w-full"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Add to campaign (optional)
                  </label>
                  <select
                    value={sCampaign}
                    onChange={(e) => setSCampaign(e.target.value)}
                    className="field"
                  >
                    <option value="">None</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={addingOne}
                  className="btn-primary"
                >
                  {addingOne ? "Adding..." : "Add Lead"}
                </button>
              </div>
            </form>
          )}

          {/* Bulk CSV form */}
          {tab === "csv" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-white/[0.06] bg-slate-800/50 p-4 text-xs text-slate-300">
                <p className="font-medium mb-1">Expected CSV format (first row = headers):</p>
                <code className="block">
                  url,firstName,lastName,company,title
                  <br />
                  https://linkedin.com/in/johndoe,John,Doe,Acme Inc,CEO
                </code>
                <p className="mt-2 text-slate-400">
                  Column names are flexible: &quot;url&quot; / &quot;linkedinUrl&quot; /
                  &quot;profile url&quot;, &quot;first name&quot; /
                  &quot;firstName&quot;, etc.
                </p>
              </div>

              {importResult && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
                  {importResult}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">
                  Upload CSV file
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleCsvFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-400 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-700 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-600"
                />
              </div>

              <textarea
                rows={8}
                value={csvText}
                onChange={(e) => handleCsvChange(e.target.value)}
                placeholder={"url,firstName,lastName,company,title\nhttps://linkedin.com/in/...,Jane,Smith,Acme,CTO"}
                className="field w-full font-mono"
              />

              {importErrors.length > 0 && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
                  <p className="font-semibold">Import notes</p>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                    {importErrors.slice(0, 20).map((err, index) => (
                      <li key={`${err.row}-${index}`}>
                        {err.row > 0 ? `Row ${err.row}: ` : ""}
                        {err.error}
                      </li>
                    ))}
                  </ul>
                  {importErrors.length > 20 && (
                    <p className="mt-2 text-xs">
                      Showing first 20 of {importErrors.length} notes.
                    </p>
                  )}
                </div>
              )}

              {csvParsed.length > 0 && (
                <p className="text-sm font-semibold text-teal-400">
                  {csvParsed.length} lead{csvParsed.length !== 1 ? "s" : ""}{" "}
                  detected - first:{" "}
                  <span className="font-mono text-xs">
                    {csvParsed[0].linkedinUrl}
                  </span>
                </p>
              )}

              <div className="flex items-end gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Add all to campaign (optional)
                  </label>
                  <select
                    value={csvCampaign}
                    onChange={(e) => setCsvCampaign(e.target.value)}
                    className="field"
                  >
                    <option value="">None</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleBulkImport}
                  disabled={importing || csvParsed.length === 0}
                  className="btn-primary"
                >
                  {importing
                    ? "Importing..."
                    : csvParsed.length > 0
                    ? `Import ${csvParsed.length} Lead${csvParsed.length !== 1 ? "s" : ""}`
                    : "Paste CSV above"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="app-panel flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="field"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s || "Any"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">
            Company
          </label>
          <input
            value={company}
            onChange={(e) => { setCompany(e.target.value); setPage(1); }}
            placeholder="Filter by company..."
            className="field"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">
            Campaign
          </label>
          <select
            value={campaignId}
            onChange={(e) => { setCampaignId(e.target.value); setPage(1); }}
            className="field"
          >
            <option value="">Any campaign</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-400">
            Signal keyword
          </label>
          <input
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
            placeholder="Filter by keyword..."
            className="field"
          />
        </div>
        <span className="ml-auto self-center rounded-full bg-slate-800 px-3 py-1 text-sm font-semibold text-slate-300">
          {total} total
        </span>
      </div>

      {tableError && <p className="text-sm text-red-400">{tableError}</p>}

      {pagination}

      {/* Leads table */}
      <div className="table-shell">
        <table className="min-w-full divide-y divide-white/[0.06]">
          <thead className="table-head">
            <tr>
              {["Name", "Title", "Company", "Status", "Added"].map((h) => (
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
            {loading && <SkeletonTableRows cols={5} rows={8} />}
            {!loading && leads.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-8 text-center text-sm text-slate-400"
                >
                  No leads match your filters.
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-white/[0.03]">
                <td className="table-cell">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="font-semibold text-teal-400 hover:underline"
                  >
                    {lead.firstName || lead.lastName
                      ? `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim()
                      : "Unknown"}
                  </Link>
                </td>
                <td className="table-cell text-slate-400">
                  {lead.title ?? "-"}
                </td>
                <td className="table-cell text-slate-400">
                  {lead.company ?? "-"}
                </td>
                <td className="table-cell">
                  <div className="flex flex-wrap gap-1">
                    <Badge value={lead.connectionStatus} />
                    {lead.blacklisted && <Badge value="BLACKLISTED" />}
                  </div>
                </td>
                <td className="table-cell whitespace-nowrap text-slate-400">
                  {new Date(lead.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination}
    </div>
  );
}
