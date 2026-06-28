const accents = {
  blue:   "text-blue-400 bg-blue-500/10",
  green:  "text-emerald-400 bg-emerald-500/10",
  purple: "text-violet-400 bg-violet-500/10",
  red:    "text-red-400 bg-red-500/10",
  gray:   "text-slate-300 bg-slate-700/50",
};

interface StatCardProps {
  title: string;
  value: string | number;
  sub?: string;
  accent?: keyof typeof accents;
  alert?: boolean;
}

export function StatCard({
  title,
  value,
  sub,
  accent = "blue",
  alert = false,
}: StatCardProps) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        alert
          ? "border-red-500/30 bg-red-500/10"
          : "border-white/[0.08] bg-slate-900"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-slate-400">{title}</p>
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            alert ? "bg-red-400" : accents[accent].split(" ")[1]
          }`}
        />
      </div>
      <p
        className={`mt-3 inline-flex rounded-xl px-3 py-1 text-3xl font-semibold tracking-tight ${
          alert ? "bg-red-500/15 text-red-400" : accents[accent]
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-2 text-sm text-slate-400">{sub}</p>}
    </div>
  );
}
