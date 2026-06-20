"use client";

import { useEffect, useState, useCallback } from "react";
import { api, type ActivityPage, type Account } from "@/lib/api";
import { Badge } from "@/components/Badge";

const ACTION_TYPES = [
  "",
  "connect",
  "message",
  "scrape",
  "search_scrape",
  "content_signal",
  "withdraw",
  "checkpoint_detected",
];

const PAGE_SIZE = 50;

export default function ActivityLogPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [page, setPage] = useState<ActivityPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountId, setAccountId] = useState("");
  const [actionType, setActionType] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.accounts.list().then(setAccounts).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.activity
      .list({
        accountId: accountId || undefined,
        actionType: actionType || undefined,
        page: currentPage,
        limit: PAGE_SIZE,
      })
      .then(setPage)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [accountId, actionType, currentPage]);

  useEffect(() => {
    load();
  }, [load]);

  function handleFilterChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement>) => {
      setter(e.target.value);
      setCurrentPage(1);
    };
  }

  async function handleExport() {
    setExporting(true);
    try {
      const url = api.activity.exportUrl({
        accountId: accountId || undefined,
        actionType: actionType || undefined,
      });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const totalPages = page ? Math.ceil(page.total / PAGE_SIZE) : 0;

  const accountEmail = (id: string) =>
    accounts.find((a) => a.id === id)?.email ?? id.slice(0, 8) + "…";

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="app-panel p-6 lg:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="page-kicker">Audit trail</p>
            <h1 className="page-title mt-2">Activity Log</h1>
            <p className="page-copy">
              Every automated action, timestamped and filterable. Export up to
              10,000 rows as CSV.
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-secondary shrink-0 text-teal-700"
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </section>

      {/* Filters */}
      <div className="app-panel flex flex-wrap gap-4 p-4">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs font-semibold text-slate-500">
            Account
          </label>
          <select
            value={accountId}
            onChange={handleFilterChange(setAccountId)}
            className="field w-full"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs font-semibold text-slate-500">
            Action type
          </label>
          <select
            value={actionType}
            onChange={handleFilterChange(setActionType)}
            className="field w-full"
          >
            {ACTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t || "All types"}
              </option>
            ))}
          </select>
        </div>
        {page && (
          <div className="self-end pb-1 text-sm text-slate-400">
            {page.total.toLocaleString()} total entries
          </div>
        )}
      </div>

      {/* Table */}
      <div className="table-shell">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="table-head">
            <tr>
              {["Action", "Target", "Result", "Account", "Time"].map((h) => (
                <th key={h} className="px-6 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-10 text-center text-sm text-slate-400"
                >
                  Loading…
                </td>
              </tr>
            )}
            {!loading && page?.logs.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-10 text-center text-sm text-slate-400"
                >
                  No activity found matching the current filters.
                </td>
              </tr>
            )}
            {!loading &&
              page?.logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80">
                  <td className="table-cell">
                    <Badge value={log.actionType} />
                  </td>
                  <td className="table-cell max-w-xs truncate font-mono text-xs text-slate-600">
                    {log.targetUrl ?? "—"}
                  </td>
                  <td className="table-cell text-sm text-slate-600">
                    {log.result ?? "—"}
                  </td>
                  <td className="table-cell text-xs text-slate-500">
                    {accountEmail(log.accountId)}
                  </td>
                  <td className="table-cell whitespace-nowrap text-xs text-slate-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {page && totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-slate-500">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="btn-secondary px-3 py-1.5 disabled:opacity-40"
            >
              ← Previous
            </button>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages, p + 1))
              }
              disabled={currentPage === totalPages}
              className="btn-secondary px-3 py-1.5 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
