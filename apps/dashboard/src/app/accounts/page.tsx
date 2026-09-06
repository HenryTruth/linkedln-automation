"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Skeleton, SkeletonPageHeader } from "@/components/Skeleton";
import {
  api,
  type Account,
  type Checkpoint,
  type Proxy,
  type CapKey,
  type BrowserSessionStatus,
  SYSTEM_CAPS,
  HARD_CEILING,
  CAP_LABELS,
} from "@/lib/api";
import { Badge } from "@/components/Badge";
import { HealthScore } from "@/components/HealthScore";
import { track, EVENTS } from "@/lib/analytics";

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

type BrowserPanelState = {
  status?: BrowserSessionStatus;
  open: boolean;
  url: string;
  refreshKey: number;
};

const LINKEDIN_LOGIN_URL = "https://www.linkedin.com/login";
const LINKEDIN_FEED_URL = "https://www.linkedin.com/feed/";

function profileStatusLabel(status: Account["browserProfileStatus"]) {
  if (status === "AUTHENTICATED") return "Logged in";
  if (status === "LOGIN_REQUIRED") return "Login needed";
  if (status === "CHECKPOINT") return "Checkpoint";
  return "Unchecked";
}

function profileStatusClass(status: Account["browserProfileStatus"]) {
  if (status === "AUTHENTICATED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "CHECKPOINT") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (status === "LOGIN_REQUIRED") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-white/10 bg-slate-900 text-slate-300";
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

type SetupStepStatus = "done" | "needed" | "optional";

function SetupStep({
  number,
  title,
  status,
  statusLabel,
  children,
}: {
  number: number;
  title: string;
  status: SetupStepStatus;
  statusLabel?: string;
  children: React.ReactNode;
}) {
  const badgeClasses: Record<SetupStepStatus, string> = {
    done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    needed: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    optional: "border-white/10 bg-slate-900 text-slate-400",
  };
  const dotClasses: Record<SetupStepStatus, string> = {
    done: "bg-emerald-400 text-slate-950",
    needed: "bg-amber-400 text-slate-950",
    optional: "bg-slate-700 text-slate-300",
  };
  const defaultLabel: Record<SetupStepStatus, string> = {
    done: "Done",
    needed: "Needed",
    optional: "Optional",
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${dotClasses[status]}`}
          >
            {number}
          </span>
          <p className="text-sm font-semibold text-white">{title}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badgeClasses[status]}`}
        >
          {statusLabel ?? defaultLabel[status]}
        </span>
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
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
  const [uploadingCookies, setUploadingCookies] = useState(false);
  const [sessionMethod, setSessionMethod] = useState<Record<string, "browser" | "cookies">>({});
  const [showAdvancedFor, setShowAdvancedFor] = useState<string | null>(null);
  const [quickProxyBusy, setQuickProxyBusy] = useState<string | null>(null);

  // Hosted persistent browser session state
  const [browserPanels, setBrowserPanels] = useState<Record<string, BrowserPanelState>>({});
  const [browserBusy, setBrowserBusy] = useState<string | null>(null);
  const [largeBrowserFor, setLargeBrowserFor] = useState<string | null>(null);
  const browserImageRefs = useRef<Record<string, HTMLImageElement | null>>({});
  const largeBrowserRef = useRef<HTMLDivElement | null>(null);
  const browserTypeBuffers = useRef<Record<string, string>>({});
  const browserTypeTimers = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const browserKeyboardQueues = useRef<Record<string, Promise<void>>>({});

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
  const [editAutomationMode, setEditAutomationMode] = useState<"FULL" | "POSTING_ONLY">("FULL");
  const [editSalesNavigatorEnabled, setEditSalesNavigatorEnabled] = useState(false);
  const [editInMailMonthlyLimit, setEditInMailMonthlyLimit] = useState(50);
  const [savingEdit, setSavingEdit] = useState(false);

  // Add account form
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newTimezone, setNewTimezone] = useState("America/New_York");
  const [newProxyId, setNewProxyId] = useState("");
  const [newAutomationMode, setNewAutomationMode] = useState<"FULL" | "POSTING_ONLY">("FULL");
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
    openCapsEditor(account);
  }

  function toggleAdvanced(accountId: string) {
    setShowAdvancedFor((v) => (v === accountId ? null : accountId));
  }

  async function handleQuickAssignProxy(account: Account, proxyId: string) {
    setQuickProxyBusy(account.id);
    clearAccountNotice(account.id);
    try {
      await api.accounts.update(account.id, { proxyId: proxyId || null });
      if (proxyId) track(EVENTS.CONNECTED_PROXY);
      await reload();
      setAccountNotice(
        account.id,
        "success",
        proxyId ? "Proxy assigned." : "Proxy removed."
      );
    } catch (e) {
      setAccountNotice(account.id, "error", (e as Error).message);
    } finally {
      setQuickProxyBusy(null);
    }
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("linkedin");
    if (result === "connected") {
      setNotice((prev) => ({
        ...prev,
        _global: {
          type: "success",
          message: "LinkedIn posting API connected. You can now publish text posts from Posts.",
        },
      }));
      track(EVENTS.CONNECTED_OAUTH);
      reload().catch(() => {});
    }
    if (result === "error") {
      setNotice((prev) => ({
        ...prev,
        _global: {
          type: "error",
          message: params.get("message") ?? "LinkedIn posting API connection failed.",
        },
      }));
    }
    if (result) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!largeBrowserFor) return;
    const id = window.setTimeout(() => {
      largeBrowserRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(id);
  }, [largeBrowserFor]);

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
        automationMode: newAutomationMode,
        salesNavigatorEnabled: newAutomationMode === "FULL" ? newSalesNavigatorEnabled : false,
        inMailMonthlyLimit: newInMailMonthlyLimit,
      });
      if (newProxyId) track(EVENTS.CONNECTED_PROXY);
      setNewEmail("");
      setNewProxyId("");
      setNewAutomationMode("FULL");
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
        setNewAutomationMode("FULL");
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
    setEditAutomationMode(account.automationMode ?? "FULL");
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
        automationMode: editAutomationMode,
        salesNavigatorEnabled: editAutomationMode === "FULL" ? editSalesNavigatorEnabled : false,
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
      await reload();
      track(EVENTS.IMPORTED_LINKEDIN_COOKIES);
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

  async function handleConnectLinkedInApi(account: Account) {
    setBusy(account.id);
    clearAccountNotice(account.id);
    try {
      const { authorizationUrl } = await api.accounts.startLinkedInOAuth(account.id);
      window.location.href = authorizationUrl;
    } catch (e) {
      setAccountNotice(account.id, "error", (e as Error).message);
      setBusy(null);
    }
  }

  function setBrowserPanel(accountId: string, patch: Partial<BrowserPanelState>) {
    setBrowserPanels((prev) => ({
      ...prev,
      [accountId]: {
        open: prev[accountId]?.open ?? false,
        url: prev[accountId]?.url ?? LINKEDIN_FEED_URL,
        refreshKey: prev[accountId]?.refreshKey ?? 0,
        status: prev[accountId]?.status,
        ...patch,
      },
    }));
  }

  function browserScreenshotSrc(accountId: string) {
    const base = api.browserSessions.screenshotUrl(accountId);
    return `${base}${base.includes("?") ? "&" : "?"}t=${
      browserPanels[accountId]?.refreshKey ?? 0
    }`;
  }

  function enqueueBrowserKeyboard(
    accountId: string,
    action: () => Promise<BrowserSessionStatus>
  ) {
    const previous = browserKeyboardQueues.current[accountId] ?? Promise.resolve();
    browserKeyboardQueues.current[accountId] = previous
      .catch(() => {})
      .then(async () => {
        const status = await action();
        setBrowserPanel(accountId, {
          status,
          url: status.url,
          refreshKey: Date.now(),
        });
      })
      .catch((e) => {
        setAccountNotice(accountId, "error", (e as Error).message);
      });
  }

  function flushBrowserText(accountId: string) {
    const text = browserTypeBuffers.current[accountId];
    if (!text) return;
    browserTypeBuffers.current[accountId] = "";
    enqueueBrowserKeyboard(accountId, () => api.browserSessions.type(accountId, text));
  }

  function queueBrowserText(accountId: string, text: string) {
    browserTypeBuffers.current[accountId] =
      (browserTypeBuffers.current[accountId] ?? "") + text;
    const existingTimer = browserTypeTimers.current[accountId];
    if (existingTimer) clearTimeout(existingTimer);
    browserTypeTimers.current[accountId] = setTimeout(() => {
      flushBrowserText(accountId);
    }, 180);
  }

  function handleLiveBrowserKeyDown(
    accountId: string,
    event: React.KeyboardEvent<HTMLDivElement>
  ) {
    if (!browserPanels[accountId]?.open) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key.length === 1) {
      event.preventDefault();
      queueBrowserText(accountId, event.key);
      return;
    }

    const supportedKeys = new Set([
      "Enter",
      "Tab",
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
    ]);
    if (!supportedKeys.has(event.key)) return;

    event.preventDefault();
    flushBrowserText(accountId);
    enqueueBrowserKeyboard(accountId, () =>
      api.browserSessions.press(accountId, event.key)
    );
  }

  function handleLiveBrowserPaste(
    accountId: string,
    event: React.ClipboardEvent<HTMLDivElement>
  ) {
    const text = event.clipboardData.getData("text");
    if (!text) return;
    event.preventDefault();
    queueBrowserText(accountId, text);
  }

  function requireProxyThen(account: Account, action: () => void) {
    if (!account.proxy) {
      toast.error("Assign a proxy in Step 1 first to use the hosted browser.");
      return;
    }
    action();
  }

  async function handleStartBrowser(account: Account, requestedUrl?: string) {
    const url = requestedUrl || browserPanels[account.id]?.url || LINKEDIN_FEED_URL;
    setBrowserBusy(account.id);
    clearAccountNotice(account.id);
    try {
      const status = await api.browserSessions.start(account.id, url);
      setBrowserPanel(account.id, {
        open: true,
        status,
        url: status.url || url,
        refreshKey: Date.now(),
      });
      setAccountNotice(account.id, "success", "Hosted browser session started.");
    } catch (e) {
      setAccountNotice(account.id, "error", (e as Error).message);
    } finally {
      setBrowserBusy(null);
    }
  }

  async function handleQuickNavigate(account: Account, url: string) {
    if (!browserPanels[account.id]?.open) {
      await handleStartBrowser(account, url);
      return;
    }
    setBrowserPanel(account.id, { url });
    setBrowserBusy(account.id);
    clearAccountNotice(account.id);
    try {
      const status = await api.browserSessions.navigate(account.id, url);
      setBrowserPanel(account.id, {
        status,
        url: status.url,
        refreshKey: Date.now(),
      });
    } catch (e) {
      setAccountNotice(account.id, "error", (e as Error).message);
    } finally {
      setBrowserBusy(null);
    }
  }

  async function handleStopBrowser(accountId: string) {
    setBrowserBusy(accountId);
    try {
      await api.browserSessions.stop(accountId);
      setBrowserPanel(accountId, { open: false, status: undefined });
      setAccountNotice(accountId, "success", "Hosted browser session stopped.");
    } catch (e) {
      setAccountNotice(accountId, "error", (e as Error).message);
    } finally {
      setBrowserBusy(null);
    }
  }

  async function handleLogoutLinkedIn(accountId: string) {
    setBrowserBusy(accountId);
    clearAccountNotice(accountId);
    try {
      await api.browserSessions.logout(accountId);
      setBrowserPanel(accountId, {
        open: false,
        status: undefined,
        url: LINKEDIN_LOGIN_URL,
        refreshKey: Date.now(),
      });
      await reload();
      setAccountNotice(
        accountId,
        "success",
        "LinkedIn was logged out from the hosted browser. Open Connect / Login to sign in again."
      );
    } catch (e) {
      setAccountNotice(accountId, "error", (e as Error).message);
    } finally {
      setBrowserBusy(null);
    }
  }

  async function refreshBrowser(accountId: string) {
    setBrowserBusy(accountId);
    try {
      const status = await api.browserSessions.status(accountId);
      setBrowserPanel(accountId, {
        status,
        url: status.url,
        refreshKey: Date.now(),
      });
    } catch (e) {
      setAccountNotice(accountId, "error", (e as Error).message);
    } finally {
      setBrowserBusy(null);
    }
  }

  async function handleBrowserNavigate(accountId: string) {
    const url = browserPanels[accountId]?.url?.trim();
    if (!url) return;
    setBrowserBusy(accountId);
    try {
      const status = await api.browserSessions.navigate(accountId, url);
      setBrowserPanel(accountId, {
        status,
        url: status.url,
        refreshKey: Date.now(),
      });
    } catch (e) {
      setAccountNotice(accountId, "error", (e as Error).message);
    } finally {
      setBrowserBusy(null);
    }
  }

  async function handleQualifySearch(accountId: string) {
    const url = browserPanels[accountId]?.url?.trim();
    if (!url) return;
    setBrowserBusy(accountId);
    clearAccountNotice(accountId);
    try {
      const status = await api.browserSessions.qualifySearch(accountId, url);
      setBrowserPanel(accountId, {
        open: false,
        status,
        url: status.url,
        refreshKey: Date.now(),
      });
      await reload();
      setAccountNotice(
        accountId,
        "success",
        `Search qualified for ${status.source === "SALES_NAVIGATOR" ? "Sales Navigator" : "LinkedIn"}: ${status.profileLinks} profile links visible, next page ${status.nextButtons > 0 ? "available" : "not available"}. Hosted browser closed so campaign jobs can use the profile.`
      );
    } catch (e) {
      setAccountNotice(accountId, "error", (e as Error).message);
    } finally {
      setBrowserBusy(null);
    }
  }

  async function handleBrowserClick(accountId: string, event: React.MouseEvent<HTMLImageElement>) {
    const img = browserImageRefs.current[accountId];
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = Math.round((event.clientX - rect.left) * scaleX);
    const y = Math.round((event.clientY - rect.top) * scaleY);
    setBrowserBusy(accountId);
    try {
      const status = await api.browserSessions.click(accountId, x, y);
      setBrowserPanel(accountId, {
        status,
        url: status.url,
        refreshKey: Date.now(),
      });
    } catch (e) {
      setAccountNotice(accountId, "error", (e as Error).message);
    } finally {
      setBrowserBusy(null);
    }
  }

  async function handleBrowserPress(accountId: string, key: string) {
    setBrowserBusy(accountId);
    try {
      const status = await api.browserSessions.press(accountId, key);
      setBrowserPanel(accountId, {
        status,
        url: status.url,
        refreshKey: Date.now(),
      });
    } catch (e) {
      setAccountNotice(accountId, "error", (e as Error).message);
    } finally {
      setBrowserBusy(null);
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

  const largeBrowserAccount = largeBrowserFor
    ? accounts.find((account) => account.id === largeBrowserFor)
    : null;

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
              What will this account do?
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setNewAutomationMode("FULL")}
                className={`rounded-xl border p-3 text-left transition ${
                  newAutomationMode === "FULL"
                    ? "border-teal-400/60 bg-teal-500/10 ring-2 ring-teal-500/30"
                    : "border-white/10 bg-slate-800 hover:border-teal-500/30"
                }`}
              >
                <p className="text-sm font-semibold text-slate-100">Full automation</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Hosted browser for scraping, connections, and messages. Requires a residential proxy.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setNewAutomationMode("POSTING_ONLY")}
                className={`rounded-xl border p-3 text-left transition ${
                  newAutomationMode === "POSTING_ONLY"
                    ? "border-teal-400/60 bg-teal-500/10 ring-2 ring-teal-500/30"
                    : "border-white/10 bg-slate-800 hover:border-teal-500/30"
                }`}
              >
                <p className="text-sm font-semibold text-slate-100">Posting only</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Publish through LinkedIn&apos;s official API. No proxy or hosted browser needed.
                </p>
              </button>
            </div>
          </div>

          {newAutomationMode === "FULL" && (
            <>
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
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300">
                    Proxy (required for the hosted browser and scraping)
                  </label>
                  <a
                    href="/proxies"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-teal-400 underline-offset-2 hover:underline"
                  >
                    Manage proxies →
                  </a>
                </div>
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
                    You can save the account now, but the hosted browser,
                    connections/messages, and scraping will not run until a
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
            </>
          )}

          {newAutomationMode === "POSTING_ONLY" && (
            <p className="rounded-xl border border-teal-500/30 bg-teal-500/5 px-3 py-2 text-xs leading-5 text-teal-300">
              No proxy or hosted browser setup needed. After saving, use
              &quot;Connect posting API&quot; on the account card to authorize
              LinkedIn and start publishing.
            </p>
          )}

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
      {notice._global && (
        <div
          className={`rounded-2xl border p-4 text-sm ${
            notice._global.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : notice._global.type === "info"
              ? "border-sky-500/30 bg-sky-500/10 text-sky-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {notice._global.message}
        </div>
      )}
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
          const isPostingOnly = account.automationMode === "POSTING_ONLY";
          const accountProxyWarning = account.proxy
            ? locationMismatchMessage(account.proxy, account.timezone)
            : null;

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
                    {isPostingOnly ? (
                      <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-teal-300">
                        Posting only
                      </span>
                    ) : (
                      <Badge value={account.warmUpPhase} />
                    )}
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

              {isPostingOnly ? (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Posting-only account
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      Publishes through LinkedIn&apos;s official API
                    </p>
                    <p className="mt-2 max-w-md text-xs leading-5 text-slate-400">
                      No proxy or hosted browser is used for this account. Switch to
                      full automation mode via Edit if you also want scraping,
                      connections, or messages.
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    account.hasLinkedInApiConnection
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-white/10 bg-slate-900 text-slate-400"
                  }`}>
                    Posting API {account.hasLinkedInApiConnection ? "connected" : "not connected"}
                  </span>
                </div>
                <div className="mt-3 sm:max-w-sm">
                  <AccountActionButton
                    title={
                      account.hasLinkedInApiConnection
                        ? "Reconnect posting API"
                        : "Connect posting API"
                    }
                    description="Authorize Share on LinkedIn so saved posts can publish through the official API."
                    detail={
                      account.linkedinConnectedAt
                        ? `Connected ${new Date(account.linkedinConnectedAt).toLocaleDateString()}`
                        : "OAuth required"
                    }
                    tone="teal"
                    onClick={() => handleConnectLinkedInApi(account)}
                    disabled={accountBusy}
                  />
                </div>
              </div>
              ) : (
              <div className="space-y-4">
                <div className="sm:max-w-xs">
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
                </div>

                <SetupStep
                  number={1}
                  title="Proxy"
                  status={account.proxy ? "done" : "needed"}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={account.proxy?.id ?? ""}
                      onChange={(e) => handleQuickAssignProxy(account, e.target.value)}
                      disabled={quickProxyBusy === account.id}
                      className="field min-w-[12rem] flex-1"
                    >
                      <option value="">No proxy</option>
                      {proxies.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.country}{p.city ? ` - ${p.city}` : ""} — {p.host}:{p.port} [{p.healthStatus}]
                        </option>
                      ))}
                    </select>
                    {account.proxy && <Badge value={account.proxy.healthStatus} />}
                    <a
                      href="/proxies"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-teal-400 underline-offset-2 hover:underline"
                    >
                      Manage proxies →
                    </a>
                  </div>
                  {accountProxyWarning && (
                    <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                      {accountProxyWarning}
                    </p>
                  )}
                  {!account.proxy && (
                    <p className="text-xs leading-5 text-slate-400">
                      Needed for the hosted browser, connections/messages, and
                      scraping. Not required to post through the LinkedIn API —
                      see Posting API below. No proxy yet?{" "}
                      <a
                        href="/proxies"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-400 underline underline-offset-2 hover:text-teal-300"
                      >
                        Add one on the Proxies page ↗
                      </a>
                    </p>
                  )}
                </SetupStep>

                <SetupStep
                  number={2}
                  title="LinkedIn session"
                  status={
                    account.hasSession || account.browserProfileStatus === "AUTHENTICATED"
                      ? "done"
                      : "needed"
                  }
                >
                  <p className="text-xs leading-5 text-slate-400">
                    Both options below do the same thing — get LinkedIn signed in
                    for automation. Pick whichever is easier.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSessionMethod((prev) => ({ ...prev, [account.id]: "browser" }))}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        (sessionMethod[account.id] ?? (account.cookiesConsentAt ? "cookies" : "browser")) === "browser"
                          ? "border-teal-400/60 bg-teal-500/10 text-teal-200"
                          : "border-white/10 bg-slate-900 text-slate-400 hover:border-teal-500/30"
                      }`}
                    >
                      Log in inside hosted browser
                    </button>
                    <button
                      type="button"
                      onClick={() => setSessionMethod((prev) => ({ ...prev, [account.id]: "cookies" }))}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                        (sessionMethod[account.id] ?? (account.cookiesConsentAt ? "cookies" : "browser")) === "cookies"
                          ? "border-teal-400/60 bg-teal-500/10 text-teal-200"
                          : "border-white/10 bg-slate-900 text-slate-400 hover:border-teal-500/30"
                      }`}
                    >
                      Paste session cookies
                    </button>
                  </div>

                  {(sessionMethod[account.id] ?? (account.cookiesConsentAt ? "cookies" : "browser")) === "browser" ? (
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-xs font-semibold">
                        <span className={`rounded-full border px-3 py-1 ${profileStatusClass(account.browserProfileStatus)}`}>
                          {profileStatusLabel(account.browserProfileStatus)}
                        </span>
                        <span className={`rounded-full border px-3 py-1 ${
                          browserPanels[account.id]?.open
                            ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                            : "border-white/10 bg-slate-900 text-slate-400"
                        }`}>
                          Browser {browserPanels[account.id]?.open ? "open" : "closed"}
                        </span>
                        <span className={`rounded-full border px-3 py-1 ${
                          account.lastSearchQualifiedAt
                            ? "border-teal-500/30 bg-teal-500/10 text-teal-300"
                            : "border-white/10 bg-slate-900 text-slate-400"
                        }`}>
                          Search {account.lastSearchQualifiedAt ? "qualified" : "unqualified"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => requireProxyThen(account, () => handleQuickNavigate(account, LINKEDIN_LOGIN_URL))}
                          disabled={browserBusy === account.id}
                          className="btn-primary text-xs"
                        >
                          Log in inside hosted browser
                        </button>
                        <button
                          type="button"
                          onClick={() => requireProxyThen(account, () => handleQuickNavigate(account, LINKEDIN_FEED_URL))}
                          disabled={browserBusy === account.id}
                          className="btn-secondary text-xs"
                        >
                          Open LinkedIn
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            requireProxyThen(account, () =>
                              browserPanels[account.id]?.open
                                ? refreshBrowser(account.id)
                                : handleStartBrowser(account)
                            )
                          }
                          disabled={browserBusy === account.id}
                          className="btn-secondary text-xs"
                        >
                          {browserPanels[account.id]?.open ? "Refresh" : "Open saved"}
                        </button>
                        {browserPanels[account.id]?.open && (
                          <button
                            type="button"
                            onClick={() => handleStopBrowser(account.id)}
                            disabled={browserBusy === account.id}
                            className="rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                          >
                            Stop
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleLogoutLinkedIn(account.id)}
                          disabled={browserBusy === account.id}
                          className="rounded-xl border border-red-500/30 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Log out LinkedIn
                        </button>
                      </div>

                      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs leading-5 text-sky-300">
                        <span className="font-semibold">Automation reserves this account.</span>{" "}
                        Users can stay logged into LinkedIn elsewhere, but should avoid
                        manual searching, profile browsing, messaging, or connection
                        actions while jobs are running.
                      </div>

                      {!account.proxy && (
                        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                          Assign a proxy in Step 1 first to use the hosted browser.
                        </p>
                      )}

                      {browserPanels[account.id]?.open && (
                        <div className="space-y-4">
                          <div className="grid gap-2 lg:grid-cols-[auto_auto_1fr_auto_auto]">
                            <button
                              type="button"
                              onClick={() => handleQuickNavigate(account, LINKEDIN_LOGIN_URL)}
                              disabled={browserBusy === account.id}
                              className="btn-secondary text-xs"
                            >
                              Login
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickNavigate(account, LINKEDIN_FEED_URL)}
                              disabled={browserBusy === account.id}
                              className="btn-secondary text-xs"
                            >
                              Feed
                            </button>
                            <input
                              type="url"
                              value={browserPanels[account.id]?.url ?? ""}
                              onChange={(e) =>
                                setBrowserPanel(account.id, { url: e.target.value })
                              }
                              className="field w-full text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => handleBrowserNavigate(account.id)}
                              disabled={browserBusy === account.id}
                              className="btn-secondary text-xs"
                            >
                              Go
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQualifySearch(account.id)}
                              disabled={browserBusy === account.id}
                              className="btn-secondary text-xs text-emerald-300"
                            >
                              Qualify search
                            </button>
                          </div>

                          {browserPanels[account.id]?.status && (
                            <div className="grid gap-2 text-xs sm:grid-cols-4">
                              <div className="rounded-xl border border-white/10 bg-slate-900 p-3">
                                <p className="text-slate-500">Auth</p>
                                <p className="mt-1 font-semibold text-slate-200">
                                  {browserPanels[account.id]?.status?.authenticated
                                    ? "OK"
                                    : "Needs login"}
                                </p>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-slate-900 p-3">
                                <p className="text-slate-500">Search</p>
                                <p className="mt-1 font-semibold text-slate-200">
                                  {browserPanels[account.id]?.status?.searchQualified
                                    ? "Qualified"
                                    : "Not ready"}
                                </p>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-slate-900 p-3">
                                <p className="text-slate-500">Links</p>
                                <p className="mt-1 font-semibold text-slate-200">
                                  {browserPanels[account.id]?.status?.profileLinks ?? 0}
                                </p>
                              </div>
                              <div className="rounded-xl border border-white/10 bg-slate-900 p-3">
                                <p className="text-slate-500">Next</p>
                                <p className="mt-1 font-semibold text-slate-200">
                                  {browserPanels[account.id]?.status?.nextButtons ?? 0}
                                </p>
                              </div>
                            </div>
                          )}

                          <div className="grid gap-2 text-xs sm:grid-cols-2">
                            <div className="rounded-xl border border-white/10 bg-slate-900 p-3">
                              <p className="font-semibold text-slate-300">Browser profile</p>
                              <p className="mt-1 text-slate-400">
                                {account.browserProfileStatus}
                                {account.browserProfileLastCheckedAt
                                  ? ` - checked ${new Date(account.browserProfileLastCheckedAt).toLocaleString()}`
                                  : ""}
                              </p>
                              {account.browserProfileLastCheckError && (
                                <p className="mt-1 text-amber-300">
                                  {account.browserProfileLastCheckError}
                                </p>
                              )}
                            </div>
                            <div className="rounded-xl border border-white/10 bg-slate-900 p-3">
                              <p className="font-semibold text-slate-300">Search qualification</p>
                              {account.lastSearchQualifiedAt ? (
                                <>
                                  <p className="mt-1 text-slate-400">
                                    {account.lastSearchQualifiedSource ?? "LINKEDIN"} - {account.lastSearchQualifiedProfileLinks ?? 0} links, next {account.lastSearchQualifiedNextButtons ?? 0}
                                  </p>
                                  <p className="mt-1 break-all font-mono text-[11px] text-slate-500">
                                    {account.lastSearchQualifiedUrl}
                                  </p>
                                </>
                              ) : (
                                <p className="mt-1 text-slate-400">
                                  No qualified multi-page search yet.
                                </p>
                              )}
                              {account.lastSearchQualificationError && (
                                <p className="mt-1 text-amber-300">
                                  {account.lastSearchQualificationError}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                              Remote browser
                            </p>
                            <button
                              type="button"
                              onClick={() => setLargeBrowserFor(account.id)}
                              disabled={browserBusy === account.id}
                              className="btn-primary px-3 py-1.5 text-xs"
                            >
                              Open large browser
                            </button>
                          </div>

                          <div className="overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl shadow-black/30">
                            <img
                              ref={(el) => {
                                browserImageRefs.current[account.id] = el;
                              }}
                              src={browserScreenshotSrc(account.id)}
                              alt="Hosted LinkedIn browser"
                              onClick={(e) => handleBrowserClick(account.id, e)}
                              className="block w-full cursor-crosshair"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-teal-300">
                        {account.hasSession ? "Refresh LinkedIn session" : "Connect LinkedIn session"}
                      </p>
                      <p className="text-xs leading-5 text-slate-400">
                        Export your LinkedIn session cookies from the browser where you are already logged in, then paste them below. This is a one-time setup — Vectra reuses the saved session for all campaign runs.
                      </p>
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
                </SetupStep>
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
                      Automation mode
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setEditAutomationMode("FULL")}
                        className={`rounded-xl border p-2.5 text-left text-xs transition ${
                          editAutomationMode === "FULL"
                            ? "border-teal-400/60 bg-teal-500/10 ring-2 ring-teal-500/30"
                            : "border-white/10 bg-slate-800 hover:border-teal-500/30"
                        }`}
                      >
                        <span className="block font-semibold text-slate-100">Full automation</span>
                        <span className="mt-0.5 block text-slate-400">Hosted browser, scraping, campaigns. Needs a proxy.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditAutomationMode("POSTING_ONLY")}
                        className={`rounded-xl border p-2.5 text-left text-xs transition ${
                          editAutomationMode === "POSTING_ONLY"
                            ? "border-teal-400/60 bg-teal-500/10 ring-2 ring-teal-500/30"
                            : "border-white/10 bg-slate-800 hover:border-teal-500/30"
                        }`}
                      >
                        <span className="block font-semibold text-slate-100">Posting only</span>
                        <span className="mt-0.5 block text-slate-400">LinkedIn API publishing. No proxy needed.</span>
                      </button>
                    </div>
                  </div>
                  {editAutomationMode === "FULL" && (
                    <>
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
                        <div className="mb-1 flex items-center justify-between">
                          <label className="block text-xs font-semibold text-slate-400">
                            Proxy
                          </label>
                          <a
                            href="/proxies"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold text-teal-400 underline-offset-2 hover:underline"
                          >
                            Manage proxies →
                          </a>
                        </div>
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
                    </>
                  )}
                  {editAutomationMode === "POSTING_ONLY" && (
                    <p className="rounded-xl border border-teal-500/30 bg-teal-500/5 px-3 py-2 text-xs leading-5 text-teal-300">
                      No proxy or hosted browser needed in this mode. Existing
                      proxy assignment and warm-up state are kept but unused.
                    </p>
                  )}
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

              {!isPostingOnly && (
              <>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Posting API
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Independent of the proxy/session setup above — works whether
                      or not that setup is complete.
                    </p>
                  </div>
                  {accountBusy && (
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-300">
                      Working...
                    </span>
                  )}
                </div>
                <div className="mt-3 sm:max-w-sm">
                  <AccountActionButton
                    title={
                      account.hasLinkedInApiConnection
                        ? "Reconnect posting API"
                        : "Connect posting API"
                    }
                    description="Authorize Share on LinkedIn so saved posts can publish through the official API."
                    detail={
                      account.linkedinConnectedAt
                        ? `Connected ${new Date(account.linkedinConnectedAt).toLocaleDateString()}`
                        : "OAuth required"
                    }
                    tone="teal"
                    onClick={() => handleConnectLinkedInApi(account)}
                    disabled={accountBusy}
                  />
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => toggleAdvanced(account.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-slate-950/40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 transition hover:border-white/20 hover:text-slate-200"
                >
                  Advanced: warm-up & limits
                  <span className="text-slate-500">
                    {showAdvancedFor === account.id ? "Hide ▲" : "Show ▼"}
                  </span>
                </button>

                {showAdvancedFor === account.id && (
                  <div className="mt-3 space-y-3 rounded-2xl border border-white/[0.06] bg-slate-950/40 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
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

                    {/* Timezone */}
                    <div className="flex items-center gap-2 rounded-xl bg-slate-800/50 px-4 py-3 text-xs text-slate-400">
                      <span className="w-16 font-semibold uppercase tracking-[0.12em] text-slate-500">TZ</span>
                      <span>
                        {account.timezone} - Actions fire 8am-7pm local time
                      </span>
                    </div>

                    {/* Today's usage */}
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
                )}
              </div>
              </>
              )}
            </div>
          );
        })}
      </div>

      {largeBrowserAccount && browserPanels[largeBrowserAccount.id]?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div
            ref={largeBrowserRef}
            tabIndex={0}
            onKeyDown={(event) =>
              handleLiveBrowserKeyDown(largeBrowserAccount.id, event)
            }
            onPaste={(event) =>
              handleLiveBrowserPaste(largeBrowserAccount.id, event)
            }
            className="flex h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl outline-none ring-2 ring-teal-500/30"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {largeBrowserAccount.email}
                </p>
                <p className="mt-1 truncate text-xs text-slate-400">
                  {browserPanels[largeBrowserAccount.id]?.status?.title ||
                    browserPanels[largeBrowserAccount.id]?.url}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => refreshBrowser(largeBrowserAccount.id)}
                  disabled={browserBusy === largeBrowserAccount.id}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => {
                    flushBrowserText(largeBrowserAccount.id);
                    setLargeBrowserFor(null);
                  }}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  Done
                </button>
              </div>
            </div>

            <div className="grid gap-2 border-b border-white/10 bg-slate-950 p-3 lg:grid-cols-[auto_auto_1fr_auto]">
              <button
                type="button"
                onClick={() =>
                  handleQuickNavigate(largeBrowserAccount, LINKEDIN_LOGIN_URL)
                }
                disabled={browserBusy === largeBrowserAccount.id}
                className="btn-secondary text-xs"
              >
                Login
              </button>
              <button
                type="button"
                onClick={() =>
                  handleQuickNavigate(largeBrowserAccount, LINKEDIN_FEED_URL)
                }
                disabled={browserBusy === largeBrowserAccount.id}
                className="btn-secondary text-xs"
              >
                Feed
              </button>
              <input
                type="url"
                value={browserPanels[largeBrowserAccount.id]?.url ?? ""}
                onChange={(e) =>
                  setBrowserPanel(largeBrowserAccount.id, { url: e.target.value })
                }
                onKeyDown={(e) => e.stopPropagation()}
                onPaste={(e) => e.stopPropagation()}
                className="field w-full text-xs"
              />
              <button
                type="button"
                onClick={() => handleBrowserNavigate(largeBrowserAccount.id)}
                disabled={browserBusy === largeBrowserAccount.id}
                className="btn-secondary text-xs"
              >
                Go
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-black">
              <img
                ref={(el) => {
                  browserImageRefs.current[largeBrowserAccount.id] = el;
                }}
                src={browserScreenshotSrc(largeBrowserAccount.id)}
                alt="Large hosted LinkedIn browser"
                onClick={(event) => {
                  handleBrowserClick(largeBrowserAccount.id, event);
                  window.setTimeout(() => largeBrowserRef.current?.focus(), 0);
                }}
                className="mx-auto block min-h-full w-full cursor-crosshair object-contain"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-900 px-4 py-3">
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-300">
                <span className="rounded-full border border-white/10 bg-slate-800 px-3 py-1">
                  Keyboard live
                </span>
                <span className="rounded-full border border-white/10 bg-slate-800 px-3 py-1">
                  Paste supported
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Click inside LinkedIn, then use your keyboard normally.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
