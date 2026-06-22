import Link from "next/link";
import { HeroCTA } from "@/components/HeroCTA";

const stats = [
  { value: "15/day", label: "connection safety cap" },
  { value: "40/day", label: "message guardrail" },
  { value: "8-7", label: "local active hours" },
];

const features = [
  {
    title: "Campaign control",
    text: "Create connect, message, scrape, and content-signal campaigns with daily limits and clear status controls.",
  },
  {
    title: "Lead operations",
    text: "Add one lead, paste a CSV, attach leads to campaigns, and filter by status, company, or campaign.",
  },
  {
    title: "Account safety",
    text: "Watch health scores, proxy status, warm-up phase, daily cap usage, time zones, and restrictions in one view.",
  },
];

const campaignModes = [
  {
    name: "Connect",
    detail: "Send connection requests to new prospects while respecting daily caps.",
  },
  {
    name: "Message",
    detail: "Run editable drip sequences for first-degree connections.",
  },
  {
    name: "Scrape",
    detail: "Collect profile data from profile URLs or LinkedIn people search URLs.",
  },
  {
    name: "Content Signal",
    detail: "Find people posting about a keyword and keep post context for outreach.",
  },
];

const workflow = [
  {
    title: "Connect accounts",
    text: "Assign time zones and optional residential proxies, then let the system track warm-up and health.",
  },
  {
    title: "Build the audience",
    text: "Import leads manually, paste CSV rows, scrape profiles, or discover authors from content signals.",
  },
  {
    title: "Launch campaigns",
    text: "Choose a campaign mode, set a daily limit, build the sequence, and dispatch jobs to the queue.",
  },
  {
    title: "Monitor and resolve",
    text: "Review activity, reply rate, usage caps, checkpoints, and account restrictions before they become problems.",
  },
];

const safetyControls = [
  "Per-account daily caps",
  "Local active-hour windows",
  "Warm-up phase visibility",
  "Proxy health monitoring",
  "Open checkpoint alerts",
  "Automatic pause on risk",
  "Webhook & email alert delivery",
];

const productAreas = [
  {
    title: "Dashboard",
    text: "A live operating picture for connections, messages, replies, leads, checkpoints, and recent activity.",
    href: "/dashboard",
  },
  {
    title: "Campaigns",
    text: "Start, pause, edit, delete, and inspect campaign performance from a focused table and detail view.",
    href: "/campaigns",
  },
  {
    title: "Leads",
    text: "Centralize prospects with CSV import, manual entry, filtering, campaign assignment, and LinkedIn links.",
    href: "/leads",
  },
  {
    title: "Accounts",
    text: "Track account status, health score, proxy, warm-up phase, time zone, and today's cap usage.",
    href: "/accounts",
  },
  {
    title: "Checkpoints",
    text: "Resolve LinkedIn security checks with a clear history of detected, resolved, and unresolved events.",
    href: "/checkpoints",
  },
  {
    title: "Jobs",
    text: "Inspect queue state, failed reasons, retry attempts, and job payloads across every automation worker.",
    href: "/jobs",
  },
];

export default function LandingPage() {
  return (
    <div className="relative left-1/2 -ml-[50vw] -mt-8 w-screen overflow-x-hidden">
      <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden bg-slate-950 text-white">
        <div
          className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=2400&q=85')] bg-cover bg-center opacity-25"
          aria-hidden
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.96)_0%,rgba(15,23,42,0.88)_48%,rgba(15,23,42,0.48)_100%)]" />
        <div className="animate-pulse-soft absolute left-[8%] top-[18%] h-56 w-56 rounded-full bg-teal-400/20 blur-3xl" />
        <div
          className="animate-pulse-soft absolute bottom-[12%] right-[10%] h-72 w-72 rounded-full bg-blue-500/20 blur-3xl"
          style={{ animationDelay: "1.2s" }}
        />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-white/[0.06] to-transparent" />

        <div className="relative mx-auto flex max-w-7xl flex-col px-4 pb-10 pt-16 sm:px-6 lg:px-8 lg:pt-24">
          <div className="max-w-3xl">
            <p className="animate-fade-up text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">
              LinkedIn Auto
            </p>
            <h1
              className="animate-fade-up mt-5 text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl"
              style={{ animationDelay: "0.08s" }}
            >
              Safer LinkedIn outreach, beautifully under control.
            </h1>
            <p
              className="animate-fade-up mt-6 max-w-2xl text-base leading-8 text-slate-200 sm:text-lg"
              style={{ animationDelay: "0.16s" }}
            >
              A sleek command center for account-safe campaigns, lead imports,
              sequence building, content-signal prospecting, health monitoring,
              and fast checkpoint response.
            </p>
            <HeroCTA />
          </div>

          <div className="mt-14 grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {stats.map((item, index) => (
                <div
                  key={item.label}
                  className="animate-fade-up rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur"
                  style={{ animationDelay: `${0.32 + index * 0.08}s` }}
                >
                  <p className="text-3xl font-semibold tracking-tight">
                    {item.value}
                  </p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-300">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>

            <div
              className="animate-fade-up animate-float-soft relative overflow-hidden rounded-[1.5rem] border border-white/[0.12] bg-white/10 p-3 shadow-2xl shadow-black/30 backdrop-blur"
              style={{ animationDelay: "0.42s" }}
            >
              <div className="animate-sheen pointer-events-none absolute inset-y-0 left-0 w-20 bg-white/[0.08]" />
              <div className="rounded-[1.1rem] bg-slate-950/80 p-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-teal-200">
                      Live cockpit
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      Today&apos;s operating picture
                    </p>
                  </div>
                  <span className="animate-pulse-soft rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-300/20">
                    Systems clear
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {["Connections", "Messages", "Leads", "Replies"].map(
                    (label, index) => (
                      <div
                        key={label}
                        className="rounded-2xl bg-white/[0.07] p-3"
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          {label}
                        </p>
                        <p className="mt-2 text-2xl font-semibold">
                          {[12, 31, 428, "18%"][index]}
                        </p>
                      </div>
                    )
                  )}
                </div>

                <div className="mt-4 space-y-2">
                  {[
                    ["Connect", "SaaS founders Q3", "Queued"],
                    ["Message", "Accepted connections", "Sent"],
                    ["Signal", "AI automation posts", "Collected"],
                  ].map(([type, target, status]) => (
                    <div
                      key={target}
                      className="relative grid grid-cols-[7rem_1fr_6rem] items-center gap-3 overflow-hidden rounded-2xl bg-white/[0.06] px-4 py-3 text-sm"
                    >
                      <div className="animate-sheen pointer-events-none absolute inset-y-0 left-0 w-12 bg-teal-200/[0.06]" />
                      <span className="font-semibold text-teal-100">
                        {type}
                      </span>
                      <span className="truncate text-slate-300">{target}</span>
                      <span className="text-right text-slate-400">
                        {status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-16 sm:px-6 lg:grid-cols-3 lg:px-8">
        {features.map((feature) => (
          <div key={feature.title} className="app-surface p-6">
            <div className="mb-5 h-1.5 w-14 rounded-full bg-teal-500" />
            <h2 className="text-xl font-semibold tracking-tight text-slate-950">
              {feature.title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {feature.text}
            </p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div>
            <p className="page-kicker">What it manages</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Every outreach path in one intuitive operating system.
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              The app is built around the real work of LinkedIn automation:
              finding the right people, choosing the right action, sending at a
              careful pace, and staying aware of account risk.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {campaignModes.map((mode) => (
              <div key={mode.name} className="app-panel p-5">
                <span className="inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-teal-700 ring-1 ring-teal-100">
                  {mode.name}
                </span>
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {mode.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="app-panel overflow-hidden">
          <div className="grid gap-8 p-6 lg:grid-cols-[0.8fr_1.2fr] lg:p-8">
            <div>
              <p className="page-kicker">Workflow</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                From first account to running campaign in one focused flow.
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                The application is built for repeated operation: load leads,
                start campaigns, review activity, and resolve health issues
                without losing context.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {workflow.map((step, index) => (
                <div
                  key={step.title}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <p className="mt-5 font-semibold text-slate-950">
                    {step.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {step.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-white/70 px-6 py-5 lg:px-8">
            <p className="text-sm font-medium text-slate-600">
              Ready to operate the automation cockpit?
            </p>
            <Link href="/dashboard" className="btn-primary">
              Open Dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="app-panel p-6 lg:p-8">
            <p className="page-kicker">Safety layer</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Built to slow down when LinkedIn starts asking questions.
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Automation is only useful when the accounts stay healthy. The app
              keeps risk visible with checkpoints, caps, proxies, warm-up
              phases, and clear pause or resume controls.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {safetyControls.map((control) => (
                <div
                  key={control}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <span className="h-2.5 w-2.5 rounded-full bg-teal-500" />
                  <span className="text-sm font-semibold text-slate-700">
                    {control}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/15">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">
              Health snapshot
            </p>
            <div className="mt-6 space-y-4">
              {[
                ["founder@company.com", "Healthy", "92"],
                ["sales@company.com", "Warning", "68"],
                ["growth@company.com", "Paused", "41"],
              ].map(([email, label, score]) => (
                <div
                  key={email}
                  className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{email}</p>
                      <p className="mt-1 text-xs text-slate-400">{label}</p>
                    </div>
                    <span className="rounded-xl bg-white/10 px-3 py-1 text-lg font-semibold">
                      {score}
                    </span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-teal-400"
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="page-kicker">Inside the app</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Clear pages for every job.
            </h2>
          </div>
          <Link href="/dashboard" className="btn-secondary">
            Explore dashboard
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {productAreas.map((area) => (
            <Link
              key={area.title}
              href={area.href}
              className="group app-surface flex min-h-56 flex-col justify-between p-5 transition hover:-translate-y-1 hover:border-teal-200"
            >
              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {area.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {area.text}
                </p>
              </div>
              <span className="mt-6 text-sm font-semibold text-teal-700 group-hover:text-teal-800">
                Open
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <p className="page-kicker">Pricing</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            One plan. Everything included.
          </h2>
          <p className="mt-4 text-sm leading-6 text-slate-600 max-w-xl mx-auto">
            No tiers, no feature gates, no credit card required. Every account gets the full platform — campaigns, automation, safety guards, and all.
          </p>
        </div>
        <div className="mx-auto max-w-lg">
          <div className="relative overflow-hidden rounded-3xl bg-slate-950 px-8 py-10 text-white shadow-2xl shadow-slate-900/20">
            <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-teal-400/20 blur-3xl" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="inline-flex rounded-full bg-teal-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-300 ring-1 ring-teal-300/20">
                  Free Forever
                </span>
                <span className="text-4xl font-bold">$0</span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                Full access. No expiry. No hidden upgrade prompt. If pricing ever changes, existing accounts are grandfathered.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  "Unlimited campaigns (Connect, Message, Scrape, Content Signal)",
                  "Unlimited lead imports and CSV exports",
                  "Multi-account management with proxy support",
                  "Warm-up phase enforcement and daily cap controls",
                  "Anomaly detection and checkpoint alerts",
                  "Activity log, reply tracking, and health monitoring",
                  "Job queue visibility with per-lead failure diagnostics",
                  "Webhook and email alert delivery (Slack, Discord, Resend)",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-slate-200">
                    <span className="mt-1 h-4 w-4 shrink-0 rounded-full bg-teal-400/20 text-center text-[10px] font-bold text-teal-300">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link href="/signup" className="btn-accent w-full text-center block">
                  Get started free
                </Link>
                <p className="mt-3 text-center text-xs text-slate-400">
                  Already have an account?{" "}
                  <Link href="/login" className="text-teal-300 hover:text-teal-200 font-medium">
                    Sign in
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-slate-950 px-6 py-10 text-white shadow-2xl shadow-slate-900/15 lg:px-10">
          <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-teal-400/20 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">
                Ready when you are
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight">
                Start with a campaign, then let the dashboard keep the whole
                operation honest.
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className="btn-accent">
                Get started free
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/[0.15]"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white/70">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.2fr_0.8fr_0.8fr] lg:px-8">
          <div>
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-sm font-black text-white">
                LA
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-950">
                  LinkedIn Auto
                </span>
                <span className="block text-xs font-medium uppercase tracking-[0.14em] text-teal-700">
                  Outreach control
                </span>
              </span>
            </Link>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">
              A focused admin experience for safer LinkedIn automation,
              campaign orchestration, lead management, and account health.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-950">Product</p>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <Link href="/dashboard" className="hover:text-slate-950">
                Dashboard
              </Link>
              <Link href="/campaigns" className="hover:text-slate-950">
                Campaigns
              </Link>
              <Link href="/leads" className="hover:text-slate-950">
                Leads
              </Link>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-950">Operations</p>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <Link href="/accounts" className="hover:text-slate-950">
                Accounts
              </Link>
              <Link href="/checkpoints" className="hover:text-slate-950">
                Checkpoints
              </Link>
              <Link href="/jobs" className="hover:text-slate-950">
                Jobs
              </Link>
              <Link href="/settings" className="hover:text-slate-950">
                Settings
              </Link>
              <Link href="/campaigns/new" className="hover:text-slate-950">
                New Campaign
              </Link>
            </div>
          </div>
        </div>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-5 text-xs text-slate-500 sm:px-6 lg:px-8">
          <span>&copy; 2026 LinkedIn Auto. All rights reserved.</span>
          <span>Built for deliberate, observable outreach.</span>
        </div>
      </footer>
    </div>
  );
}
