"use client";

import { useEffect, useState } from "react";
import { api, type JobState, type QueueJob } from "@/lib/api";

const states: JobState[] = ["failed", "waiting", "active", "delayed", "completed"];
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

function fmt(value: number | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [state, setState] = useState<JobState>("failed");
  const [queue, setQueue] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    load();
  }, [state, queue]);

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
          <button onClick={load} className="btn-secondary" disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </section>

      <section className="app-panel p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">
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
          <label className="text-xs font-semibold text-slate-600">
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
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="table-shell">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="table-head">
            <tr>
              {["Queue", "Job", "Attempts", "Reason", "Updated", "Payload"].map((h) => (
                <th key={h} className="px-6 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td className="table-cell" colSpan={6}>Loading...</td></tr>
            ) : jobs.length === 0 ? (
              <tr><td className="table-cell" colSpan={6}>No jobs found.</td></tr>
            ) : (
              jobs.map((job) => (
                <tr key={`${job.queue}-${job.id}`} className="align-top hover:bg-slate-50/80">
                  <td className="table-cell font-semibold text-slate-800">{job.queue}</td>
                  <td className="table-cell">
                    <div className="font-semibold text-slate-900">{job.name}</div>
                    <div className="mt-1 font-mono text-xs text-slate-400">{job.id ?? "-"}</div>
                  </td>
                  <td className="table-cell text-slate-600">{job.attemptsMade}</td>
                  <td className="table-cell max-w-md whitespace-pre-wrap text-slate-600">
                    {job.failedReason ?? "-"}
                  </td>
                  <td className="table-cell text-slate-500">
                    {fmt(job.finishedOn ?? job.processedOn ?? job.timestamp)}
                  </td>
                  <td className="table-cell">
                    <pre className="max-w-sm overflow-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                      {JSON.stringify(job.data, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
