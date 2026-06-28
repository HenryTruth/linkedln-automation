"use client";

import { useEffect, useState } from "react";
import { api, type JobState, type QueueJob } from "@/lib/api";

const states: JobState[] = ["active", "waiting", "delayed", "completed", "failed"];
const queues = [
  "all",
  "connect",
  "message",
  "scrape",
  "searchScrape",
  "withdraw",
  "sequenceDispatch",
  "contentSignal",
  "anomalyCheck",
  "syncStatus",
];

const STATE_STYLES: Record<JobState, string> = {
  active:    "bg-blue-500/15 text-blue-400",
  waiting:   "bg-amber-500/15 text-amber-400",
  delayed:   "bg-slate-700/50 text-slate-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  failed:    "bg-red-500/15 text-red-400",
};

function fmt(value: number | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [state, setState] = useState<JobState>("active");
  const [queue, setQueue] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const page = await api.jobs.list({
        state,
        queue: queue === "all" ? undefined : queue,
        limit: 50,
      });
      setJobs(page.jobs);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleClearFailed() {
    setClearing(true);
    setClearMsg(null);
    try {
      await api.jobs.clearFailed();
      setClearMsg("All failed jobs cleared.");
      if (state === "failed") setJobs([]);
    } catch (err) {
      setClearMsg((err as Error).message);
    } finally {
      setClearing(false);
    }
  }

  useEffect(() => {
    load();
  }, [state, queue]);

  const failedCount = state === "failed" ? jobs.length : null;

  return (
    <div className="space-y-6">
      <section className="app-panel p-6 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="page-kicker">Operations</p>
            <h1 className="page-title mt-2">Jobs</h1>
            <p className="page-copy">
              Inspect queue state, failed reasons, attempts, and payloads for automation work.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleClearFailed}
              disabled={clearing}
              className="btn-secondary text-red-400 hover:border-red-500/30 hover:bg-red-500/10"
            >
              {clearing ? "Clearing…" : "Clear failed jobs"}
            </button>
            <button onClick={load} className="btn-secondary" disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
        {clearMsg && (
          <p className="mt-3 text-sm font-medium text-emerald-400">{clearMsg}</p>
        )}
      </section>

      <section className="app-panel p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-300">
            State
            <select
              value={state}
              onChange={(e) => setState(e.target.value as JobState)}
              className="field mt-1 w-full"
            >
              {states.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-300">
            Queue
            <select
              value={queue}
              onChange={(e) => setQueue(e.target.value)}
              className="field mt-1 w-full"
            >
              {queues.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="table-shell">
        <table className="min-w-full divide-y divide-white/[0.06]">
          <thead className="table-head">
            <tr>
              {["Queue", "Job", "State", "Attempts", "Reason", "Updated", "Payload"].map((h) => (
                <th key={h} className="px-6 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {loading ? (
              <tr><td className="table-cell text-center" colSpan={7}>Loading…</td></tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td className="px-6 py-10 text-center text-sm text-slate-400" colSpan={7}>
                  {state === "active"
                    ? "No jobs running right now — the queue is idle."
                    : state === "failed"
                    ? "No failed jobs. Everything is healthy."
                    : `No ${state} jobs.`}
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={`${job.queue}-${job.id}`} className="align-top hover:bg-white/[0.03]">
                  <td className="table-cell font-semibold text-slate-100">{job.queue}</td>
                  <td className="table-cell">
                    <div className="font-semibold text-white">{job.name}</div>
                    <div className="mt-1 font-mono text-xs text-slate-400">{job.id ?? "-"}</div>
                  </td>
                  <td className="table-cell">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_STYLES[job.state]}`}>
                      {job.state}
                    </span>
                  </td>
                  <td className="table-cell text-slate-400">{job.attemptsMade}</td>
                  <td className="table-cell max-w-xs">
                    {job.failedReason ? (
                      <p className="whitespace-pre-wrap text-sm text-red-400 line-clamp-4" title={job.failedReason}>
                        {job.failedReason}
                      </p>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="table-cell text-slate-500">
                    {fmt(job.finishedOn ?? job.processedOn ?? job.timestamp)}
                  </td>
                  <td className="table-cell">
                    <pre className="max-w-xs overflow-auto rounded-lg bg-slate-800 p-2 text-xs text-slate-300">
                      {JSON.stringify(job.data, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {failedCount !== null && failedCount > 0 && (
          <div className="flex items-center justify-between border-t border-white/[0.06] px-6 py-3">
            <p className="text-sm text-slate-400">{failedCount} failed job{failedCount !== 1 ? "s" : ""} shown</p>
            <button
              onClick={handleClearFailed}
              disabled={clearing}
              className="text-sm font-semibold text-red-400 hover:text-red-300"
            >
              {clearing ? "Clearing…" : "Clear all failed"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
