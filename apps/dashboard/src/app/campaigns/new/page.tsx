"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Account } from "@/lib/api";

const campaignTypes = [
  ["CONNECT", "Connection requests"],
  ["MESSAGE", "Drip messages"],
  ["SCRAPE", "Profile scraping"],
  ["CONTENT_SIGNAL", "Post keyword sourcing"],
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [form, setForm] = useState({
    name: "",
    accountId: "",
    type: "CONNECT",
    dailyLimit: 10,
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
      const campaign = await api.campaigns.create(form);
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
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
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
            <label className="mb-1 block text-sm font-semibold text-slate-700">
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
            <label className="mb-2 block text-sm font-semibold text-slate-700">
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
                      ? "border-teal-300 bg-teal-50 text-teal-900 ring-4 ring-teal-100"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {value.replace("_", " ")}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">
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
            <p className="mt-2 text-xs text-slate-500">
              Queue guardrails still enforce hard account caps regardless of
              this dispatch limit.
            </p>
          </div>

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
