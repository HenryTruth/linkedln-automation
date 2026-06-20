import { prisma } from "@linkedin-automation/db";
import { DailyCapExceededError } from "./errors.js";

export type ActionType =
  | "connection"
  | "message"
  | "profileView"
  | "searchPage";

const BASE_CAPS: Record<ActionType, number> = {
  connection: 15,
  message: 40,
  profileView: 60,
  searchPage: 10,
};

const ACTIVE_HOURS = { start: 8, end: 19 }; // 8am–7pm

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function isActiveHour(timezone: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).formatToParts(new Date());
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "12");
    return hour >= ACTIVE_HOURS.start && hour < ACTIVE_HOURS.end;
  } catch {
    return true; // fail open if timezone is invalid
  }
}

async function getEffectiveCap(accountId: string, action: ActionType): Promise<number> {
  const base = isWeekend() ? Math.floor(BASE_CAPS[action] * 0.5) : BASE_CAPS[action];

  // Guard 6: accounts with 2+ checkpoints in the last 30 days run at 50% of normal caps
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentCheckpoints = await prisma.checkpoint.count({
    where: { accountId, detectedAt: { gte: cutoff } },
  });

  return recentCheckpoints >= 2 ? Math.floor(base * 0.5) : base;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function remainingDailyCap(
  accountId: string,
  action: ActionType
): Promise<number> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { dailyCaps: true },
  });

  const caps = account.dailyCaps as Record<string, Record<string, number>>;
  const today = todayKey();
  const used = caps?.[today]?.[action] ?? 0;
  const limit = await getEffectiveCap(accountId, action);
  return Math.max(0, limit - used);
}

export async function checkDailyCap(
  accountId: string,
  action: ActionType
): Promise<void> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { dailyCaps: true, timezone: true },
  });

  if (!isActiveHour(account.timezone)) {
    throw new DailyCapExceededError(
      accountId,
      `${action} (outside active hours)`
    );
  }

  const caps = account.dailyCaps as Record<string, Record<string, number>>;
  const today = todayKey();
  const used = caps?.[today]?.[action] ?? 0;
  const limit = await getEffectiveCap(accountId, action);

  if (used >= limit) {
    throw new DailyCapExceededError(accountId, action);
  }
}

export async function incrementDailyCap(
  accountId: string,
  action: ActionType
): Promise<void> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { dailyCaps: true },
  });

  const caps = (account.dailyCaps as Record<string, Record<string, number>>) ?? {};
  const today = todayKey();

  if (!caps[today]) caps[today] = {};
  caps[today][action] = (caps[today][action] ?? 0) + 1;

  // Prune old keys to keep the JSON lean
  for (const key of Object.keys(caps)) {
    if (key < today) delete caps[key];
  }

  await prisma.account.update({
    where: { id: accountId },
    data: { dailyCaps: caps },
  });
}
