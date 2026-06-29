export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonStatCard() {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-slate-900 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-2.5 w-2.5 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-10 w-20 rounded-xl" />
      <Skeleton className="mt-2 h-3 w-24" />
    </div>
  );
}

const COL_WIDTHS = ["w-36", "w-24", "w-20", "w-16", "w-24", "w-20"];

export function SkeletonTableRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-white/[0.06]">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-6 py-4">
              <Skeleton className={`h-4 ${COL_WIDTHS[j % COL_WIDTHS.length]}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonPageHeader({ wide = false }: { wide?: boolean }) {
  return (
    <section className="app-panel p-6 lg:p-8">
      <Skeleton className="h-3 w-20" />
      <Skeleton className={`mt-3 h-9 ${wide ? "w-72" : "w-48"}`} />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <Skeleton className="mt-1.5 h-4 w-64 max-w-full" />
    </section>
  );
}
