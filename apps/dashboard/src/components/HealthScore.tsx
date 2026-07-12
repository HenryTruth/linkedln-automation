import type { Account, Checkpoint } from "@/lib/api";

const BASE_CAPS: Record<string, number> = {
  connection: 15,
  message: 40,
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

export function computeHealthScore(
  account: Account,
  openCheckpoints: number
): number {
  let score = 100;

  if (account.status === "RESTRICTED") score -= 50;
  else if (account.status === "PAUSED") score -= 15;

  score -= Math.min(openCheckpoints, 2) * 30;

  if (account.proxy?.healthStatus === "DEAD") score -= 20;
  else if (account.proxy?.healthStatus === "DEGRADED") score -= 10;

  const today = dayKeyForTimezone(account.timezone);
  const todayCaps =
    (account.dailyCaps as Record<string, Record<string, number>>)[today] ?? {};
  const heavyUsage = Object.entries(BASE_CAPS).some(
    ([key, cap]) => (todayCaps[key] ?? 0) / cap > 0.9
  );
  if (heavyUsage) score -= 5;

  return Math.max(0, Math.min(100, score));
}

export function healthLabel(score: number): string {
  if (score >= 80) return "Healthy";
  if (score >= 50) return "Warning";
  return "Critical";
}

interface HealthScoreProps {
  account: Account;
  checkpoints: Checkpoint[];
}

export function HealthScore({ account, checkpoints }: HealthScoreProps) {
  const open = checkpoints.filter(
    (cp) => cp.accountId === account.id && !cp.resolvedAt
  ).length;
  const score = computeHealthScore(account, open);
  const label = healthLabel(score);

  const color =
    score >= 80 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";
  const textColor =
    score >= 80
      ? "text-emerald-400"
      : score >= 50
      ? "text-amber-400"
      : "text-red-400";

  const circumference = 2 * Math.PI * 26;
  const dash = (score / 100) * circumference;

  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke="#1e293b"
          strokeWidth="6"
        />
        <circle
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 32 32)"
        />
        <text
          x="32"
          y="36"
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          fill="#e2e8f0"
        >
          {score}
        </text>
      </svg>
      <span className={`text-xs font-semibold ${textColor}`}>{label}</span>
    </div>
  );
}
