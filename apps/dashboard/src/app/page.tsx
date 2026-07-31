import Link from "next/link";
import { HeroCTA } from "@/components/HeroCTA";
import { AnimateIn } from "@/components/AnimateIn";
import { FAQ } from "@/components/FAQ";

const problems = [
  {
    number: "01",
    title: "Most teams do not need more blank campaign forms.",
    text: "They need help deciding who to target, what angle to use, what to post, and which leads are worth human attention.",
  },
  {
    number: "02",
    title: "AI without guardrails can still damage the account.",
    text: "Vectra pairs AI recommendations with hard account limits, checkpoint pauses, preflight reviews, and visible queue state before work reaches LinkedIn.",
  },
  {
    number: "03",
    title: "Generic content and generic outreach both miss the signal.",
    text: "The workspace helps users narrow ideas, generate posts and media, analyze leads, and reference real activity instead of guessing.",
  },
];

const safetyGuards = [
  { number: "01", title: "Daily hard caps", text: "15 connections · 40 messages · 60 profile views. Enforced at the queue level, not just recommended." },
  { number: "02", title: "Warm-up enforcement", text: "New accounts ramp over 4 weeks. Jobs are rejected until the current phase is complete." },
  { number: "03", title: "Timezone scheduling", text: "Actions only fire 8am–7pm local time. Weekend volume is capped at 50% of weekday limits." },
  { number: "04", title: "Human-like timing", text: "3–8s between actions, 5–15s between page loads, 90-min session max with mandatory rest." },
  { number: "05", title: "Stealth fingerprinting", text: "Consistent user agent, viewport, and timezone per account. Headed browser, never raw headless." },
  { number: "06", title: "Proxy binding", text: "One residential proxy per account. Jobs are blocked until a proxy is assigned and exit IP verified." },
  { number: "07", title: "Cookie-based sessions", text: "No automated re-login. Checkpoint detected = all account jobs stop for human review." },
  { number: "08", title: "Checkpoint detection", text: "Verification screens trigger a full account pause before any further action fires." },
  { number: "09", title: "Message deduplication", text: "Same body to max 3 recipients/day. Same company: 3-hour gap enforced between messages." },
  { number: "10", title: "Anomaly detection", text: ">5 actions in 10 min or >20% error rate triggers an immediate pause and alert." },
];

const workflow = [
  {
    step: "01",
    title: "Join the beta",
    text: "Every new workspace starts as a beta tester account with full access while we learn from real operator workflows.",
  },
  {
    step: "02",
    title: "Let AI shape the motion",
    text: "Build campaign strategy, generate content niches, create post drafts, and turn ideas into image or PDF assets.",
  },
  {
    step: "03",
    title: "Find and qualify leads",
    text: "Import, scrape, or collect content-signal leads, then let AI score fit and suggest the safest angle.",
  },
  {
    step: "04",
    title: "Launch under control",
    text: "Use preflight, caps, sessions, proxies, and activity logs to keep every campaign reviewable before it scales.",
  },
];

const productAreas = [
  { title: "AI campaign builder", text: "Turn a goal, audience, offer, and tone into campaign structure, limits, notes, messages, rationale, and safety checks.", href: "/campaigns/new" },
  { title: "AI content studio", text: "Generate cascading topic niches, post drafts, refinements, image previews, and PDF documents for LinkedIn posts.", href: "/posts" },
  { title: "AI lead analysis", text: "Score campaign leads, summarize fit, flag risks, and suggest a recommended outreach angle from the campaign context.", href: "/leads" },
  { title: "Account health", text: "Warm-up phase, proxy assignment, cap usage, checkpoints, browser session state, and posting API connection per account.", href: "/accounts" },
  { title: "Signal campaigns", text: "Find people from search URLs or recent LinkedIn posts, then save the context next to each lead.", href: "/campaigns" },
  { title: "Queue visibility", text: "Live job state, failed job reasons, retry history, worker diagnostics, and audit logs before problems compound.", href: "/jobs" },
];

const operatorProof = [
  "AI campaign strategy",
  "AI topic and media generation",
  "AI lead scoring inside campaigns",
  "Guardrails before LinkedIn actions",
];

function DashboardPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/15 bg-slate-950/90 shadow-2xl shadow-slate-950/40">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
        <span className="ml-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Vectra · Account overview
        </span>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-4">
        {[
          { label: "Connection cap", value: "15 / day", status: "9 used" },
          { label: "Message cap", value: "40 / day", status: "22 used" },
          { label: "Active window", value: "8am to 7pm", status: "In window" },
          { label: "Warm-up phase", value: "Week 3", status: "10 / day max" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-white/[0.07] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {item.label}
            </p>
            <p className="mt-2 text-base font-semibold text-white">{item.value}</p>
            <p className="mt-1 text-[11px] text-teal-300">{item.status}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 border-t border-white/10 p-4 lg:grid-cols-[1fr_0.85fr]">
        <div className="space-y-2">
          {[
            { label: "Proxy", value: "Sticky residential", detail: "Exit IP verified · US/NY" },
            { label: "Session", value: "Active · 42 min", detail: "Auto-close at 90 min" },
            { label: "Last action", value: "Connect sent", detail: "3 min ago · guarded" },
            { label: "Checkpoint", value: "None detected", detail: "All clear" },
          ].map(({ label, value, detail }) => (
            <div
              key={label}
              className="grid grid-cols-[6.5rem_1fr] gap-3 rounded-lg border border-white/10 bg-white/[0.045] px-3 py-2.5 text-sm"
            >
              <span className="text-xs font-semibold text-teal-200">{label}</span>
              <span>
                <span className="block text-xs font-semibold text-white">{value}</span>
                <span className="mt-0.5 block text-[11px] text-slate-400">{detail}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Campaign queue
          </p>
          <div className="mt-3 space-y-3">
            {[
              { label: "Content signal scrape", pct: 72 },
              { label: "Connect requests", pct: 60 },
              { label: "Follow-up sequence", pct: 38 },
            ].map(({ label, pct }) => (
              <div key={label}>
                <div className="mb-1.5 flex justify-between text-[11px]">
                  <span className="font-medium text-slate-300">{label}</span>
                  <span className="text-slate-500">{pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-teal-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 py-2">
            <p className="text-[11px] font-semibold text-emerald-200">
              All guards passing · 3 jobs running
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContentSignalPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/15 bg-slate-900 shadow-2xl shadow-slate-950/40">
      <div className="border-b border-white/10 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-300">
          Content signal campaign
        </p>
        <p className="mt-1 text-sm font-semibold text-white">
          Keyword: &ldquo;AI in sales&rdquo; · Last 7 days
        </p>
      </div>

      <div className="p-5">
        <div className="rounded-lg border border-white/10 bg-white/[0.05] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
              SK
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Sarah K. · Head of Sales @ Meridian</p>
              <p className="mt-2 text-xs leading-5 text-slate-300 line-clamp-3">
                &ldquo;AI is fundamentally changing how sales teams qualify leads. We&apos;ve seen
                3× faster pipeline velocity since adopting signal-based outreach...&rdquo;
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Posted 5 days ago · linkedin.com/posts/...</p>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-white/10" />
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Connection note generated</p>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="mt-3 rounded-lg border border-teal-500/30 bg-teal-500/10 p-4">
          <p className="text-xs leading-5 text-teal-100">
            Hi Sarah, I came across your post on AI in sales from 5 days ago. Your point about
            pipeline velocity really stood out. Would love to connect and follow your content.
          </p>
          <div className="mt-2 flex gap-2">
            <span className="inline-flex rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
              {"{{firstName}}"}
            </span>
            <span className="inline-flex rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
              {"{{postTopic}}"}
            </span>
            <span className="inline-flex rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">
              {"{{postDate}}"}
            </span>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-slate-500">
          Post excerpt stored against lead · Available in conversation view
        </p>
      </div>
    </div>
  );
}

function FullDashboardMock() {
  const navLinks = ["Dashboard", "Campaigns", "Leads", "Accounts", "Proxies", "Jobs", "Activity"];
  const statCards = [
    { title: "Connections Today", value: "9", sub: "of 15 daily cap", color: "text-blue-400 bg-blue-500/10", dot: "bg-blue-500/20" },
    { title: "Messages Today", value: "22", sub: "of 40 daily cap", color: "text-violet-400 bg-violet-500/10", dot: "bg-violet-500/20" },
    { title: "Total Leads", value: "184", sub: "61 connected", color: "text-emerald-400 bg-emerald-500/10", dot: "bg-emerald-500/20" },
    { title: "Reply Rate", value: "12%", sub: "all-time", color: "text-violet-400 bg-violet-500/10", dot: "bg-violet-500/20" },
  ];
  const rows = [
    { action: "CONNECT", badge: "bg-blue-500/15 text-blue-400", target: "linkedin.com/in/sarah-k", result: "Sent", time: "3 min ago" },
    { action: "MESSAGE", badge: "bg-violet-500/15 text-violet-400", target: "linkedin.com/in/james-r", result: "Delivered", time: "14 min ago" },
    { action: "SCRAPE", badge: "bg-amber-500/15 text-amber-400", target: "linkedin.com/search/results", result: "12 profiles", time: "27 min ago" },
    { action: "CONNECT", badge: "bg-blue-500/15 text-blue-400", target: "linkedin.com/in/emily-t", result: "Accepted", time: "1 hr ago" },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50">
      {/* Browser chrome */}
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#0a0f1a] px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-white/15" />
          <span className="h-3 w-3 rounded-full bg-white/15" />
          <span className="h-3 w-3 rounded-full bg-white/15" />
        </div>
        <div className="flex-1 rounded-md bg-white/5 px-3 py-1 text-center font-mono text-xs text-slate-500">
          vectra.app/dashboard
        </div>
      </div>

      {/* App shell */}
      <div className="bg-slate-950">
        {/* Navbar */}
        <header className="border-b border-white/[0.07] bg-slate-950/80 px-6 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-blue-600 text-xs font-black text-white">
                V
              </span>
              <div>
                <p className="text-sm font-semibold leading-none text-white">Vectra</p>
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-teal-400">
                  Outreach control
                </p>
              </div>
            </div>
            <nav className="flex items-center gap-0.5 rounded-2xl border border-white/[0.07] bg-slate-900/70 p-1">
              {navLinks.map((item, i) => (
                <span
                  key={item}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                    i === 0 ? "bg-white/10 text-white" : "text-slate-500"
                  }`}
                >
                  {item}
                </span>
              ))}
            </nav>
            <span className="rounded-xl border border-white/[0.07] bg-slate-900/70 px-3 py-1.5 text-xs text-slate-500">
              user@company.com
            </span>
          </div>
        </header>

        {/* Page content */}
        <div className="space-y-5 p-6">
          {/* Cockpit hero */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-6">
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-teal-300/40 to-transparent" aria-hidden />

            <div className="relative grid gap-6 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-200">
                  LinkedIn automation cockpit
                </p>
                <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">
                  Run safer outreach with every account, campaign, and lead in view.
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Monitor daily caps, queue activity, replies, checkpoints, and account health from
                  one surface.
                </p>
                <div className="mt-4 flex gap-2">
                  <span className="rounded-xl bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white">
                    New Campaign
                  </span>
                  <span className="rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">
                    Import Leads
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-teal-100">
                      Safety status
                    </p>
                    <p className="mt-1.5 text-base font-semibold text-white">Systems clear</p>
                  </div>
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal-300/20 text-xs font-bold text-teal-300">
                    OK
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[["Accounts", "3"], ["Leads", "184"], ["Replies", "12%"]].map(([l, v]) => (
                    <div key={l} className="rounded-xl bg-white/10 p-2">
                      <p className="text-[9px] uppercase tracking-wide text-slate-400">{l}</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">{v}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-4 gap-3">
            {statCards.map((s) => (
              <div key={s.title} className="rounded-2xl border border-white/[0.08] bg-slate-900 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-400">{s.title}</p>
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                </div>
                <p className={`mt-3 inline-flex rounded-xl px-2.5 py-0.5 text-2xl font-semibold ${s.color}`}>
                  {s.value}
                </p>
                <p className="mt-1.5 text-xs text-slate-500">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Activity table */}
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-900">
            <div className="border-b border-white/[0.06] px-5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-400">
                Event stream
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white">Recent activity</p>
            </div>
            <table className="min-w-full">
              <thead>
                <tr className="bg-slate-800/80 text-left">
                  {["Action", "Target", "Result", "Time"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${row.badge}`}>
                        {row.action}
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate px-5 py-3 text-xs text-slate-400">
                      {row.target}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">{row.result}</td>
                    <td className="px-5 py-3 text-xs text-slate-500">{row.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="relative left-1/2 -ml-[50vw] -mt-8 w-screen overflow-x-hidden bg-slate-50">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(148,163,184,1) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,184,166,0.16),transparent_34%,transparent_72%,rgba(15,23,42,0.72))]" aria-hidden />

        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-14 pt-16 sm:px-6 sm:pb-16 sm:pt-20 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-16 lg:px-8 lg:pb-20 lg:pt-24">
          <div>
            <span
              className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-4 py-1.5 text-sm font-semibold text-teal-300"
              style={{ animationDelay: "0s" }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
              </span>
              Beta access open for early testers
            </span>

            <h1
              className="animate-fade-up mt-6 text-5xl font-bold leading-[1.04] tracking-tight sm:text-6xl xl:text-7xl"
              style={{ animationDelay: "0.08s" }}
            >
              Build LinkedIn growth motions{" "}
              <span className="bg-gradient-to-r from-teal-300 to-cyan-400 bg-clip-text text-transparent">
                with AI in the loop.
              </span>
            </h1>

            <p
              className="animate-fade-up mt-6 max-w-xl text-lg leading-8 text-slate-300 sm:text-xl sm:leading-9"
              style={{ animationDelay: "0.16s" }}
            >
              Vectra helps beta users generate campaign strategy, discover content ideas, draft
              posts with media, analyze leads, and run LinkedIn workflows with account safety visible
              at every step.
            </p>

            <HeroCTA />

            <div
              className="animate-fade-up mt-7 grid gap-2 sm:grid-cols-2"
              style={{ animationDelay: "0.28s" }}
            >
              {operatorProof.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-300"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-300" />
                  {item}
                </div>
              ))}
            </div>

            <div
              className="animate-fade-up mt-9 grid grid-cols-3 gap-4 border-t border-white/10 pt-7"
              style={{ animationDelay: "0.36s" }}
            >
              {[
                { value: "Beta", label: "Early tester access" },
                { value: "AI", label: "Strategy, posts, leads" },
                { value: "10", label: "Enforced guards" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="whitespace-nowrap text-3xl font-bold text-white sm:text-4xl">{stat.value}</p>
                  <p className="mt-1.5 text-sm font-medium text-slate-400">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div
            className="animate-fade-up pb-8 lg:pb-0"
            style={{ animationDelay: "0.22s" }}
          >
            <div className="animate-card-glow rounded-xl">
              <DashboardPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── Problem ──────────────────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <AnimateIn className="max-w-3xl">
            <p className="page-kicker">Why Vectra exists</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
              Vectra is becoming the AI operating layer for LinkedIn growth.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-600">
              The first phase is beta onboarding. New users get full access so we can learn how
              founders, operators, and sales teams move from idea to campaign to published content
              without juggling separate tools.
            </p>
          </AnimateIn>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {problems.map((p, i) => (
              <AnimateIn key={p.number} delay={i * 100}>
                <div className="h-full rounded-xl border border-slate-200 bg-slate-50 p-7">
                  <span className="text-6xl font-black text-slate-200">{p.number}</span>
                  <h3 className="mt-4 text-lg font-semibold text-slate-950">{p.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{p.text}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Content Signal ────────────────────────────────────────────────────── */}
      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="grid gap-14 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <AnimateIn from="left">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-4 py-1.5 text-sm font-semibold text-teal-300">
                AI content and signal workflows
              </span>
              <h2 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
                Go from audience signal to post, asset, and outreach angle.
              </h2>
              <p className="mt-6 text-lg leading-8 text-slate-300">
                Vectra now helps users narrow content niches, generate topics, draft and refine
                posts, create image or PDF assets, and connect those ideas back to the campaign and
                lead context.
              </p>
              <div className="mt-8 space-y-4">
                {[
                  "Cascade from broad ideas into niche LinkedIn topics",
                  "Generate posts, rewrite angles, and create visual or PDF assets",
                  "Analyze campaign leads with fit score, summary, risks, and suggested angle",
                  "Use content signals and guardrails before outreach runs",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-400">
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    <span className="text-base text-slate-300">{item}</span>
                  </div>
                ))}
              </div>
            </AnimateIn>

            <AnimateIn from="right">
              <ContentSignalPreview />
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── Safety Guards ─────────────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <AnimateIn className="max-w-3xl">
            <p className="page-kicker">Risk controls</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
              Guardrails that stop risky work before it runs.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-600">
              The product message is simple: campaigns should be constrained by account health, not
              wishful thinking. These controls are enforced by the queue and worker, then surfaced in
              the dashboard.
            </p>
          </AnimateIn>

          <div className="mt-12 grid gap-3 sm:grid-cols-2">
            {safetyGuards.map((guard, i) => (
              <AnimateIn key={guard.number} delay={Math.floor(i / 2) * 70}>
                <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-950 text-[10px] font-bold text-white">
                    {guard.number}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{guard.title}</p>
                    <p className="mt-1 text-sm leading-5 text-slate-500">{guard.text}</p>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────────── */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <AnimateIn className="max-w-3xl">
            <p className="page-kicker">How it works</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
              Start with AI assistance, then keep the human review loop.
            </h2>
            <p className="mt-5 text-base leading-7 text-slate-600">
              The goal is not to remove operator judgment. It is to remove the empty-page work:
              choosing ideas, shaping campaigns, finding leads, and preparing the next best action.
            </p>
          </AnimateIn>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map((step, i) => (
              <AnimateIn key={step.step} delay={i * 80}>
                <div className="h-full rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">
                    {step.step}
                  </span>
                  <h3 className="mt-5 text-base font-semibold text-slate-950">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Dashboard Preview ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(20,184,166,0.12),transparent)]" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <AnimateIn className="max-w-3xl">
            <p className="page-kicker">The workspace</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              One workspace for ideas, leads, campaigns, posts, and risk.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-400">
              Operators should not have to stitch together prompt docs, lead spreadsheets, campaign
              tools, browser sessions, and queue logs. Vectra brings the decisions into one surface.
            </p>
          </AnimateIn>

          <AnimateIn className="mt-12" delay={100}>
            <FullDashboardMock />
          </AnimateIn>
        </div>
      </section>

      {/* ── Product Surface ───────────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <AnimateIn>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="page-kicker">Product surface</p>
                <h2 className="mt-3 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                  The AI-assisted system behind the promise.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
                  Each area removes a different kind of friction: deciding what to say, who to
                  target, what to publish, what to review, and when to stop.
                </p>
              </div>
              <Link href="/dashboard" className="btn-primary shrink-0">
                Open dashboard
              </Link>
            </div>
          </AnimateIn>

          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {productAreas.map((area, i) => (
              <AnimateIn key={area.title} delay={i * 60}>
                <Link
                  href={area.href}
                  className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
                >
                  <h3 className="text-lg font-semibold text-slate-950">{area.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{area.text}</p>
                  <span className="mt-5 inline-flex text-sm font-semibold text-teal-700 group-hover:text-teal-800">
                    View page →
                  </span>
                </Link>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_50%,rgba(20,184,166,0.08),transparent)]" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <AnimateIn>
            <p className="page-kicker">FAQ</p>
            <h2 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Common questions.
            </h2>
          </AnimateIn>
          <AnimateIn delay={80}>
            <FAQ />
          </AnimateIn>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_110%,rgba(20,184,166,0.18),transparent)]" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <AnimateIn>
            <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-300">
                  Join the beta
                </p>
                <h2 className="mt-4 max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  Help shape the AI operating layer for LinkedIn growth.
                </h2>
                <p className="mt-5 max-w-xl text-lg leading-8 text-slate-400">
                  Every user joining now is treated as a beta tester. Use the full product, test the
                  AI workflows, and help us tune the path from idea to campaign to post.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 lg:flex-col">
                <Link href="/signup" className="btn-accent">
                  Join beta free
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.15]"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-teal-400 to-blue-600 text-sm font-black text-white">
                V
              </span>
              <span>
                <span className="block text-sm font-semibold text-white">Vectra</span>
                <span className="block text-xs font-medium uppercase tracking-[0.14em] text-teal-400">
                  AI LinkedIn growth workspace
                </span>
              </span>
            </Link>
            <p className="mt-3 max-w-sm text-xs leading-5 text-slate-500">
              AI-assisted LinkedIn growth workspace for campaign strategy, content generation,
              lead analysis, account health, and controlled execution.
            </p>
          </div>
          <div className="flex flex-wrap gap-5 text-sm font-medium text-slate-500">
            <Link href="/campaigns" className="hover:text-white transition-colors">Campaigns</Link>
            <Link href="/accounts" className="hover:text-white transition-colors">Accounts</Link>
            <Link href="/proxies" className="hover:text-white transition-colors">Proxies</Link>
            <Link href="/jobs" className="hover:text-white transition-colors">Jobs</Link>
            <Link href="/activity" className="hover:text-white transition-colors">Activity</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
