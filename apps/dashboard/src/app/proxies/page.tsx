"use client";

import { useEffect, useState } from "react";
import { api, type Proxy } from "@/lib/api";
import { Badge } from "@/components/Badge";

export default function ProxiesPage() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTemplate, setUsernameTemplate] = useState("");
  const [password, setPassword] = useState("");
  const [rotationMode, setRotationMode] = useState<"STATIC" | "STICKY_SESSION">(
    "STICKY_SESSION"
  );
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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

  if (loading) return <p className="text-sm text-slate-500">Loading...</p>;

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

      {/* Add proxy form */}
      {showForm && (
        <form
          onSubmit={handleAdd}
          className="app-panel max-w-2xl space-y-4 border-teal-200 bg-teal-50/70 p-5"
        >
          <h2 className="text-sm font-semibold text-teal-950">Add Proxy</h2>
          <p className="text-xs leading-5 text-teal-800">
            For providers like Smartproxy, Bright Data, and Oxylabs, enter the
            gateway host plus a username template that includes
            <code className="mx-1 rounded bg-teal-100 px-1">{"{{sessionId}}"}</code>
            when using session-sticky rotation.
          </p>

          {addError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {addError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="mb-1 block text-xs font-semibold text-slate-700">
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
              <label className="mb-1 block text-xs font-semibold text-slate-700">
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
              <label className="mb-1 block text-xs font-semibold text-slate-700">
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
              <label className="mb-1 block text-xs font-semibold text-slate-700">
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
              <label className="mb-1 block text-xs font-semibold text-slate-700">
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
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Rotation mode *
              </label>
              <select
                value={rotationMode}
                onChange={(e) =>
                  setRotationMode(e.target.value as "STATIC" | "STICKY_SESSION")
                }
                className="field w-full"
              >
                <option value="STICKY_SESSION">Session-sticky rotation</option>
                <option value="STATIC">Static credentials</option>
              </select>
            </div>
            {rotationMode === "STICKY_SESSION" && (
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Username template
                </label>
                <input
                  value={usernameTemplate}
                  onChange={(e) => setUsernameTemplate(e.target.value)}
                  placeholder="user-zone-us-session-{{sessionId}}"
                  className="field w-full"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Leave blank only if your provider handles sticky sessions
                  without a username token.
                </p>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
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
          <p className="mb-2 font-semibold text-slate-700">No proxies configured</p>
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
          <table className="min-w-full divide-y divide-slate-100">
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
            <tbody className="divide-y divide-slate-100">
              {proxies.map((proxy) => (
                <tr key={proxy.id} className="hover:bg-slate-50/80">
                  <td className="table-cell font-mono text-sm font-semibold text-slate-800">
                    {proxy.host}
                  </td>
                  <td className="table-cell text-slate-600">{proxy.port}</td>
                  <td className="table-cell text-slate-600">
                    {proxy.country}
                    {proxy.city ? ` - ${proxy.city}` : ""}
                  </td>
                  <td className="table-cell">
                    <Badge value={proxy.rotationMode} />
                    {proxy.currentSessionId && (
                      <p className="mt-1 font-mono text-xs text-slate-400">
                        {proxy.currentSessionId}
                      </p>
                    )}
                  </td>
                  <td className="table-cell font-mono text-xs text-slate-600">
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
                        className="text-xs font-semibold text-teal-700 hover:underline disabled:opacity-40"
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
