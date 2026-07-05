const colors: Record<string, string> = {
  // Account / campaign status
  ACTIVE:       "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  PAUSED:       "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  RESTRICTED:   "bg-red-500/15 text-red-400 ring-red-500/30",
  COMPLETED:    "bg-slate-700/50 text-slate-400 ring-slate-600/40",
  // Connection status
  NONE:         "bg-slate-700/50 text-slate-400 ring-slate-600/40",
  PENDING:      "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  CONNECTED:    "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  WITHDRAWN:    "bg-red-500/15 text-red-400 ring-red-500/30",
  BLACKLISTED:  "bg-red-500/20 text-red-300 ring-red-500/40",
  // Proxy health
  HEALTHY:      "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  DEGRADED:     "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  DEAD:         "bg-red-500/15 text-red-400 ring-red-500/30",
  // Proxy rotation
  STATIC:       "bg-slate-700/50 text-slate-400 ring-slate-600/40",
  STICKY_SESSION: "bg-teal-500/15 text-teal-400 ring-teal-500/30",
  // Campaign type
  CONNECT:        "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  MESSAGE:        "bg-violet-500/15 text-violet-400 ring-violet-500/30",
  INMAIL:         "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  SCRAPE:         "bg-orange-500/15 text-orange-400 ring-orange-500/30",
  CONTENT_SIGNAL: "bg-teal-500/15 text-teal-400 ring-teal-500/30",
  // Warm-up phase
  MANUAL: "bg-slate-700/50 text-slate-400 ring-slate-600/40",
  WEEK2:  "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  WEEK3:  "bg-indigo-500/15 text-indigo-400 ring-indigo-500/30",
  WEEK4:  "bg-violet-500/15 text-violet-400 ring-violet-500/30",
  FULL:   "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  // Activity types (lowercase from DB)
  connect:            "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  message:            "bg-violet-500/15 text-violet-400 ring-violet-500/30",
  inmail:             "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  scrape:             "bg-orange-500/15 text-orange-400 ring-orange-500/30",
  withdraw:           "bg-red-500/15 text-red-400 ring-red-500/30",
  success:            "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  error:              "bg-red-500/15 text-red-400 ring-red-500/30",
};

export function Badge({ value }: { value: string }) {
  const cls = colors[value] ?? "bg-slate-700/50 text-slate-400 ring-slate-600/40";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cls}`}
    >
      {value.replace("_", " ")}
    </span>
  );
}
