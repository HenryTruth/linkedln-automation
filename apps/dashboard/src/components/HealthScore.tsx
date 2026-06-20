import type { Account, Checkpoint } from "@/lib/api";

const BASE_CAPS: Record<string, number> = {
  connection: 15,
  message: 40,
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
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

  const today = todayKey();
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
    score >= 80 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  const textColor =
    score >= 80
      ? "text-green-700"
      : score >= 50
      ? "text-yellow-700"
      : "text-red-700";

  // Circle: r=26, circumference ~= 163.4
  const circumference = 2 * Math.PI * 26;
  const dash = (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1 w-16 shrink-0">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke="#e5e7eb"
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
          fill="#111827"
        >
          {score}
        </text>
      </svg>
      <span className={`text-xs font-semibold ${textColor}`}>{label}</span>
    </div>
  );
}
