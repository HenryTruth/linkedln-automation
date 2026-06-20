"use client";

import { useEffect, useState } from "react";
import { api, type Account, type Checkpoint, type Proxy } from "@/lib/api";
import { Badge } from "@/components/Badge";
import { HealthScore } from "@/components/HealthScore";

const BASE_CAPS: Record<string, number> = {
  connection: 15,
  message: 40,
  profileView: 60,
  searchPage: 10,
};

const CAP_LABELS: Record<string, string> = {
  connection: "Connections",
  message: "Messages",
  profileView: "Profile Views",
  searchPage: "Search Pages",
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
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function CapBar({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const danger = pct >= 80;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
        <span>{label}</span>
        <span className={danger ? "text-red-600 font-medium" : ""}>
          {used} / {cap}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full transition-all ${
            danger ? "bg-red-400" : "bg-teal-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // cookie upload state: accountId -> textarea value
  const [cookieInputs, setCookieInputs] = useState<Record<string, string>>({});
  const [showCookieFor, setShowCookieFor] = useState<string | null>(null);
  const [uploadingCookies, setUploadingCookies] = useState(false);

  // Add account form
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newTimezone, setNewTimezone] = useState("America/New_York");
  const [newProxyId, setNewProxyId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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
  }, []);

  async function handleAddAccount(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      await api.accounts.create({
        email: newEmail,
        timezone: newTimezone,
        proxyId: newProxyId || undefined,
      });
      setNewEmail("");
      setNewProxyId("");
      setShowForm(false);
      await reload();
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function handlePause(id: string) {
    setBusy(id);
    try {
      await api.accounts.pause(id);
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleResume(id: string) {
    setBusy(id);
    try {
      await api.accounts.resume(id);
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleAdvanceWarmup(id: string) {
    setBusy(id);
    try {
      await api.accounts.advanceWarmup(id);
      await reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleUploadCookies(id: string) {
    const cookies = cookieInputs[id]?.trim();
    if (!cookies) return;
    setUploadingCookies(true);
    try {
      await api.accounts.uploadCookies(id, cookies);
      setCookieInputs((prev) => ({ ...prev, [id]: "" }));
      setShowCookieFor(null);
      alert("Cookies saved. The account will use them on the next browser session.");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploadingCookies(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

  const today = todayKey();

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
          className="app-panel max-w-2xl space-y-4 border-teal-200 bg-teal-50/70 p-5"
        >
          <h2 className="text-sm font-semibold text-teal-950">
            Add LinkedIn Account
          </h2>
          <p className="text-xs leading-5 text-teal-800">
            After adding, log in manually on LinkedIn once to generate cookies.
            The account will auto-resume from saved cookies on subsequent runs.
          </p>

          {addError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {addError}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
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
            <label className="mb-1 block text-xs font-semibold text-slate-700">
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
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Proxy (optional - assign a residential proxy for this account)
            </label>
            <select
              value={newProxyId}
              onChange={(e) => setNewProxyId(e.target.value)}
              className="field w-full"
            >
              <option value="">No proxy</option>
              {proxies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.country}
                  {p.city ? ` - ${p.city}` : ""} - {p.host}:{p.port} [
                  {p.healthStatus}]
                </option>
              ))}
            </select>
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
        <div className="app-panel border-dashed p-12 text-center">
          <p className="mb-2 font-semibold text-slate-700">
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
          const todayCaps =
            (account.dailyCaps as Record<string, Record<string, number>>)[
              today
            ] ?? {};
          const openCount = checkpoints.filter(
            (cp) => cp.accountId === account.id
          ).length;

          return (
            <div
              key={account.id}
              className={`app-panel space-y-5 p-6 ${
                openCount > 0 || account.status === "RESTRICTED"
                  ? "border-red-300 ring-4 ring-red-100"
                  : account.status === "PAUSED"
                  ? "border-amber-200"
                  : ""
              }`}
            >
              {/* Top row: health + identity + action */}
              <div className="flex items-start gap-4">
                <HealthScore account={account} checkpoints={checkpoints} />

                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {account.email}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge value={account.status} />
                    <Badge value={account.warmUpPhase} />
                  </div>
                  {openCount > 0 && (
                    <p className="mt-2 text-xs font-semibold text-red-600">
                      {openCount} open checkpoint
                      {openCount > 1 ? "s" : ""} - automation paused
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  {account.status === "PAUSED" ||
                  account.status === "RESTRICTED" ? (
                    <button
                      onClick={() => handleResume(account.id)}
                      disabled={
                        busy === account.id || account.status === "RESTRICTED"
                      }
                      className="btn-secondary px-3 py-1.5 text-emerald-700"
                    >
                      {account.status === "RESTRICTED"
                        ? "Restricted"
                        : "Resume"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePause(account.id)}
                      disabled={busy === account.id}
                      className="btn-secondary px-3 py-1.5"
                    >
                      Pause
                    </button>
                  )}
                  <button
                    onClick={() => handleAdvanceWarmup(account.id)}
                    disabled={busy === account.id || account.warmUpPhase === "FULL"}
                    title={account.warmUpPhase === "FULL" ? "Already at full automation" : "Advance to next warm-up phase"}
                    className="btn-secondary px-3 py-1.5 text-violet-700 disabled:opacity-40"
                  >
                    {account.warmUpPhase === "FULL" ? "Fully warmed" : "Advance warm-up"}
                  </button>
                  <button
                    onClick={() =>
                      setShowCookieFor((v) =>
                        v === account.id ? null : account.id
                      )
                    }
                    className="btn-secondary px-3 py-1.5 text-teal-700"
                  >
                    {showCookieFor === account.id ? "Cancel" : "Upload cookies"}
                  </button>
                </div>
              </div>

              {/* Proxy row */}
              <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <span className="w-16 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Proxy
                </span>
                {account.proxy ? (
                  <>
                    <span className="text-slate-700">
                      {account.proxy.country}
                      {account.proxy.city ? ` - ${account.proxy.city}` : ""}
                    </span>
                    <Badge value={account.proxy.healthStatus} />
                  </>
                ) : (
                  <span className="text-xs italic text-slate-400">
                    No proxy assigned - risk of detection without residential
                    IP
                  </span>
                )}
              </div>

              {/* Timezone row */}
              <div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                <span className="w-16 font-semibold uppercase tracking-[0.12em] text-slate-400">TZ</span>
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
                  {Object.entries(BASE_CAPS).map(([key, cap]) => (
                    <CapBar
                      key={key}
                      label={CAP_LABELS[key] ?? key}
                      used={todayCaps[key] ?? 0}
                      cap={cap}
                    />
                  ))}
                </div>
              </div>

              {/* Cookie upload panel */}
              {showCookieFor === account.id && (
                <div className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
                  <p className="text-xs font-semibold text-teal-900">
                    Paste session cookies (JSON array from browser devtools)
                  </p>
                  <p className="text-xs leading-5 text-teal-700">
                    Open LinkedIn in your browser, open DevTools → Application →
                    Cookies, copy all cookies as JSON, then paste below.
                  </p>
                  <textarea
                    rows={5}
                    value={cookieInputs[account.id] ?? ""}
                    onChange={(e) =>
                      setCookieInputs((prev) => ({
                        ...prev,
                        [account.id]: e.target.value,
                      }))
                    }
                    placeholder='[{"name":"li_at","value":"...","domain":".linkedin.com",...}]'
                    className="field w-full font-mono text-xs"
                  />
                  <button
                    onClick={() => handleUploadCookies(account.id)}
                    disabled={
                      uploadingCookies ||
                      !(cookieInputs[account.id]?.trim())
                    }
                    className="btn-primary px-4 py-1.5"
                  >
                    {uploadingCookies ? "Saving..." : "Save Cookies"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
