"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Checkpoint } from "@/lib/api";
import { Skeleton, SkeletonTableRows } from "@/components/Skeleton";
import { toast } from "sonner";

export default function CheckpointsPage() {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnresolved, setShowUnresolved] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [resolvedBy, setResolvedBy] = useState("");
  const [resolveTarget, setResolveTarget] = useState<Checkpoint | null>(null);
  const [resolvedByInput, setResolvedByInput] = useState("");

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

  function openResolveDialog(cp: Checkpoint) {
    setResolvedByInput(resolvedBy || "human");
    setResolveTarget(cp);
  }

  async function confirmResolve() {
    const cp = resolveTarget;
    const who = resolvedByInput.trim();
    if (!cp || !who) return;
    setResolvedBy(who);
    setResolveTarget(null);
    setResolving(cp.id);
    try {
      const result = await api.checkpoints.resolve(cp.id, who);
      await reload();
      toast.success(
        result.accountResumed
          ? "Checkpoint resolved — automation resumed."
          : "Checkpoint resolved. Other open checkpoints on this account still need to be cleared before automation resumes."
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResolving(null);
    }
  }

  const open = checkpoints.filter((cp) => !cp.resolvedAt);
  const resolved = checkpoints.filter((cp) => cp.resolvedAt);

  if (loading)
    return (
      <div className="space-y-6">
        <div className="app-panel p-6 lg:p-8 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="table-shell">
          <table className="min-w-full">
            <tbody className="divide-y divide-white/[0.06]">
              <SkeletonTableRows cols={5} rows={4} />
            </tbody>
          </table>
        </div>
      </div>
    );

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
          <label className="inline-flex cursor-pointer items-center gap-3 rounded-2xl border border-white/[0.08] bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-200 shadow-sm">
            <input
              type="checkbox"
              checked={showUnresolved}
              onChange={(e) => setShowUnresolved(e.target.checked)}
              className="rounded border-slate-600 text-teal-500"
            />
            Unresolved only
          </label>
        </div>
      </section>

      {open.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-red-500/30 bg-red-500/10 shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-red-500/20 bg-red-500/10 px-6 py-4">
            <div>
              <p className="text-sm font-semibold text-red-300">
                {open.length} open checkpoint{open.length > 1 ? "s" : ""}
              </p>
              <p className="mt-1 text-xs text-red-400">
                Affected accounts are paused until manually resolved.
              </p>
            </div>
          </div>
          <table className="min-w-full divide-y divide-red-500/20">
            <thead className="text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-red-400">
              <tr>
                {["Account", "Detected", "Action"].map((h) => (
                  <th key={h} className="px-6 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-red-500/20">
              {open.map((cp) => (
                <tr key={cp.id}>
                  <td className="px-6 py-4 text-sm font-semibold text-white">
                    {cp.account?.email ?? cp.accountId}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {new Date(cp.detectedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => openResolveDialog(cp)}
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
          <p className="text-lg font-semibold text-emerald-400">
            {showUnresolved ? "No unresolved checkpoints" : "All clear"}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            All accounts are currently free of open LinkedIn security prompts.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <div className="app-panel border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-300">
          <p className="font-semibold">Resolution flow</p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              "Log in to LinkedIn manually on the affected account.",
              "Complete any CAPTCHA or identity verification shown.",
              "Confirm the account is accessible and not restricted.",
              'Click "Mark Resolved" — automation resumes once every open checkpoint on that account is cleared.',
            ].map((step, index) => (
              <li key={step} className="rounded-xl bg-white/[0.05] p-3">
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
            <h2 className="mt-1 text-xl font-semibold text-white">
              Resolved checkpoints
            </h2>
          </div>
          <div className="table-shell">
            <table className="min-w-full divide-y divide-white/[0.06]">
              <thead className="table-head">
                <tr>
                  {["Account", "Detected", "Resolved", "By"].map((h) => (
                    <th key={h} className="px-6 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {resolved.map((cp) => (
                  <tr key={cp.id} className="hover:bg-white/[0.03]">
                    <td className="table-cell font-medium text-white">
                      {cp.account?.email ?? cp.accountId}
                    </td>
                    <td className="table-cell text-slate-400">
                      {new Date(cp.detectedAt).toLocaleString()}
                    </td>
                    <td className="table-cell text-slate-400">
                      {cp.resolvedAt
                        ? new Date(cp.resolvedAt).toLocaleString()
                        : "-"}
                    </td>
                    <td className="table-cell text-slate-400">
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
        <Link href="/accounts" className="font-semibold text-teal-400 underline underline-offset-4">
          View account health
        </Link>
      </p>

      {resolveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-sm font-semibold text-white">Mark checkpoint resolved</h2>
            <p className="mt-1 text-xs text-slate-400">
              {resolveTarget.account?.email ?? resolveTarget.accountId}
            </p>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
              Resolved by
            </label>
            <input
              autoFocus
              value={resolvedByInput}
              onChange={(e) => setResolvedByInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmResolve();
                if (e.key === "Escape") setResolveTarget(null);
              }}
              placeholder="Your name or 'human'"
              className="field mt-2 w-full text-sm"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResolveTarget(null)}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmResolve}
                disabled={!resolvedByInput.trim()}
                className="btn-danger px-3 py-1.5 text-xs"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
