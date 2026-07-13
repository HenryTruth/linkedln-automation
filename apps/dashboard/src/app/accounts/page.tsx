"use client";

import { useEffect, useState } from "react";
import { Skeleton, SkeletonPageHeader } from "@/components/Skeleton";
import {
  api,
  type Account,
  type Checkpoint,
  type Proxy,
  type CapKey,
  SYSTEM_CAPS,
  HARD_CEILING,
  CAP_LABELS,
} from "@/lib/api";
import { Badge } from "@/components/Badge";
import { HealthScore } from "@/components/HealthScore";

const CAP_KEYS: CapKey[] = ["connection", "message", "inmail", "profileView", "searchPage"];

// ── Account-type presets ───────────────────────────────────────────────────
// Numbers are calibrated against LinkedIn's known enforcement thresholds.
// Weekly connection total = (weekday cap × 5) + (weekday cap × 0.5 × 2) = cap × 6
// LinkedIn's published soft cap is ~100 connections/week for free accounts.
type PresetId = "new" | "established" | "veteran" | "sales_nav";

interface CapPreset {
  id: PresetId;
  label: string;
  badge: string;
  caps: Record<CapKey, number>;
  description: string;
  caveats: string[];
}

const CAP_PRESETS: CapPreset[] = [
  {
    id: "new",
    label: "New account",
    badge: "< 6 months",
    caps: { connection: 5, message: 10, inmail: 1, profileView: 20, searchPage: 4 },
    description:
      "LinkedIn places new accounts under the highest scrutiny. Even manual users can be flagged. Start slow — build trust before increasing volume.",
    caveats: [
      "~30 connection requests/week — well under LinkedIn's 100/week soft cap",
      "Profile views are limited to avoid the commercial-use warning",
      "Increase only after the account has organic connections and post engagement",
    ],
  },
  {
    id: "established",
    label: "Established",
    badge: "6 months – 2 years",
    caps: { connection: 15, message: 40, inmail: 5, profileView: 80, searchPage: 12 },
    description:
      "Standard safe baseline for most free LinkedIn accounts with some history. Keeps weekly connection sends at ~90 — just under LinkedIn's 100/week guideline.",
    caveats: [
      "~90 connection requests/week (LinkedIn's free-account cap is ~100/week)",
      "Free accounts start hitting the commercial-use limit around 80–100 profile views/day",
      "Staying at these levels avoids triggering LinkedIn's automation detection",
    ],
  },
  {
    id: "veteran",
    label: "Veteran",
    badge: "2+ years",
    caps: { connection: 20, message: 80, inmail: 8, profileView: 150, searchPage: 20 },
    description:
      "For accounts with a proven network history and consistent engagement. LinkedIn's algorithm is more lenient with aged accounts — but the 100/week connection guideline still applies.",
    caveats: [
      "~120 connection requests/week — slightly above the 100/week guideline",
      "Safe for accounts with high SSI (Social Selling Index ≥ 60) and 2+ years of activity",
      "If you start seeing 'connection limit reached' notices, drop back to 15/day",
    ],
  },
  {
    id: "sales_nav",
    label: "Sales Navigator",
    badge: "Premium subscription",
    caps: { connection: 25, message: 100, inmail: 10, profileView: 200, searchPage: 30 },
    description:
      "Sales Navigator gives richer prospecting and InMail access. Vectra still keeps InMail on a separate daily cap and does not raise connection safety limits automatically.",
    caveats: [
      "~150 connection requests/week — SN accounts have a higher threshold (~150–200/week)",
      "Profile views and search pages are unrestricted by commercial-use limits on SN",
      "InMail credits are separate from direct messages and should stay below the account's available Sales Navigator credits",
    ],
  },
];

// Per-field LinkedIn context
const CAP_FIELD_INFO: Record<
  CapKey,
  { weeklyNote: string; safeZone: number; amberZone: number }
> = {
  connection: {
    weeklyNote: "Weekly total = daily × 6 (weekend throttle 50%)",
    safeZone: 15,   // ≤15/day → ≤90/week, under LinkedIn's ~100/week soft cap
    amberZone: 20,  // ≤20/day → ≤120/week, borderline for veteran accounts
  },
  message: {
    weeklyNote: "First-degree connections only. No weekly hard cap, but volume triggers spam filters.",
    safeZone: 60,
    amberZone: 100,
  },
  inmail: {
    weeklyNote: "Sales Navigator InMail credits are separate from direct messages.",
    safeZone: 10,
    amberZone: 25,
  },
  profileView: {
    weeklyNote: "Free accounts hit LinkedIn's commercial-use limit around 80–100/day. SN removes this limit.",
    safeZone: 80,
    amberZone: 150,
  },
  searchPage: {
    weeklyNote: "Search pages exhaust the commercial-use limit faster than any other action on free accounts.",
    safeZone: 12,
    amberZone: 25,
  },
};

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
  "Australia/Sydney",
  "Africa/Lagos",
];

const TIMEZONE_COUNTRIES: Record<string, string[]> = {
  "America/New_York": ["US", "USA", "United States"],
  "America/Chicago": ["US", "USA", "United States"],
  "America/Denver": ["US", "USA", "United States"],
  "America/Los_Angeles": ["US", "USA", "United States"],
  "America/Toronto": ["CA", "Canada"],
  "America/Vancouver": ["CA", "Canada"],
  "Europe/London": ["GB", "UK", "United Kingdom"],
  "Europe/Paris": ["FR", "France"],
  "Europe/Berlin": ["DE", "Germany"],
  "Europe/Amsterdam": ["NL", "Netherlands"],
  "Asia/Singapore": ["SG", "Singapore"],
  "Asia/Tokyo": ["JP", "Japan"],
  "Asia/Shanghai": ["CN", "China"],
  "Australia/Sydney": ["AU", "Australia"],
  "Africa/Lagos": ["NG", "Nigeria"],
};

function normalizeLocation(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function expectedCountries(timezone: string): string[] {
  return TIMEZONE_COUNTRIES[timezone] ?? [];
}

function proxyMatchesTimezone(proxy: Proxy | null | undefined, timezone: string): boolean {
  if (!proxy) return true;
  const expected = expectedCountries(timezone).map(normalizeLocation);
  if (expected.length === 0) return true;
  return expected.includes(normalizeLocation(proxy.country));
}

function locationMismatchMessage(proxy: Proxy | null | undefined, timezone: string): string | null {
  if (!proxy || proxyMatchesTimezone(proxy, timezone)) return null;
  const expected = expectedCountries(timezone).join(" or ");
  return `Timezone ${timezone} usually maps to ${expected}, but this proxy is ${proxy.country}. Use the location the account normally logs in from.`;
}

function dayKeyForTimezone(timezone: string, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    const year = part("year");
    const month = part("month");
    const day = part("day");
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // Fall through to UTC if the timezone is invalid.
  }

  return date.toISOString().slice(0, 10);
}

function effectiveCap(account: Account, key: CapKey): number {
  const overrides = account.maxDailyCaps ?? {};
  return overrides[key] ?? SYSTEM_CAPS[key];
}

function CapBar({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const danger = pct >= 80;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
        <span>{label}</span>
        <span className={danger ? "font-medium text-red-400" : ""}>
          {used} / {cap}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-800">
        <div
          className={`h-2 rounded-full transition-all ${
            danger ? "bg-red-500" : "bg-teal-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

type AccountNoticeType = "success" | "error" | "info";

function sessionBadge(account: Account, openCheckpoints: number) {
  if (openCheckpoints > 0 || account.status === "RESTRICTED") {
    return {
      label: "Verification required",
      detail: "Resolve the LinkedIn security prompt before this account can run.",
      className: "border-red-500/30 bg-red-500/10 text-red-300",
    };
  }
  if (!account.proxy) {
    return {
      label: "Proxy required",
      detail: "Assign a matching residential proxy before connecting LinkedIn.",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    };
  }
  if (!account.hasSession) {
    return {
      label: "Session required",
      detail: "Connect LinkedIn once so campaigns can reuse a saved login session.",
      className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    };
  }
  return {
    label: "Session active",
    detail: account.cookiesConsentAt
      ? `Saved ${new Date(account.cookiesConsentAt).toLocaleString()}`
      : "Saved login session is available for browser jobs.",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  };
}

function AccountActionButton({
  title,
  description,
  detail,
  tone = "slate",
  active = false,
  disabled = false,
  onClick,
}: {
  title: string;
  description: string;
  detail?: string;
  tone?: "slate" | "teal" | "violet" | "amber" | "red";
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const toneClasses = {
    slate: "border-white/10 bg-slate-800 text-slate-100 hover:border-white/20 hover:bg-slate-700",
    teal: "border-teal-500/30 bg-teal-500/10 text-teal-100 hover:border-teal-500/50",
    violet: "border-violet-500/30 bg-violet-500/10 text-violet-100 hover:border-violet-500/50",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:border-amber-500/50",
    red: "border-red-500/30 bg-red-500/10 text-red-100 hover:border-red-500/50",
  };
  const dotClasses = {
    slate: "bg-slate-400",
    teal: "bg-teal-400",
    violet: "bg-violet-400",
    amber: "bg-amber-400",
    red: "bg-red-400",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-[6.75rem] cursor-pointer rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        toneClasses[tone]
      } ${active ? "ring-2 ring-white/20" : ""}`}
    >
      <span className="flex items-start gap-2">
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotClasses[tone]}`} />
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-5">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-slate-400">
            {description}
          </span>
          {detail && (
            <span className="mt-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              {detail}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<
    Record<string, { type: AccountNoticeType; message: string }>
  >({});
  const [confirmingAction, setConfirmingAction] = useState<{
    accountId: string;
    action: "pause" | "warmup" | "downgrade-warmup";
  } | null>(null);

  // LinkedIn session import state
  const [cookieInputs, setCookieInputs] = useState<Record<string, string>>({});
  const [cookieConsent, setCookieConsent] = useState<Record<string, boolean>>({});
  const [showCookieFor, setShowCookieFor] = useState<string | null>(null);
  const [uploadingCookies, setUploadingCookies] = useState(false);

  // per-account cap editor state
  const [showCapsFor, setShowCapsFor] = useState<string | null>(null);
  const [capDrafts, setCapDrafts] = useState<Record<string, Partial<Record<CapKey, number>>>>({});
  const [selectedPreset, setSelectedPreset] = useState<Record<string, PresetId | null>>({});
  const [savingCaps, setSavingCaps] = useState(false);
  const [capError, setCapError] = useState<string | null>(null);

  // Edit account state
  const [showEditFor, setShowEditFor] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editTimezone, setEditTimezone] = useState("America/New_York");
  const [editProxyId, setEditProxyId] = useState("");
  const [editSalesNavigatorEnabled, setEditSalesNavigatorEnabled] = useState(false);
  const [editInMailMonthlyLimit, setEditInMailMonthlyLimit] = useState(50);
  const [savingEdit, setSavingEdit] = useState(false);

  // Add account form
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newTimezone, setNewTimezone] = useState("America/New_York");
  const [newProxyId, setNewProxyId] = useState("");
  const [newSalesNavigatorEnabled, setNewSalesNavigatorEnabled] = useState(false);
  const [newInMailMonthlyLimit, setNewInMailMonthlyLimit] = useState(50);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const selectedProxy = proxies.find((proxy) => proxy.id === newProxyId) ?? null;
  const selectedProxyLocationWarning = locationMismatchMessage(
    selectedProxy,
    newTimezone
  );

  function setAccountNotice(
    accountId: string,
    type: AccountNoticeType,
    message: string
  ) {
    setNotice((prev) => ({ ...prev, [accountId]: { type, message } }));
  }

  function clearAccountNotice(accountId: string) {
    setNotice((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });
    setConfirmingAction((current) =>
      current?.accountId === accountId ? null : current
    );
  }

  function toggleCapsPanel(account: Account) {
    clearAccountNotice(account.id);
    setShowCookieFor(null);
    openCapsEditor(account);
  }

  function toggleCookiePanel(accountId: string) {
    clearAccountNotice(accountId);
    setShowCapsFor(null);
    setShowCookieFor((v) => (v === accountId ? null : accountId));
  }

  function reload() {
    return Promise.all([
      api.accounts.list(),
      api.checkpoints.list({ unresolved: true }),
      api.proxies.list(),
    ]).then(([a, c, p]) => {
      setAccounts(a);
      setCheckpoints(c);
      setProxies(p);
    });
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));

    const id = setInterval(() => {
      reload().catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  function openCapsEditor(account: Account) {
    const overrides = account.maxDailyCaps ?? {};
    const draft: Partial<Record<CapKey, number>> = {};
    for (const key of CAP_KEYS) {
      draft[key] = overrides[key] ?? SYSTEM_CAPS[key];
    }
    setCapDrafts((prev) => ({ ...prev, [account.id]: draft }));
    setSelectedPreset((prev) => ({ ...prev, [account.id]: null }));
    setCapError(null);
    setShowCapsFor((v) => (v === account.id ? null : account.id));
  }

  function applyPreset(accountId: string, preset: CapPreset) {
    setCapDrafts((prev) => ({
      ...prev,
      [accountId]: { ...preset.caps },
    }));
    setSelectedPreset((prev) => ({ ...prev, [accountId]: preset.id }));
  }

  async function handleSaveCaps(id: string) {
    const draft = capDrafts[id];
    if (!draft) return;
    setSavingCaps(true);
    setCapError(null);
    clearAccountNotice(id);
    try {
      await api.accounts.updateCaps(id, draft);
      setShowCapsFor(null);
      await reload();
      setAccountNotice(id, "success", "Daily limits updated.");
    } catch (e) {
      setCapError((e as Error).message);
      setAccountNotice(id, "error", (e as Error).message);
    } finally {
      setSavingCaps(false);
    }
  }

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      await api.accounts.create({
        email: newEmail,
        timezone: newTimezone,
        proxyId: newProxyId || undefined,
        salesNavigatorEnabled: newSalesNavigatorEnabled,
        inMailMonthlyLimit: newInMailMonthlyLimit,
      });
      setNewEmail("");
      setNewProxyId("");
      setNewSalesNavigatorEnabled(false);
      setNewInMailMonthlyLimit(50);
      setShowForm(false);
      await reload();
    } catch (err) {
      const message = (err as Error).message;
      const existing = accounts.find(
        (a) => a.email.toLowerCase() === newEmail.trim().toLowerCase()
      );
      if (message.includes("already exists") && existing) {
        setShowForm(false);
        setNewEmail("");
        setNewProxyId("");
        setNewSalesNavigatorEnabled(false);
        setNewInMailMonthlyLimit(50);
        setAddError(null);
        openEditFor(existing);
        setAccountNotice(existing.id, "info", "An account with this email already exists — editing it below.");
        requestAnimationFrame(() => {
          document
            .getElementById(`account-${existing.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
      } else {
        setAddError(message);
      }
    } finally {
      setAdding(false);
    }
  }

  async function handlePause(account: Account) {
    const isConfirming =
      confirmingAction?.accountId === account.id &&
      confirmingAction.action === "pause";
    if (!isConfirming) {
      setConfirmingAction({ accountId: account.id, action: "pause" });
      setAccountNotice(
        account.id,
        "info",
        "Click Confirm pause to stop queued work for this account."
      );
      return;
    }
    setBusy(account.id);
    clearAccountNotice(account.id);
    try {
      await api.accounts.pause(account.id);
      await reload();
      setAccountNotice(account.id, "success", "Automation paused for this account.");
    } catch (e) {
      setAccountNotice(account.id, "error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleResume(account: Account) {
    setBusy(account.id);
    clearAccountNotice(account.id);
    try {
      await api.accounts.resume(account.id);
      await reload();
      setAccountNotice(account.id, "success", "Automation resumed.");
    } catch (e) {
      setAccountNotice(account.id, "error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function openEditFor(account: Account) {
    setEditEmail(account.email);
    setEditTimezone(account.timezone);
    setEditProxyId(account.proxy?.id ?? "");
    setEditSalesNavigatorEnabled(account.salesNavigatorEnabled);
    setEditInMailMonthlyLimit(account.inMailMonthlyLimit);
    setShowEditFor(account.id);
  }

  async function handleEditAccount(account: Account) {
    setSavingEdit(true);
    clearAccountNotice(account.id);
    try {
      await api.accounts.update(account.id, {
        email: editEmail,
        timezone: editTimezone,
        proxyId: editProxyId || null,
        salesNavigatorEnabled: editSalesNavigatorEnabled,
        inMailMonthlyLimit: editInMailMonthlyLimit,
      });
      setShowEditFor(null);
      await reload();
      setAccountNotice(account.id, "success", "Account updated.");
    } catch (e) {
      setAccountNotice(account.id, "error", (e as Error).message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleAdvanceWarmup(account: Account) {
    const isConfirming =
      confirmingAction?.accountId === account.id &&
      confirmingAction.action === "warmup";
    if (!isConfirming) {
      setConfirmingAction({ accountId: account.id, action: "warmup" });
      setAccountNotice(
        account.id,
        "info",
        "Click Confirm warm-up after this account has been stable at the current phase."
      );
      return;
    }
    setBusy(account.id);
    clearAccountNotice(account.id);
    try {
      await api.accounts.advanceWarmup(account.id);
      await reload();
      setAccountNotice(account.id, "success", "Warm-up phase advanced.");
    } catch (e) {
      setAccountNotice(account.id, "error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDowngradeWarmup(account: Account) {
    const isConfirming =
      confirmingAction?.accountId === account.id &&
      confirmingAction.action === "downgrade-warmup";
    if (!isConfirming) {
      setConfirmingAction({ accountId: account.id, action: "downgrade-warmup" });
      setAccountNotice(
        account.id,
        "info",
        "Click Confirm downgrade to move this account back one warm-up phase."
      );
      return;
    }
    setBusy(account.id);
    clearAccountNotice(account.id);
    try {
      await api.accounts.downgradeWarmup(account.id);
      await reload();
      setAccountNotice(account.id, "success", "Warm-up phase downgraded.");
    } catch (e) {
      setAccountNotice(account.id, "error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleUploadCookies(id: string) {
    const cookies = cookieInputs[id]?.trim();
    if (!cookies) return;
    if (!cookieConsent[id]) {
      setAccountNotice(
        id,
        "error",
        "Confirm cookie storage consent before saving session cookies."
      );
      return;
    }
    try {
      const parsed = JSON.parse(cookies) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("Cookies must be a JSON array.");
      }
    } catch (e) {
      setAccountNotice(id, "error", `Invalid cookie JSON: ${(e as Error).message}`);
      return;
    }
    setUploadingCookies(true);
    clearAccountNotice(id);
    try {
      await api.accounts.uploadCookies(id, cookies, true);
      setCookieInputs((prev) => ({ ...prev, [id]: "" }));
      setCookieConsent((prev) => ({ ...prev, [id]: false }));
      setShowCookieFor(null);
      await reload();
      setAccountNotice(
        id,
        "success",
        "LinkedIn session saved. The next campaign browser will use it."
      );
    } catch (e) {
      setAccountNotice(id, "error", (e as Error).message);
    } finally {
      setUploadingCookies(false);
    }
  }

  if (loading)
    return (
      <div className="space-y-6">
        <SkeletonPageHeader wide />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="app-panel p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-8 w-20 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="rounded-2xl border border-white/[0.06] bg-slate-800/50 p-3 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <div className="space-y-6">
      <section className="app-panel p-6 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="page-kicker">Account health</p>
            <h1 className="page-title mt-2">Accounts</h1>
            <p className="page-copy">
              Each LinkedIn account runs its own browser session with independent
              safety caps, warm-up state, proxy status, and checkpoint handling.
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className={showForm ? "btn-secondary" : "btn-primary"}
          >
            {showForm ? "Cancel" : "Add Account"}
          </button>
        </div>
      </section>

      {/* Add account form */}
      {showForm && (
        <form
          onSubmit={handleAddAccount}
          className="app-panel max-w-2xl space-y-4 border-teal-500/30 bg-teal-500/5 p-5"
        >
          <h2 className="text-sm font-semibold text-teal-300">
            Add LinkedIn Account
          </h2>
          <p className="text-xs leading-5 text-teal-400">
            After adding the account, connect LinkedIn once. Vectra will reuse
            the saved session for campaign runs until LinkedIn asks you to refresh it.
          </p>

          {addError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {addError}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">
              LinkedIn email *
            </label>
            <input
              required
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.com"
              className="field w-full"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">
              Timezone (determines active hours 8am-7pm)
            </label>
            <select
              value={newTimezone}
              onChange={(e) => setNewTimezone(e.target.value)}
              className="field w-full"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">
              Proxy (required before automation starts)
            </label>
            <select
              value={newProxyId}
              onChange={(e) => setNewProxyId(e.target.value)}
              className="field w-full"
            >
              <option value="">No proxy yet</option>
              {proxies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.country}
                  {p.city ? ` - ${p.city}` : ""} - {p.host}:{p.port} [
                  {p.healthStatus}]
                </option>
              ))}
            </select>
            {newProxyId ? (
              selectedProxyLocationWarning ? (
                <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                  {selectedProxyLocationWarning}
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Proxy location matches the selected timezone. Still use the
                  location this account normally logs in from.
                </p>
              )
            ) : (
              <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                You can save the account now, but jobs will not run until a
                stable residential proxy is assigned.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
            <label className="flex items-start gap-3 text-sm font-semibold text-slate-200">
              <input
                type="checkbox"
                checked={newSalesNavigatorEnabled}
                onChange={(e) => setNewSalesNavigatorEnabled(e.target.checked)}
                className="mt-1"
              />
              <span>
                Sales Navigator enabled
                <span className="mt-1 block text-xs font-normal leading-5 text-slate-400">
                  Required for Sales Navigator search/list scraping and InMail campaigns.
                </span>
              </span>
            </label>
            <label className="mt-3 block text-xs font-semibold text-slate-300">
              Monthly InMail limit
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={newInMailMonthlyLimit}
              onChange={(e) => setNewInMailMonthlyLimit(Number(e.target.value))}
              className="field mt-1 w-full"
            />
          </div>

          <button
            type="submit"
            disabled={adding}
            className="btn-primary"
          >
            {adding ? "Adding..." : "Add Account"}
          </button>
        </form>
      )}

      {/* No accounts state */}
      {accounts.length === 0 && !showForm && (
        <div className="app-panel border-dashed border-white/10 p-12 text-center">
          <p className="mb-2 font-semibold text-slate-300">
            No LinkedIn accounts added yet
          </p>
          <p className="mb-4 text-sm text-slate-500">
            Add an account to start automating connections and messages.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary"
          >
            Add First Account
          </button>
        </div>
      )}

      {/* Account cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {accounts.map((account) => {
          const today = dayKeyForTimezone(account.timezone);
          const todayCaps =
            (account.dailyCaps as Record<string, Record<string, number>>)[
              today
            ] ?? {};
          const openCount = checkpoints.filter(
            (cp) => cp.accountId === account.id
          ).length;
          const draft = capDrafts[account.id] ?? {};
          const accountNotice = notice[account.id];
          const accountBusy = busy === account.id;
          const confirmingPause =
            confirmingAction?.accountId === account.id &&
            confirmingAction.action === "pause";
          const confirmingWarmup =
            confirmingAction?.accountId === account.id &&
            confirmingAction.action === "warmup";
          const confirmingDowngrade =
            confirmingAction?.accountId === account.id &&
            confirmingAction.action === "downgrade-warmup";
          const canResume =
            account.status === "PAUSED" || account.status === "RESTRICTED";
          const isRestricted = account.status === "RESTRICTED";
          const accountProxyWarning = account.proxy
            ? locationMismatchMessage(account.proxy, account.timezone)
            : null;
          const session = sessionBadge(account, openCount);

          return (
            <div
              key={account.id}
              id={`account-${account.id}`}
              className={`app-panel space-y-5 p-6 ${
                openCount > 0 || account.status === "RESTRICTED"
                  ? "border-red-500/40 ring-2 ring-red-500/20"
                  : account.status === "PAUSED"
                  ? "border-amber-500/30"
                  : ""
              }`}
            >
              {/* Top row: health + identity + action */}
              <div className="flex items-start gap-4">
                <HealthScore account={account} checkpoints={checkpoints} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white">
                      {account.email}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        showEditFor === account.id
                          ? setShowEditFor(null)
                          : openEditFor(account)
                      }
                      className="shrink-0 rounded-full border border-slate-600 px-2.5 py-0.5 text-[11px] font-medium text-slate-300 transition hover:border-slate-400 hover:text-white"
                    >
                      {showEditFor === account.id ? "Cancel" : "Edit"}
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge value={account.status} />
                    <Badge value={account.warmUpPhase} />
                  </div>
                  {openCount > 0 && (
                    <p className="mt-2 text-xs font-semibold text-red-400">
                      {openCount} open checkpoint
                      {openCount > 1 ? "s" : ""} - automation paused
                    </p>
                  )}
                </div>

                <div className="hidden shrink-0 sm:block">
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                    {account.status === "ACTIVE" ? "Running" : "Needs attention"}
                  </span>
                </div>
              </div>

              {accountNotice && (
                <div
                  className={`rounded-2xl border p-3 text-sm ${
                    accountNotice.type === "success"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : accountNotice.type === "info"
                      ? "border-sky-500/30 bg-sky-500/10 text-sky-400"
                      : "border-red-500/30 bg-red-500/10 text-red-400"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>{accountNotice.message}</span>
                    {confirmingAction?.accountId === account.id && (
                      <button
                        type="button"
                        onClick={() => clearAccountNotice(account.id)}
                        className="text-xs font-semibold underline-offset-2 hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              )}

              {showEditFor === account.id && (
                <div className="space-y-3 rounded-2xl border border-slate-500/30 bg-slate-500/5 p-4">
                  <p className="text-xs font-semibold text-slate-300">Edit account</p>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-400">
                      LinkedIn email
                    </label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="field w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-400">
                      Timezone (active hours 8am–7pm)
                    </label>
                    <select
                      value={editTimezone}
                      onChange={(e) => setEditTimezone(e.target.value)}
                      className="field w-full"
                    >
                      {TIMEZONES.map((tz) => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-400">
                      Proxy
                    </label>
                    <select
                      value={editProxyId}
                      onChange={(e) => setEditProxyId(e.target.value)}
                      className="field w-full"
                    >
                      <option value="">No proxy</option>
                      {proxies.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.country}{p.city ? ` - ${p.city}` : ""} — {p.host}:{p.port} [{p.healthStatus}]
                        </option>
                      ))}
                    </select>
                    {editProxyId && (() => {
                      const warn = locationMismatchMessage(
                        proxies.find((p) => p.id === editProxyId) ?? null,
                        editTimezone
                      );
                      return warn ? (
                        <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                          {warn}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-4">
                    <label className="flex items-start gap-3 text-sm font-semibold text-slate-200">
                      <input
                        type="checkbox"
                        checked={editSalesNavigatorEnabled}
                        onChange={(e) => setEditSalesNavigatorEnabled(e.target.checked)}
                        className="mt-1"
                      />
                      <span>
                        Sales Navigator enabled
                        <span className="mt-1 block text-xs font-normal leading-5 text-slate-400">
                          Allows Sales Navigator search/list scraping and InMail campaigns for this account.
                        </span>
                      </span>
                    </label>
                    <label className="mt-3 block text-xs font-semibold text-slate-400">
                      Monthly InMail limit
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={editInMailMonthlyLimit}
                      onChange={(e) => setEditInMailMonthlyLimit(Number(e.target.value))}
                      className="field mt-1 w-full"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleEditAccount(account)}
                    disabled={savingEdit}
                    className="btn-primary px-4 py-1.5"
                  >
                    {savingEdit ? "Saving..." : "Save changes"}
                  </button>
                </div>
              )}

              <div className="rounded-3xl border border-white/[0.06] bg-slate-950/40 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Account actions
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Control automation, warm-up, limits, and LinkedIn session access.
                    </p>
                  </div>
                  {accountBusy && (
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                      Working...
                    </span>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {canResume ? (
                    <AccountActionButton
                      title={isRestricted ? "Review required" : "Resume automation"}
                      description={
                        isRestricted
                          ? "Resolve the account restriction before automation can run again."
                          : "Restart queued work for this account."
                      }
                      detail={isRestricted ? "Locked" : "Paused"}
                      tone={isRestricted ? "red" : "teal"}
                      onClick={() => handleResume(account)}
                      disabled={accountBusy || account.status === "RESTRICTED"}
                    />
                  ) : (
                    <AccountActionButton
                      title={confirmingPause ? "Confirm pause" : "Pause automation"}
                      description={
                        confirmingPause
                          ? "Confirm to stop queued work until you resume the account."
                          : "Temporarily stop all automated work for this account."
                      }
                      detail={confirmingPause ? "Confirmation needed" : "Running"}
                      tone={confirmingPause ? "amber" : "slate"}
                      active={confirmingPause}
                      onClick={() => handlePause(account)}
                      disabled={accountBusy}
                    />
                  )}

                  <AccountActionButton
                    title={confirmingWarmup ? "Confirm warm-up" : "Advance warm-up"}
                    description={
                      account.warmUpPhase === "FULL"
                        ? "This account is already at the full operating phase."
                        : confirmingWarmup
                        ? "Confirm only after the account has stayed healthy at this phase."
                        : "Move to the next sending volume phase."
                    }
                    detail={
                      account.warmUpPhase === "FULL"
                        ? "Complete"
                        : confirmingWarmup
                        ? "Confirmation needed"
                        : account.warmUpPhase
                    }
                    tone={confirmingWarmup ? "amber" : "violet"}
                    active={confirmingWarmup}
                    onClick={() => handleAdvanceWarmup(account)}
                    disabled={accountBusy || account.warmUpPhase === "FULL"}
                  />

                  <AccountActionButton
                    title={confirmingDowngrade ? "Confirm downgrade" : "De-advance warm-up"}
                    description={
                      account.warmUpPhase === "MANUAL"
                        ? "This account is already at the minimum warm-up phase."
                        : confirmingDowngrade
                        ? "This will reduce the daily sending caps. Confirm to proceed."
                        : "Roll back to the previous sending volume phase."
                    }
                    detail={
                      account.warmUpPhase === "MANUAL"
                        ? "Minimum"
                        : confirmingDowngrade
                        ? "Confirmation needed"
                        : account.warmUpPhase
                    }
                    tone={confirmingDowngrade ? "amber" : "slate"}
                    active={confirmingDowngrade}
                    onClick={() => handleDowngradeWarmup(account)}
                    disabled={accountBusy || account.warmUpPhase === "MANUAL"}
                  />

                  <AccountActionButton
                    title={showCapsFor === account.id ? "Close limits" : "Edit daily limits"}
                    description="Tune connection, message, profile view, and search caps."
                    detail="Guardrails"
                    tone="violet"
                    active={showCapsFor === account.id}
                    onClick={() => toggleCapsPanel(account)}
                  />

                  <AccountActionButton
                    title={
                      showCookieFor === account.id
                        ? "Close session"
                        : account.hasSession
                        ? "Refresh LinkedIn"
                        : "Connect LinkedIn"
                    }
                    description={
                      account.hasSession
                        ? "Update the saved login if LinkedIn expires or challenges it."
                        : "Save a LinkedIn login session before campaigns run."
                    }
                    detail={account.hasSession ? "Session saved" : "Required"}
                    tone="teal"
                    active={showCookieFor === account.id}
                    onClick={() => toggleCookiePanel(account.id)}
                  />
                </div>

                {/* Cap editor panel */}
                {showCapsFor === account.id && (
                  <div className="mt-3 space-y-4 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4">
                    <div>
                      <p className="text-xs font-semibold text-violet-300">
                        Daily limit overrides
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-violet-400">
                        Pick your account type to pre-fill safe recommended values, or set custom numbers.
                        Hard ceilings are enforced by the server.
                      </p>
                    </div>

                    {/* Account-type preset picker */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {CAP_PRESETS.map((preset) => {
                        const active = selectedPreset[account.id] === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyPreset(account.id, preset)}
                            className={`rounded-xl border px-3 py-2 text-left transition-all ${
                              active
                                ? "border-violet-400/60 bg-violet-500/20 ring-2 ring-violet-500/30"
                                : "border-white/10 bg-slate-800 hover:border-violet-500/40 hover:bg-violet-500/10"
                            }`}
                          >
                            <p className="text-xs font-semibold text-violet-200">
                              {preset.label}
                            </p>
                            <p className="mt-0.5 text-[10px] text-violet-400">
                              {preset.badge}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    {/* Preset description */}
                    {selectedPreset[account.id] && (() => {
                      const preset = CAP_PRESETS.find(
                        (p) => p.id === selectedPreset[account.id]
                      )!;
                      return (
                        <div className="space-y-2 rounded-xl border border-white/[0.06] bg-slate-800/60 p-3">
                          <p className="text-xs leading-5 text-slate-300">
                            {preset.description}
                          </p>
                          <ul className="space-y-1">
                            {preset.caveats.map((c) => (
                              <li key={c} className="flex items-start gap-1.5 text-[11px] text-slate-400">
                                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                                {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}

                    {capError && (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                        {capError}
                      </div>
                    )}

                    {/* Input grid */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {CAP_KEYS.map((key) => {
                        const val = draft[key] ?? SYSTEM_CAPS[key];
                        const info = CAP_FIELD_INFO[key];
                        const weekly = Math.round(val * 6);
                        const safeColor =
                          val <= info.safeZone
                            ? "text-emerald-400"
                            : val <= info.amberZone
                            ? "text-amber-400"
                            : "text-red-400";
                        const safeLabel =
                          val <= info.safeZone
                            ? "safe"
                            : val <= info.amberZone
                            ? "borderline"
                            : "risky";
                        return (
                          <div key={key} className="rounded-xl border border-white/[0.06] bg-slate-800/60 p-3">
                            <div className="mb-1.5 flex items-center justify-between">
                              <label className="text-xs font-semibold text-violet-300">
                                {CAP_LABELS[key]}
                              </label>
                              <span className={`text-[10px] font-semibold ${safeColor}`}>
                                {safeLabel}
                              </span>
                            </div>
                            <input
                              type="number"
                              min={1}
                              max={HARD_CEILING[key]}
                              value={val}
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                setSelectedPreset((prev) => ({ ...prev, [account.id]: null }));
                                setCapDrafts((prev) => ({
                                  ...prev,
                                  [account.id]: {
                                    ...prev[account.id],
                                    [key]: isNaN(n) ? SYSTEM_CAPS[key] : n,
                                  },
                                }));
                              }}
                              className="field w-full"
                            />
                            <div className="mt-1.5 space-y-0.5">
                              {key === "connection" && (
                                <p className={`text-[10px] font-medium ${safeColor}`}>
                                  ~{weekly}/week
                                  {val > info.amberZone
                                    ? " — exceeds LinkedIn's ~100/week guideline"
                                    : val > info.safeZone
                                    ? " — approaching LinkedIn's ~100/week guideline"
                                    : " — under LinkedIn's ~100/week soft cap"}
                                </p>
                              )}
                              <p className="text-[10px] text-slate-500">
                                {info.weeklyNote}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                System default {SYSTEM_CAPS[key]} · Hard ceiling {HARD_CEILING[key]}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => handleSaveCaps(account.id)}
                        disabled={savingCaps}
                        className="btn-primary px-4 py-1.5"
                      >
                        {savingCaps ? "Saving..." : "Save limits"}
                      </button>
                      <button
                        onClick={() => {
                          applyPreset(
                            account.id,
                            CAP_PRESETS.find((p) => p.id === "established")!
                          );
                        }}
                        className="text-xs text-violet-600 underline-offset-2 hover:underline"
                      >
                        Use established defaults
                      </button>
                    </div>
                  </div>
                )}

                {/* LinkedIn session panel */}
                {showCookieFor === account.id && (
                  <div className="mt-3 space-y-3 rounded-2xl border border-teal-500/30 bg-teal-500/5 p-4">
                    <div>
                      <p className="text-xs font-semibold text-teal-300">
                        {account.hasSession ? "Refresh LinkedIn session" : "Connect LinkedIn session"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-teal-400">
                        Export your LinkedIn session cookies from the browser where you are already logged in, then paste them below. This is a one-time setup — Vectra reuses the saved session for all campaign runs.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-4">
                      {[
                        {
                          step: 1,
                          title: "Install extension",
                          body: "Cookie-Editor",
                          href: "https://cookie-editor.com",
                        },
                        {
                          step: 2,
                          title: "Go to LinkedIn",
                          body: "Make sure you are logged in to the correct account.",
                          href: "https://www.linkedin.com",
                        },
                        {
                          step: 3,
                          title: "Export cookies",
                          body: 'Click the Cookie-Editor icon → "Export" → copies to clipboard.',
                          href: null,
                        },
                        {
                          step: 4,
                          title: "Paste below",
                          body: "Paste the copied JSON into the field below and save.",
                          href: null,
                        },
                      ].map(({ step, title, body, href }) => (
                        <div
                          key={step}
                          className="rounded-xl border border-white/[0.06] bg-slate-800/60 p-3 text-xs leading-5 text-slate-300"
                        >
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-300">
                            Step {step}
                          </span>
                          <span className="font-medium text-slate-200">{title}</span>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 block text-teal-400 underline underline-offset-2 hover:text-teal-300"
                            >
                              {body} ↗
                            </a>
                          ) : (
                            <p className="mt-1 text-slate-400">{body}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    <textarea
                      rows={5}
                      value={cookieInputs[account.id] ?? ""}
                      onChange={(e) =>
                        setCookieInputs((prev) => ({
                          ...prev,
                          [account.id]: e.target.value,
                        }))
                      }
                      placeholder='Paste cookie JSON here — e.g. [{"name":"li_at","value":"...","domain":".linkedin.com",...}]'
                      className="field w-full font-mono text-xs"
                    />
                    <label className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-slate-800/60 p-3 text-xs leading-5 text-teal-200">
                      <input
                        type="checkbox"
                        checked={cookieConsent[account.id] ?? false}
                        onChange={(e) =>
                          setCookieConsent((prev) => ({
                            ...prev,
                            [account.id]: e.target.checked,
                          }))
                        }
                        className="mt-1 h-4 w-4 rounded border-teal-300 text-teal-600"
                      />
                      <span>
                        I authorize Vectra to store this encrypted LinkedIn session
                        and use it only for automation on this account.
                      </span>
                    </label>
                    {account.cookiesConsentAt && (
                      <p className="text-[11px] text-teal-400">
                        Last session consent recorded{" "}
                        {new Date(account.cookiesConsentAt).toLocaleString()}.
                      </p>
                    )}
                    <button
                      onClick={() => handleUploadCookies(account.id)}
                      disabled={uploadingCookies || !(cookieInputs[account.id]?.trim())}
                      className="btn-primary px-4 py-1.5"
                    >
                      {uploadingCookies ? "Saving..." : "Save session"}
                    </button>
                  </div>
                )}
              </div>

              {/* Session row */}
              <div className={`rounded-2xl border px-4 py-3 text-sm ${session.className}`}>
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-semibold">{session.label}</span>
                  <span className="text-xs opacity-90">{session.detail}</span>
                </div>
              </div>

              {/* Proxy row */}
              <div className="flex items-center gap-2 rounded-2xl bg-slate-800/50 px-4 py-3 text-sm">
                <span className="w-16 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Proxy
                </span>
                {account.proxy ? (
                  <>
                    <span className="text-slate-300">
                      {account.proxy.country}
                      {account.proxy.city ? ` - ${account.proxy.city}` : ""}
                    </span>
                    <Badge value={account.proxy.healthStatus} />
                    {accountProxyWarning && (
                      <span className="text-xs font-medium text-amber-400">
                        Location mismatch
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-xs italic text-slate-400">
                    No proxy assigned - jobs are blocked until a residential IP
                    is added
                  </span>
                )}
              </div>
              {accountProxyWarning && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
                  {accountProxyWarning}
                </div>
              )}

              {/* Timezone row */}
              <div className="flex items-center gap-2 rounded-2xl bg-slate-800/50 px-4 py-3 text-xs text-slate-400">
                <span className="w-16 font-semibold uppercase tracking-[0.12em] text-slate-500">TZ</span>
                <span>
                  {account.timezone} - Actions fire 8am-7pm local time
                </span>
              </div>

              {/* Daily caps */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Today&apos;s usage
                </p>
                <div className="space-y-2">
                  {CAP_KEYS.map((key) => (
                    <CapBar
                      key={key}
                      label={CAP_LABELS[key]}
                      used={todayCaps[key] ?? 0}
                      cap={effectiveCap(account, key)}
                    />
                  ))}
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
