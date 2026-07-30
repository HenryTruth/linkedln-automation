"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, type Account, type CampaignStrategy } from "@/lib/api";

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
  const [strategizing, setStrategizing] = useState(false);
  const [strategy, setStrategy] = useState<CampaignStrategy | null>(null);
  const [brief, setBrief] = useState({
    goal: "",
    targetAudience: "",
    offer: "",
    tone: "professional",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.accounts.list().then((list) => {
      setAccounts(list);
      if (list.length > 0) setForm((f) => ({ ...f, accountId: list[0].id }));
    });
  }, []);

  async function generateStrategy() {
    if (!brief.goal.trim() || !brief.targetAudience.trim()) {
      toast.error("Add a campaign goal and target audience first.");
      return;
    }
    setStrategizing(true);
    setError(null);
    try {
      const next = await api.ai.campaignStrategy({
        accountId: form.accountId || null,
        goal: brief.goal,
        targetAudience: brief.targetAudience,
        offer: brief.offer || null,
        tone: brief.tone,
      });
      setStrategy(next);
      setForm((current) => ({
        ...current,
        name: next.name,
        type: next.type,
        dailyLimit: next.dailyLimit,
        targetTimezone: next.targetTimezone,
        connectionNoteTemplate: next.connectionNoteTemplate ?? "",
      }));
      toast.success("Strategy drafted");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStrategizing(false);
    }
  }

  async function applyStrategySetup(campaignId: string, createdType: string) {
    if (!strategy) return;

    if (createdType === "CONTENT_SIGNAL" && strategy.contentSignal) {
      await api.contentSignal.saveConfig(campaignId, {
        keyword: strategy.contentSignal.keyword,
        dateRangeDays: strategy.contentSignal.dateRangeDays,
        maxLeads: strategy.contentSignal.maxLeads,
        maxPagesPerRun: 2,
        autoContinueUntilTarget: true,
        autoContinueDelayMinutes: 20,
        autoContinueEmptyRunsLimit: 2,
        titleFilter: strategy.contentSignal.titleFilter,
        companyFilter: strategy.contentSignal.companyFilter,
        locationFilter: null,
        connectionNoteTemplate: strategy.contentSignal.connectionNoteTemplate,
      });
    }

    if ((createdType === "MESSAGE" || createdType === "INMAIL") && strategy.messages.length > 0) {
      for (const message of strategy.messages.slice(0, 4)) {
        await api.campaigns.messages.create(campaignId, message);
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const campaign = await api.campaigns.create({
        ...form,
        connectionNoteTemplate: form.connectionNoteTemplate.trim() || null,
      });
      await applyStrategySetup(campaign.id, campaign.type);
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

      <section className="app-panel p-6">
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="page-kicker">AI strategy builder</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Turn a goal into a campaign plan</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              The builder suggests the campaign type, conservative limits, search angles, message drafts, content-signal setup, and safety checks.
            </p>
          </div>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-300">
                Target audience
                <input
                  className="field mt-1 w-full"
                  value={brief.targetAudience}
                  onChange={(e) => setBrief((current) => ({ ...current, targetAudience: e.target.value }))}
                  placeholder="B2B SaaS founders, clinic owners, recruiters..."
                />
              </label>
              <label className="block text-sm font-semibold text-slate-300">
                Tone
                <select
                  className="field mt-1 w-full"
                  value={brief.tone}
                  onChange={(e) => setBrief((current) => ({ ...current, tone: e.target.value }))}
                >
                  <option value="professional">Professional</option>
                  <option value="direct">Direct</option>
                  <option value="founder-led">Founder-led</option>
                  <option value="consultative">Consultative</option>
                </select>
              </label>
            </div>
            <label className="block text-sm font-semibold text-slate-300">
              Goal
              <textarea
                className="field mt-1 min-h-24 w-full"
                value={brief.goal}
                onChange={(e) => setBrief((current) => ({ ...current, goal: e.target.value }))}
                placeholder="Book demos for our LinkedIn outreach platform, source founders discussing AI automation..."
              />
            </label>
            <label className="block text-sm font-semibold text-slate-300">
              Offer or angle
              <input
                className="field mt-1 w-full"
                value={brief.offer}
                onChange={(e) => setBrief((current) => ({ ...current, offer: e.target.value }))}
                placeholder="Audit, demo, content collaboration, hiring pipeline..."
              />
            </label>
            <button
              type="button"
              onClick={generateStrategy}
              disabled={strategizing || accounts.length === 0}
              className="btn-accent w-full"
            >
              {strategizing ? "Building strategy..." : "Build Strategy"}
            </button>
          </div>
        </div>
        {strategy && (
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/[0.08] bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-300">Plan</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{strategy.rationale}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-lg bg-teal-500/10 px-2 py-1 text-xs font-semibold text-teal-300">{strategy.type}</span>
                <span className="rounded-lg bg-white/[0.06] px-2 py-1 text-xs font-semibold text-slate-300">{strategy.dailyLimit}/day</span>
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-300">Search angles</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {strategy.searchKeywords.map((keyword) => (
                  <span key={keyword} className="rounded-lg border border-white/[0.08] px-2 py-1 text-xs text-slate-300">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-slate-950/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-300">Safety checks</p>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-300">
                {strategy.safetyChecks.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
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
