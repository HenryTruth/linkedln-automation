import Link from "next/link";
import { HeroCTA } from "@/components/HeroCTA";

const problems = [
  {
    number: "01",
    title: "Most tools are built to send. They get accounts banned.",
    text: "LinkedIn's detection is pattern-based. Tools that blast connections at volume without warm-up, proxy discipline, or rate awareness don't last. Neither do the accounts running on them.",
  },
  {
    number: "02",
    title: "You can't fix what you can't see.",
    text: "Checkpoints, proxy failures, stalled job queues, and daily limits don't announce themselves. In most tools, you find out something went wrong after the account is already flagged.",
  },
  {
    number: "03",
    title: "Generic outreach gets ignored. Or reported.",
    text: "A connection note with no context looks like every other cold request. The accounts that actually get replies reach out with a reason, not just a template.",
  },
];

const safetyGuards = [
  {
    number: "01",
    title: "Daily hard caps",
    text: "15 connections, 40 messages, 60 profile views. Enforced at the queue level before any job runs, not just as a recommended guideline.",
  },
  {
    number: "02",
    title: "Warm-up phase enforcement",
    text: "New accounts follow a 4-week ramp: manual-only → 5/day → 10/day → full caps. Jobs are rejected until the current phase is complete.",
  },
  {
    number: "03",
    title: "Timezone-aware scheduling",
    text: "Actions only fire between 8am and 7pm in the account's local timezone. Weekend volume is automatically throttled to 50% of weekday caps.",
  },
  {
    number: "04",
    title: "Human-like timing",
    text: "3–8 second delays between actions, 5–15 second gaps between page loads, 60–90 minute session limits with mandatory rest periods between runs.",
  },
  {
    number: "05",
    title: "Stealth browser fingerprinting",
    text: "Consistent user agent, viewport, timezone, and language per account. No automation flags. Headed browser on virtual display, never raw headless mode.",
  },
  {
    number: "06",
    title: "Residential proxy binding",
    text: "Each account is bound to one residential proxy location. Session-sticky rotation. Browser jobs are blocked until a proxy is assigned and its exit IP is verified.",
  },
  {
    number: "07",
    title: "Cookie-based sessions",
    text: "No automated re-login attempts. If LinkedIn presents a checkpoint, all jobs for that account stop immediately and the account waits for human review.",
  },
  {
    number: "08",
    title: "Checkpoint detection and pause",
    text: "Before every browser action, the worker checks for verification screens. Detection triggers an immediate stop across the entire account, not just the active job.",
  },
  {
    number: "09",
    title: "Message deduplication",
    text: "The same message body cannot go to more than 3 recipients per day. People at the same company get a minimum 3-hour gap between messages.",
  },
  {
    number: "10",
    title: "Anomaly detection",
    text: "More than 5 actions in 10 minutes, a repeated action on the same profile, an error rate above 20%, or an IP mismatch all trigger an immediate pause and alert.",
  },
];

const workflow = [
  {
    step: "01",
    title: "Add an account and a matching proxy",
    text: "Connect LinkedIn once, assign a residential proxy in the same location as the account's normal usage, and confirm the timezone. The system validates the proxy before anything runs.",
  },
  {
    step: "02",
    title: "Build your audience",
    text: "Import leads from CSV, enter profiles manually, collect from LinkedIn search results, or create a Content Signal campaign that finds people who posted about a keyword in the last N days.",
  },
  {
    step: "03",
    title: "Set up a campaign with explicit limits",
    text: "Choose the campaign type: connect, message, scrape, or content signal. Write messaging sequences with dynamic fields. Set daily limits at or below the system hard caps.",
  },
  {
    step: "04",
    title: "Monitor before you scale",
    text: "Review cap usage, failed jobs, checkpoint history, proxy health, and activity logs. The system surfaces the risk signals. You decide when it's safe to go further.",
  },
];

const productAreas = [
  {
    title: "Accounts",
    text: "Health score, warm-up phase, proxy assignment, session status, daily cap usage, and pause/resume per LinkedIn account.",
    href: "/accounts",
  },
  {
    title: "Campaigns",
    text: "Create connect, message, scrape, or content signal campaigns with sequence editing, daily limits, and audience assignment.",
    href: "/campaigns",
  },
  {
    title: "Leads",
    text: "Manual entry, CSV import, campaign membership, connection status, LinkedIn deep links, and post signal context per lead.",
    href: "/leads",
  },
  {
    title: "Proxies",
    text: "Residential proxy profiles, sticky session configuration, health checks, exit IP visibility, and location-to-account matching.",
    href: "/proxies",
  },
  {
    title: "Jobs",
    text: "Live queue state, failed job reasons, retry history, job payloads, and worker-level diagnostics for every automation action.",
    href: "/jobs",
  },
  {
    title: "Activity",
    text: "Searchable audit trail for every connect, message, scrape, withdrawal, error, and campaign event, with timestamps and account attribution.",
    href: "/activity",
  },
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

export default function LandingPage() {
  return (
    <div className="relative left-1/2 -ml-[50vw] -mt-8 w-screen overflow-x-hidden bg-slate-50">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
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
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(20,184,166,0.18),transparent)]" />

        <div className="relative mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl gap-12 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16 lg:px-8 lg:pt-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300">
              LinkedIn outreach automation
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.12] tracking-tight sm:text-5xl xl:text-6xl">
              LinkedIn automation that doesn&apos;t get you banned.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
              Vectra is an operations workspace, not a blast tool. Campaigns run through
              10 safety guards, proxy enforcement, and warm-up phases. Every risk signal is visible
              to you before it becomes a problem.
            </p>
            <HeroCTA />

            <div className="mt-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-8">
              {[
                { value: "10", label: "Safety guards" },
                { value: "15/day", label: "Connection hard cap" },
                { value: "4 weeks", label: "Warm-up protocol" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="text-2xl font-semibold text-white">{stat.value}</p>
                  <p className="mt-1 text-xs font-medium text-slate-400">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="pb-8 lg:pb-0">
            <DashboardPreview />
          </div>
        </div>
      </section>

      {/* ── Problem ────────────────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="page-kicker">The problem</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Why most LinkedIn automation tools fail and take your account with them.
            </h2>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {problems.map((p) => (
              <div key={p.number} className="relative rounded-xl border border-slate-200 bg-slate-50 p-6">
                <span className="text-xs font-bold text-slate-300">{p.number}</span>
                <h3 className="mt-3 text-base font-semibold text-slate-950">{p.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Content Signal Targeting ────────────────────────────────────────── */}
      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300">
                Standout feature
              </span>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
                Reach people based on what they just posted about.
              </h2>
              <p className="mt-5 text-base leading-7 text-slate-300">
                Content Signal Targeting finds LinkedIn profiles who posted a specific keyword within
                the last N days, extracts the post excerpt, and generates a connection note that
                references what they actually wrote.
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-400">
                The post is stored against the lead. When a connection is accepted and a
                follow-up message fires, the conversation context is already there. You always
                know why you connected. Your message already has something real to say.
              </p>

              <div className="mt-8 space-y-3">
                {[
                  "Keyword search across LinkedIn posts within a date window",
                  "Author name, title, company, and post excerpt stored per lead",
                  "Dynamic template fields: {{postTopic}}, {{postExcerpt}}, {{postDate}}",
                  "Post URL stored as unique key, no duplicate processing",
                  "Deduplication across campaigns and prior contact history",
                  "Search throttle, freshness gate, and note uniqueness guards built in",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-400">
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <span className="text-sm text-slate-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <ContentSignalPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── Safety Guards ───────────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="page-kicker">Safety architecture</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              10 guards between your campaign and a banned account.
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              Each guard is enforced at the queue or worker level, not just recommended. They are
              inspectable, not hidden. The system cannot remove platform risk. What it can do is make
              every risky condition visible and pause before LinkedIn forces it to.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {safetyGuards.map((guard) => (
              <div key={guard.number} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-slate-950 text-xs font-bold text-white">
                    {guard.number}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-950">{guard.title}</h3>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600">{guard.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────────── */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="page-kicker">How it works</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              From account setup to monitored campaign in four steps.
            </h2>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              The system is strongest when you treat it as an operations platform, not a one-click
              sender. Each step adds context that makes the next action safer to take.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map((step) => (
              <div key={step.step} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">
                  {step.step}
                </span>
                <h3 className="mt-5 text-sm font-semibold text-slate-950">{step.title}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-600">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Product Surface ─────────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="page-kicker">What you get</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                Every page an operator actually needs.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
                No bloat. Six purpose-built views that cover the complete outreach lifecycle, from
                account onboarding to post-campaign audit.
              </p>
            </div>
            <Link href="/dashboard" className="btn-secondary shrink-0">
              Open dashboard
            </Link>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {productAreas.map((area) => (
              <Link
                key={area.title}
                href={area.href}
                className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
              >
                <h3 className="text-base font-semibold text-slate-950">{area.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{area.text}</p>
                <span className="mt-5 inline-flex text-xs font-semibold text-teal-700 group-hover:text-teal-800">
                  View page →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────────────── */}
      <section className="bg-slate-950">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
                Get started
              </p>
              <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                One account. One proxy. One low-volume campaign.
              </h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
                The right first run isn&apos;t a blast. It&apos;s a controlled validation loop.
                Confirm the LinkedIn session, verify proxy health, run a small audience, inspect the activity
                log, and then decide whether to scale. The system gives you everything you need
                to make that call.
              </p>
              <p className="mt-4 text-xs text-slate-500">
                LinkedIn automation carries platform-policy and account risk. Vectra makes
                limits, pauses, and review points visible. It does not eliminate the risk.
                Do not run it on accounts you cannot afford to lose.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:flex-col">
              <Link href="/signup" className="btn-accent">
                Create account
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.15]"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
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
                  Outreach automation
                </span>
              </span>
            </Link>
            <p className="mt-3 max-w-sm text-xs leading-5 text-slate-500">
              An operations workspace for LinkedIn outreach campaigns. Account health, proxy
              discipline, safety controls, and full audit visibility in one place.
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
