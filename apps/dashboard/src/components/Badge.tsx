const colors: Record<string, string> = {
  // Account / campaign status
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PAUSED: "bg-amber-50 text-amber-700 ring-amber-200",
  RESTRICTED: "bg-red-50 text-red-700 ring-red-200",
  COMPLETED: "bg-slate-100 text-slate-600 ring-slate-200",
  // Connection status
  NONE: "bg-slate-100 text-slate-500 ring-slate-200",
  PENDING: "bg-blue-50 text-blue-700 ring-blue-200",
  CONNECTED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  WITHDRAWN: "bg-red-50 text-red-700 ring-red-200",
  BLACKLISTED: "bg-red-100 text-red-800 ring-red-300",
  // Proxy health
  HEALTHY: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  DEGRADED: "bg-amber-50 text-amber-700 ring-amber-200",
  DEAD: "bg-red-50 text-red-700 ring-red-200",
  // Proxy rotation
  STATIC: "bg-slate-100 text-slate-700 ring-slate-200",
  STICKY_SESSION: "bg-teal-50 text-teal-700 ring-teal-200",
  // Campaign type
  CONNECT: "bg-blue-50 text-blue-700 ring-blue-200",
  MESSAGE: "bg-violet-50 text-violet-700 ring-violet-200",
  SCRAPE: "bg-orange-50 text-orange-700 ring-orange-200",
  CONTENT_SIGNAL: "bg-teal-50 text-teal-700 ring-teal-200",
  // Warm-up phase
  MANUAL: "bg-slate-100 text-slate-600 ring-slate-200",
  WEEK2: "bg-blue-50 text-blue-700 ring-blue-200",
  WEEK3: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  WEEK4: "bg-violet-50 text-violet-700 ring-violet-200",
  FULL: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  // Activity types (lowercase from DB)
  connect: "bg-blue-50 text-blue-700 ring-blue-200",
  message: "bg-violet-50 text-violet-700 ring-violet-200",
  scrape: "bg-orange-50 text-orange-700 ring-orange-200",
  withdraw: "bg-red-50 text-red-700 ring-red-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  error: "bg-red-50 text-red-700 ring-red-200",
};

export function Badge({ value }: { value: string }) {
  const cls = colors[value] ?? "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cls}`}
    >
      {value.replace("_", " ")}
    </span>
  );
}
