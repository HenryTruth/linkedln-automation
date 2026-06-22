"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Checkpoint } from "@/lib/api";

export default function CheckpointsPage() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnresolved, setShowUnresolved] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolvedBy, setResolvedBy] = useState("");

  function reload() {
    return api.checkpoints
      .list(showUnresolved ? { unresolved: true } : undefined)
      .then(setCheckpoints);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));

    const id = setInterval(() => {
      reload().catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [showUnresolved]);

  async function handleResolve(cp: Checkpoint) {
    const who = prompt(
      "Who resolved this checkpoint? (your name or 'human')",
      resolvedBy || "human"
    );
    if (!who) return;
    setResolvedBy(who);
    setResolving(cp.id);
    try {
      await api.checkpoints.resolve(cp.id, who);
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setResolving(null);
    }
  }

  const open = checkpoints.filter((cp) => !cp.resolvedAt);
  const resolved = checkpoints.filter((cp) => cp.resolvedAt);

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  return (
    <div className="space-y-8">
      <section className="app-panel p-6 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="page-kicker">Risk response</p>
            <h1 className="page-title mt-2">Checkpoints</h1>
            <p className="page-copy">
              Security checks that need manual review before the affected
              account can safely resume automation.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm">
            <input
              type="checkbox"
              checked={showUnresolved}
              onChange={(e) => setShowUnresolved(e.target.checked)}
              className="rounded border-slate-300 text-teal-600"
            />
            Unresolved only
          </label>
        </div>
      </section>

      {open.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-red-200 bg-red-50/90 shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-red-200 bg-red-100/80 px-6 py-4">
            <div>
              <p className="text-sm font-semibold text-red-800">
                {open.length} open checkpoint{open.length > 1 ? "s" : ""}
              </p>
              <p className="mt-1 text-xs text-red-700">
                Affected accounts are paused until manually resolved.
              </p>
            </div>
          </div>
          <table className="min-w-full divide-y divide-red-100">
            <thead className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-red-700">
              <tr>
                {["Account", "Detected", "Action"].map((h) => (
                  <th key={h} className="px-6 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-red-100 bg-white/60">
              {open.map((cp) => (
                <tr key={cp.id}>
                  <td className="px-6 py-4 text-sm font-semibold text-slate-950">
                    {cp.account?.email ?? cp.accountId}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {new Date(cp.detectedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleResolve(cp)}
                      disabled={resolving === cp.id}
                      className="btn-danger px-3 py-1.5"
                    >
                      {resolving === cp.id ? "Resolving..." : "Mark Resolved"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open.length === 0 && (
        <div className="app-panel p-8 text-center">
          <p className="text-lg font-semibold text-emerald-700">
            {showUnresolved ? "No unresolved checkpoints" : "All clear"}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            All accounts are currently free of open LinkedIn security prompts.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <div className="app-panel border-amber-200 bg-amber-50/90 p-5 text-sm text-amber-900">
          <p className="font-semibold">Resolution flow</p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              "Log in to LinkedIn manually on the affected account.",
              "Complete any CAPTCHA or identity verification shown.",
              "Confirm the account is accessible and not restricted.",
              'Click "Mark Resolved" to resume automation.',
            ].map((step, index) => (
              <li key={step} className="rounded-xl bg-white/70 p-3">
                <span className="font-semibold">{index + 1}.</span> {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {!showUnresolved && resolved.length > 0 && (
        <div>
          <div className="mb-3">
            <p className="page-kicker">History</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">
              Resolved checkpoints
            </h2>
          </div>
          <div className="table-shell">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="table-head">
                <tr>
                  {["Account", "Detected", "Resolved", "By"].map((h) => (
                    <th key={h} className="px-6 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resolved.map((cp) => (
                  <tr key={cp.id} className="hover:bg-slate-50/80">
                    <td className="table-cell font-medium text-slate-950">
                      {cp.account?.email ?? cp.accountId}
                    </td>
                    <td className="table-cell text-slate-500">
                      {new Date(cp.detectedAt).toLocaleString()}
                    </td>
                    <td className="table-cell text-slate-500">
                      {cp.resolvedAt
                        ? new Date(cp.resolvedAt).toLocaleString()
                        : "-"}
                    </td>
                    <td className="table-cell text-slate-500">
                      {cp.resolvedBy ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Accounts with 2+ checkpoints in 30 days are automatically limited to 50%
        of normal caps.{" "}
        <Link href="/accounts" className="font-semibold text-teal-700 underline underline-offset-4">
          View account health
        </Link>
      </p>
    </div>
  );
}
