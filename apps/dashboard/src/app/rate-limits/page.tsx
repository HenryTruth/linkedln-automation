"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Account } from "@/lib/api";
import { Badge } from "@/components/Badge";
import { Skeleton } from "@/components/Skeleton";

const BASE_CAPS: Record<string, number> = {
  connection: 15,
  message: 40,
  inmail: 10,
  profileView: 60,
  searchPage: 10,
};

const CAP_LABELS: Record<string, string> = {
  connection: "Connects",
  message: "Messages",
  inmail: "InMails",
  profileView: "Profile Views",
  searchPage: "Search Pages",
};

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

function lastNDays(n: number, timezone: string): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    return dayKeyForTimezone(timezone, d);
  });
}

function pctColor(pct: number) {
  if (pct >= 80) return "bg-red-400";
  if (pct >= 60) return "bg-amber-400";
  return "bg-teal-500";
}

function pctTextColor(pct: number) {
  if (pct >= 80) return "text-red-400 font-semibold";
  if (pct >= 60) return "text-amber-400 font-medium";
  return "text-slate-400";
}

function UtilBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 rounded-full bg-slate-800">
      <div
        className={`h-1.5 rounded-full transition-all ${pctColor(pct)}`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

function accountUtilization(
  account: Account,
  today: string
): { key: string; used: number; max: number; pct: number }[] {
  const caps =
    (account.dailyCaps as Record<string, Record<string, number>>)[today] ?? {};
  return Object.keys(BASE_CAPS).map((key) => {
    const used = caps[key] ?? 0;
    const max = BASE_CAPS[key];
    return { key, used, max, pct: Math.round((used / max) * 100) };
  });
}

export default function RateLimitsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.accounts.list().then(setAccounts).catch(console.error).finally(() => setLoading(false));
  }, []);

  const todayByAccount = new Map(
    accounts.map((account) => [account.id, dayKeyForTimezone(account.timezone)])
  );
  const accountToday = (account: Account) =>
    todayByAccount.get(account.id) ?? dayKeyForTimezone(account.timezone);

  const atRisk = accounts.filter((a) =>
    accountUtilization(a, accountToday(a)).some((u) => u.pct >= 80)
  ).length;

  const atWarning = accounts.filter(
    (a) =>
      accountUtilization(a, accountToday(a)).some((u) => u.pct >= 60) &&
      !accountUtilization(a, accountToday(a)).some((u) => u.pct >= 80)
  ).length;

  if (loading)
    return (
      <div className="space-y-8">
        <section className="app-panel p-6 lg:p-8">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-9 w-56" />
        </section>
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="app-panel p-5 text-center space-y-3">
              <Skeleton className="mx-auto h-3 w-24" />
              <Skeleton className="mx-auto h-8 w-12" />
            </div>
          ))}
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="app-panel p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-2 w-full rounded-full" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <div className="space-y-8">
      {/* Header */}
      <section className="app-panel p-6 lg:p-8">
        <p className="page-kicker">Safety guardrails</p>
        <h1 className="page-title mt-2">Rate-Limit Dashboard</h1>
        <p className="page-copy">
          Daily action cap utilization across all accounts.{" "}
          <span className="text-red-400 font-medium">Red ≥ 80%</span>,{" "}
          <span className="text-amber-400 font-medium">amber ≥ 60%</span>.
          Caps reset at midnight in each account&apos;s local timezone.
        </p>
      </section>

      {/* Summary chips */}
      <div className="grid grid-cols-3 gap-4 max-w-lg">
        <div className="app-panel p-5 text-center">
          <p className="text-3xl font-semibold text-white">
            {accounts.length}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Accounts
          </p>
        </div>
        <div
          className={`app-panel p-5 text-center ${atRisk > 0 ? "border-red-500/30 bg-red-500/10" : ""}`}
        >
          <p
            className={`text-3xl font-semibold ${atRisk > 0 ? "text-red-400" : "text-white"}`}
          >
            {atRisk}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            At Risk ≥80%
          </p>
        </div>
        <div
          className={`app-panel p-5 text-center ${atWarning > 0 ? "border-amber-500/30 bg-amber-500/10" : ""}`}
        >
          <p
            className={`text-3xl font-semibold ${atWarning > 0 ? "text-amber-400" : "text-white"}`}
          >
            {atWarning}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Warning ≥60%
          </p>
        </div>
      </div>

      {accounts.length === 0 && (
        <div className="app-panel border-dashed p-12 text-center text-sm text-slate-400">
          No accounts yet.{" "}
          <Link href="/accounts" className="font-semibold text-teal-400 hover:underline">
            Add one
          </Link>{" "}
          to start tracking cap usage.
        </div>
      )}

      {/* Today's utilization table */}
      {accounts.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-white">
            Today&apos;s Cap Utilization
          </h2>
          <div className="table-shell">
            <table className="min-w-full">
              <thead className="table-head">
                <tr>
                  <th className="px-6 py-3">Account</th>
                  <th className="px-6 py-3">Status</th>
                  {Object.entries(CAP_LABELS).map(([key, label]) => (
                    <th key={key} className="px-5 py-3 min-w-[120px]">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {accounts.map((account) => {
                  const today = accountToday(account);
                  const utils = accountUtilization(account, today);
                  const worstPct = Math.max(...utils.map((u) => u.pct));
                  return (
                    <tr
                      key={account.id}
                      className={`hover:bg-white/[0.03] ${
                        worstPct >= 80 ? "bg-red-500/[0.08]" : worstPct >= 60 ? "bg-amber-500/[0.06]" : ""
                      }`}
                    >
                      <td className="table-cell">
                        <div>
                          <p className="max-w-[200px] truncate text-sm font-semibold text-slate-100">
                            {account.email}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {account.timezone}
                          </p>
                        </div>
                      </td>
                      <td className="table-cell">
                        <Badge value={account.status} />
                      </td>
                      {utils.map(({ key, used, max, pct }) => (
                        <td key={key} className="px-5 py-4 w-36">
                          <UtilBar pct={pct} />
                          <p className={`mt-1 text-xs tabular-nums ${pctTextColor(pct)}`}>
                            {used}/{max}
                            <span className="ml-1 text-[10px] opacity-70">
                              ({pct}%)
                            </span>
                          </p>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7-day connection history per account */}
      {accounts.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold tracking-tight text-white">
            7-Day Connection Usage
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {accounts.map((account) => {
              const today = accountToday(account);
              const days = lastNDays(7, account.timezone);
              const capsJson = account.dailyCaps as Record<
                string,
                Record<string, number>
              >;
              const maxUsed = Math.max(
                ...days.map((d) => capsJson[d]?.connection ?? 0),
                1
              );
              return (
                <div key={account.id} className="app-panel p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-white">
                      {account.email}
                    </p>
                    <Badge value={account.status} />
                  </div>
                  <div className="flex items-end gap-1" style={{ height: "56px" }}>
                    {days.map((day) => {
                      const used = capsJson[day]?.connection ?? 0;
                      const capPct = Math.min(
                        100,
                        Math.round((used / BASE_CAPS.connection) * 100)
                      );
                      const heightPct = Math.round((used / maxUsed) * 100);
                      const isToday = day === today;
                      return (
                        <div
                          key={day}
                          className="group relative flex flex-1 flex-col items-center"
                          style={{ height: "100%" }}
                        >
                          <div className="flex w-full flex-col justify-end rounded-sm bg-slate-800" style={{ height: "44px" }}>
                            <div
                              className={`w-full rounded-sm transition-all ${isToday ? pctColor(capPct) : "bg-slate-600"}`}
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                          <span className="mt-1 text-[9px] tabular-nums text-slate-400">
                            {day.slice(5)}
                          </span>
                          {/* Tooltip */}
                          <div className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block whitespace-nowrap">
                            {used}/{BASE_CAPS.connection} connects
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Connection requests per day — cap is {BASE_CAPS.connection}/day
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Hard cap reference */}
      <div className="app-panel max-w-md p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-200">
          Hard Caps Reference
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                Action
              </th>
              <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">
                Daily Cap
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {Object.entries(CAP_LABELS).map(([key, label]) => (
              <tr key={key}>
                <td className="py-2 text-slate-300">{label}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-white">
                  {BASE_CAPS[key]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] leading-4 text-slate-400">
          Caps are enforced at the BullMQ queue level — jobs are rejected when
          the cap is hit, never just delayed. Weekend throughput is halved.
        </p>
      </div>
    </div>
  );
}
