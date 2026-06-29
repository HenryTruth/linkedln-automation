"use client";

import { useEffect, useState } from "react";
import { api, type Proxy, type ProxyCheapRemoteProxy } from "@/lib/api";
import { Badge } from "@/components/Badge";
import { Skeleton, SkeletonPageHeader, SkeletonTableRows } from "@/components/Skeleton";

type RotationMode = "STATIC" | "STICKY_SESSION";

const rotationOptions: Array<{
  value: RotationMode;
  label: string;
  badge: string;
  tone: string;
  description: string;
}> = [
  {
    value: "STICKY_SESSION",
    label: "Sticky residential",
    badge: "Recommended",
    tone: "border-teal-500/50 bg-teal-500/10 ring-2 ring-teal-500/50",
    description:
      "Keeps one residential exit IP during a browser session, then uses a fresh sticky session later.",
  },
  {
    value: "STATIC",
    label: "Static residential / ISP",
    badge: "Advanced",
    tone: "border-slate-500/50 bg-slate-500/10",
    description:
      "Only use this when the IP is residential or ISP. Avoid static datacenter proxies.",
  },
];

export default function ProxiesPage() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [proxyCheapLoading, setProxyCheapLoading] = useState(false);
  const [proxyCheapImporting, setProxyCheapImporting] = useState(false);
  const [proxyCheapError, setProxyCheapError] = useState<string | null>(null);
  const [proxyCheapProxies, setProxyCheapProxies] = useState<ProxyCheapRemoteProxy[]>([]);
  const [selectedProxyCheapIds, setSelectedProxyCheapIds] = useState<Set<string>>(new Set());
  const [importSummary, setImportSummary] = useState<string | null>(null);

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTemplate, setUsernameTemplate] = useState("");
  const [password, setPassword] = useState("");
  const [rotationMode, setRotationMode] =
    useState<RotationMode>("STICKY_SESSION");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const activeStickyUsername = usernameTemplate || username;
  const stickyTokenPresent = activeStickyUsername.includes("{{sessionId}}");

  function reload() {
    return api.proxies.list().then(setProxies);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setAddError("Port must be a number between 1 and 65535");
      return;
    }
    if (
      rotationMode === "STICKY_SESSION" &&
      usernameTemplate &&
      !usernameTemplate.includes("{{sessionId}}")
    ) {
      setAddError("Username template must include {{sessionId}}.");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      await api.proxies.create({
        host,
        port: portNum,
        country,
        city: city || undefined,
        username,
        usernameTemplate: usernameTemplate || undefined,
        password,
        rotationMode,
      });
      setHost(""); setPort(""); setCountry(""); setCity("");
      setUsername(""); setUsernameTemplate(""); setPassword("");
      setRotationMode("STICKY_SESSION");
      setShowForm(false);
      await reload();
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function handleCheck(id: string) {
    setBusy(id);
    try {
      await api.proxies.check(id);
      await reload();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(id: string, host: string) {
    if (!confirm(`Delete proxy ${host}? Any account using it will lose its proxy assignment.`)) return;
    setBusy(id);
    try {
      await api.proxies.delete(id);
      await reload();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handleLoadProxyCheap() {
    setProxyCheapLoading(true);
    setProxyCheapError(null);
    setImportSummary(null);
    try {
      const result = await api.proxies.listProxyCheap();
      setProxyCheapProxies(result.proxies);
      setSelectedProxyCheapIds(
        new Set(result.proxies.filter((proxy) => proxy.importable).map((proxy) => proxy.id))
      );
    } catch (err) {
      setProxyCheapError((err as Error).message);
    } finally {
      setProxyCheapLoading(false);
    }
  }

  async function handleImportProxyCheap() {
    const proxyIds = Array.from(selectedProxyCheapIds);
    if (proxyIds.length === 0) {
      setProxyCheapError("Select at least one importable Proxy-Cheap proxy.");
      return;
    }

    setProxyCheapImporting(true);
    setProxyCheapError(null);
    setImportSummary(null);
    try {
      const result = await api.proxies.importProxyCheap(proxyIds);
      await reload();
      const skippedText = result.skipped.length
        ? ` ${result.skipped.length} skipped.`
        : "";
      setImportSummary(`Imported ${result.imported.length} proxy profile(s).${skippedText}`);
    } catch (err) {
      setProxyCheapError((err as Error).message);
    } finally {
      setProxyCheapImporting(false);
    }
  }

  function toggleProxyCheapSelection(id: string) {
    setSelectedProxyCheapIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading)
    return (
      <div className="space-y-6">
        <SkeletonPageHeader wide />
        <div className="table-shell">
          <table className="min-w-full">
            <tbody className="divide-y divide-white/[0.06]">
              <SkeletonTableRows cols={6} rows={3} />
            </tbody>
          </table>
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <section className="app-panel p-6 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="page-kicker">Network security</p>
            <h1 className="page-title mt-2">Proxies</h1>
            <p className="page-copy">
              Add residential proxy profiles for LinkedIn accounts. Use
              session-sticky rotation to get one stable IP per browser session,
              then a fresh residential IP on the next session.
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className={showForm ? "btn-secondary" : "btn-primary"}
          >
            {showForm ? "Cancel" : "Add Proxy"}
          </button>
        </div>
      </section>

      <section className="app-panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Import from Proxy-Cheap
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
              Pull active Static Residential ISP proxies from your Proxy-Cheap
              account. Rotating, datacenter, inactive, and IPv6 entries are
              blocked from import.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleLoadProxyCheap}
              disabled={proxyCheapLoading || proxyCheapImporting}
              className="btn-secondary"
            >
              {proxyCheapLoading ? "Loading..." : "Load Proxy-Cheap"}
            </button>
            {proxyCheapProxies.length > 0 && (
              <button
                type="button"
                onClick={handleImportProxyCheap}
                disabled={proxyCheapImporting || selectedProxyCheapIds.size === 0}
                className="btn-primary"
              >
                {proxyCheapImporting
                  ? "Importing..."
                  : `Import Selected (${selectedProxyCheapIds.size})`}
              </button>
            )}
          </div>
        </div>

        {proxyCheapError && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {proxyCheapError}
          </div>
        )}
        {importSummary && (
          <div className="mt-4 rounded-xl border border-teal-500/30 bg-teal-500/10 p-3 text-sm text-teal-300">
            {importSummary}
          </div>
        )}

        {proxyCheapProxies.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full divide-y divide-white/[0.06]">
              <thead className="table-head">
                <tr>
                  {["", "Proxy", "Network", "Country", "Exit IP", "Status"].map((h) => (
                    <th key={h} className="px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {proxyCheapProxies.map((proxy) => (
                  <tr key={proxy.id} className="hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        disabled={!proxy.importable}
                        checked={selectedProxyCheapIds.has(proxy.id)}
                        onChange={() => toggleProxyCheapSelection(proxy.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-xs font-semibold text-slate-100">
                        {proxy.host}:{proxy.httpPort ?? proxy.httpsPort ?? "-"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {proxy.ispName ?? "ISP unknown"} · {proxy.proxyType ?? "HTTP"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {proxy.networkType ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {proxy.countryCode ?? "-"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {proxy.publicIp ?? "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge value={proxy.status} />
                      {!proxy.importable && (
                        <p className="mt-1 max-w-xs text-xs text-amber-400">
                          {proxy.importBlockReason}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add proxy form */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          className="app-panel max-w-2xl space-y-4 border-teal-500/30 bg-teal-500/5 p-5"
        >
          <h2 className="text-sm font-semibold text-teal-200">Add Proxy</h2>
          <p className="text-xs leading-5 text-teal-300">
            Use a residential proxy in the same country or city the LinkedIn
            account normally logs in from. For sticky sessions, add a username
            template that includes
            <code className="mx-1 rounded bg-teal-900/50 px-1">{"{{sessionId}}"}</code>
            unless the provider handles stickiness another way.
          </p>

          {addError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {addError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Host *
              </label>
              <input
                required
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="proxy.example.com"
                className="field w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Port *
              </label>
              <input
                required
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="1080"
                className="field w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Country *
              </label>
              <input
                required
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="US"
                className="field w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                City (optional)
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="New York"
                className="field w-full"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Username *
              </label>
              <input
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="user"
                className="field w-full"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Proxy mode *
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {rotationOptions.map((option) => {
                  const selected = rotationMode === option.value;
                  return (
                    <label
                      key={option.value}
                      className={`cursor-pointer rounded-lg border p-4 transition ${
                        selected
                          ? option.tone
                          : "border-white/[0.08] bg-slate-800/40 hover:border-white/10"
                      }`}
                    >
                      <input
                        type="radio"
                        name="rotationMode"
                        value={option.value}
                        checked={selected}
                        onChange={() => setRotationMode(option.value)}
                        className="sr-only"
                      />
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-100">
                          {option.label}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            option.value === "STICKY_SESSION"
                              ? "bg-teal-500/15 text-teal-400"
                              : "bg-slate-700/50 text-slate-400"
                          }`}
                        >
                          {option.badge}
                        </span>
                      </span>
                      <span className="mt-2 block text-xs leading-5 text-slate-400">
                        {option.description}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            {rotationMode === "STICKY_SESSION" && (
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-300">
                  Username template
                </label>
                <input
                  value={usernameTemplate}
                  onChange={(e) => setUsernameTemplate(e.target.value)}
                  placeholder="user-zone-us-session-{{sessionId}}"
                  className="field w-full"
                />
                {stickyTokenPresent ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Sticky session token detected.
                  </p>
                ) : (
                  <p className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                    Add {"{{sessionId}}"} to the username or template unless
                    your provider gives you a dedicated sticky endpoint.
                  </p>
                )}
              </div>
            )}
            {rotationMode === "STATIC" && (
              <div className="col-span-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-400">
                Static is only appropriate for residential or ISP proxies.
                Datacenter proxies are not recommended for LinkedIn accounts.
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Password *
              </label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="field w-full"
              />
            </div>
          </div>

          <button type="submit" disabled={adding} className="btn-primary">
            {adding ? "Adding..." : "Add Proxy"}
          </button>
        </form>
      )}

      {/* Empty state */}
      {proxies.length === 0 && !showForm && (
        <div className="app-panel border-dashed p-12 text-center">
          <p className="mb-2 font-semibold text-slate-300">No proxies configured</p>
          <p className="mb-4 text-sm text-slate-500">
            Add a session-sticky residential proxy profile to protect each
            LinkedIn account from detection.
          </p>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            Add First Proxy
          </button>
        </div>
      )}

      {/* Proxy table */}
      {proxies.length > 0 && (
        <div className="table-shell">
          <table className="min-w-full divide-y divide-white/[0.06]">
            <thead className="table-head">
              <tr>
                {[
                  "Host",
                  "Port",
                  "Location",
                  "Rotation",
                  "Exit IP",
                  "Health",
                  "Actions",
                ].map((h) => (
                  <th key={h} className="px-6 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {proxies.map((proxy) => (
                <tr key={proxy.id} className="hover:bg-white/[0.03]">
                  <td className="table-cell font-mono text-sm font-semibold text-slate-100">
                    {proxy.host}
                  </td>
                  <td className="table-cell text-slate-400">{proxy.port}</td>
                  <td className="table-cell text-slate-400">
                    {proxy.country}
                    {proxy.city ? ` - ${proxy.city}` : ""}
                  </td>
                  <td className="table-cell">
                    <Badge value={proxy.rotationMode} />
                    {proxy.rotationMode === "STATIC" && (
                      <p className="mt-1 text-xs text-amber-400">
                        Use only if residential/ISP
                      </p>
                    )}
                    {proxy.currentSessionId && (
                      <p className="mt-1 font-mono text-xs text-slate-400">
                        {proxy.currentSessionId}
                      </p>
                    )}
                  </td>
                  <td className="table-cell font-mono text-xs text-slate-400">
                    {proxy.currentExitIp ?? "-"}
                  </td>
                  <td className="table-cell">
                    <Badge value={proxy.healthStatus} />
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleCheck(proxy.id)}
                        disabled={busy === proxy.id}
                        className="text-xs font-semibold text-teal-400 hover:underline disabled:opacity-40"
                      >
                        {busy === proxy.id ? "Checking..." : "Health Check"}
                      </button>
                      <button
                        onClick={() => handleDelete(proxy.id, proxy.host)}
                        disabled={busy === proxy.id}
                        className="text-xs font-semibold text-red-500 hover:underline disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
