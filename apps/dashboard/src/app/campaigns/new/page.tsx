"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Account } from "@/lib/api";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
];

const campaignTypes = [
  ["CONNECT", "Connection requests"],
  ["MESSAGE", "Drip messages"],
  ["INMAIL", "Sales Navigator InMail"],
  ["SCRAPE", "Profile scraping"],
  ["CONTENT_SIGNAL", "Post keyword sourcing"],
  ["SEQUENCE", "Visual sequence builder"],
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({
    name: "",
    accountId: "",
    type: "CONNECT",
    dailyLimit: 10,
    connectionNoteTemplate: "",
    targetTimezone: "" as string | null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.accounts.list().then((list) => {
      setAccounts(list);
      if (list.length > 0) setForm((f) => ({ ...f, accountId: list[0].id }));
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const campaign = await api.campaigns.create({
        ...form,
        connectionNoteTemplate: form.connectionNoteTemplate.trim() || null,
      });
      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="app-panel p-6 lg:p-8">
        <p className="page-kicker">New workflow</p>
        <h1 className="page-title mt-2">Create campaign</h1>
        <p className="page-copy">
          Choose the account, campaign mode, and dispatch limit. You can add
          leads, search URLs, messages, or content-signal settings after
          creation.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_0.7fr]">
        <form onSubmit={submit} className="app-panel space-y-5 p-6">
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-300">
              Campaign name
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="field w-full"
              placeholder="SaaS founders outreach Q3"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-300">
              LinkedIn account
            </label>
            <select
              required
              value={form.accountId}
              onChange={(e) =>
                setForm((f) => ({ ...f, accountId: e.target.value }))
              }
              className="field w-full"
            >
              {accounts.length === 0 && (
                <option value="">No accounts found - create one first</option>
              )}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-300">
              Campaign type
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {campaignTypes.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: value }))}
                  className={`rounded-2xl border p-4 text-left transition ${
                    form.type === value
                      ? "border-teal-500/50 bg-teal-500/10 text-teal-200 ring-2 ring-teal-500/30"
                      : "border-white/[0.08] bg-slate-800/40 text-slate-300 hover:border-white/10"
                  }`}
                >
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {value.replace("_", " ")}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-300">
              Daily limit
            </label>
            <input
              type="number"
              min={1}
              max={40}
              value={form.dailyLimit}
              onChange={(e) =>
                setForm((f) => ({ ...f, dailyLimit: Number(e.target.value) }))
              }
              className="field w-full"
            />
            <p className="mt-2 text-xs text-slate-400">
              Queue guardrails still enforce hard account caps regardless of
              this dispatch limit.
            </p>
          </div>

          {form.type !== "CONTENT_SIGNAL" && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-300">
                Target timezone{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <select
                value={form.targetTimezone ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, targetTimezone: e.target.value || null }))
                }
                className="field w-full"
              >
                <option value="">Use account timezone</option>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-400">
                Active hours (8am–7pm) and weekend throttle use this timezone. Set it to match where your prospects are located.
              </p>
            </div>
          )}

          {form.type === "SEQUENCE" && (
            <div className="rounded-2xl border border-teal-500/30 bg-teal-500/10 p-4 text-sm leading-6 text-teal-200">
              Sequence campaigns are built with a drag-and-drop graph — visit
              profile, like a post, wait, connect, branch on accepted/timed
              out, and more. You&apos;ll design the graph on the next screen
              after creating the campaign.
            </div>
          )}

          {form.type === "CONNECT" && (
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-300">
                Connection note{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <p className="mb-2 text-xs leading-5 text-slate-400">
                Personalise each request with dynamic variables. LinkedIn limits
                notes to 300 characters. Leave blank to send without a note.
              </p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {["{{firstName}}", "{{lastName}}", "{{company}}", "{{title}}"].map(
                  (v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          connectionNoteTemplate:
                            f.connectionNoteTemplate + v,
                        }))
                      }
                      className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-teal-400 hover:bg-teal-500/20"
                    >
                      {v}
                    </button>
                  )
                )}
              </div>
              <textarea
                rows={4}
                maxLength={300}
                value={form.connectionNoteTemplate}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    connectionNoteTemplate: e.target.value,
                  }))
                }
                placeholder={`Hi {{firstName}}, I came across your work at {{company}} and would love to connect!`}
                className="field w-full resize-none font-mono text-sm"
              />
              <p
                className={`mt-1 text-right text-xs font-medium ${
                  form.connectionNoteTemplate.length > 280
                    ? "text-red-500"
                    : "text-slate-400"
                }`}
              >
                {form.connectionNoteTemplate.length}/300
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || accounts.length === 0}
              className="btn-primary"
            >
              {saving ? "Creating..." : "Create Campaign"}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>

        <aside className="rounded-3xl bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/15">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">
            After creation
          </p>
          <div className="mt-6 space-y-4">
            {[
              "Add leads or search URLs.",
              "Configure messages or content signals.",
              "Start the campaign when the account is healthy.",
              "Monitor activity and checkpoints from the dashboard.",
            ].map((item, index) => (
              <div key={item} className="flex gap-3 rounded-2xl bg-white/[0.07] p-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-teal-400/20 text-sm font-semibold text-teal-100">
                  {index + 1}
                </span>
                <p className="text-sm leading-6 text-slate-200">{item}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
