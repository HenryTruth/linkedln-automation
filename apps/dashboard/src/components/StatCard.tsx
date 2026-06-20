const accents = {
  blue: "text-blue-600 bg-blue-50",
  green: "text-emerald-600 bg-emerald-50",
  purple: "text-violet-600 bg-violet-50",
  red: "text-red-600 bg-red-50",
  gray: "text-slate-800 bg-slate-50",
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
          ? "border-red-200 bg-red-50"
          : "border-white/70 bg-white/[0.86] backdrop-blur"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-slate-500">{title}</p>
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            alert ? "bg-red-500" : accents[accent].split(" ")[1]
          }`}
        />
      </div>
      <p
        className={`mt-3 inline-flex rounded-xl px-3 py-1 text-3xl font-semibold tracking-tight ${
          alert ? "bg-red-100 text-red-600" : accents[accent]
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-2 text-sm text-slate-500">{sub}</p>}
    </div>
  );
}
