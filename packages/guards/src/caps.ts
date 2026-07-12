import { prisma, type WarmUpPhase } from "@linkedin-automation/db";
import { DailyCapExceededError, WarmUpError } from "./errors.js";
import { warmUpCap } from "./warmup.js";

export type ActionType =
  | "connection"
  | "message"
  | "inmail"
  | "profileView"
  | "searchPage";

// Conservative defaults for new / unknown accounts.
// Per-account overrides stored in Account.maxDailyCaps take precedence.
export const SYSTEM_CAPS: Record<ActionType, number> = {
  connection: 15,
  message: 40,
  inmail: 10,
  profileView: 60,
  searchPage: 10,
};

// Hard ceilings — no account can exceed these regardless of override.
export const HARD_CEILING: Record<ActionType, number> = {
  connection: 50,
  message: 150,
  inmail: 50,
  profileView: 250,
  searchPage: 40,
};

const ACTIVE_HOURS = { start: 8, end: 19 }; // 8am–7pm

function isWeekend(timezone: string): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).formatToParts(new Date());
    const day = parts.find((p) => p.type === "weekday")?.value;
    return day === "Sat" || day === "Sun";
  } catch {
    return false; // fail open if timezone is invalid
  }
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

type CapAccount = {
  dailyCaps?: unknown;
  monthlyCaps?: unknown;
  maxDailyCaps?: unknown;
  timezone: string;
  warmUpPhase: WarmUpPhase;
  inMailMonthlyLimit?: number;
};

type CapReader = {
  checkpoint: {
    count: typeof prisma.checkpoint.count;
  };
};

function asCaps(value: unknown): Record<string, Record<string, number>> {
  return (value as Record<string, Record<string, number>> | null) ?? {};
}

function asOverrides(value: unknown): Record<string, number> {
  return (value as Record<string, number> | null) ?? {};
}

async function getEffectiveCap(
  accountId: string,
  action: ActionType,
  timezoneOverride?: string
): Promise<number> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { maxDailyCaps: true, warmUpPhase: true, timezone: true },
  });

  return effectiveCapFromAccount(accountId, action, account, prisma, timezoneOverride);
}

async function effectiveCapFromAccount(
  accountId: string,
  action: ActionType,
  account: Pick<CapAccount, "maxDailyCaps" | "warmUpPhase" | "timezone">,
  tx: CapReader,
  timezoneOverride?: string
): Promise<number> {
  const overrides = asOverrides(account.maxDailyCaps);
  const configured = overrides[action] ?? SYSTEM_CAPS[action];
  // Clamp to the hard ceiling so no UI mistake can exceed safe bounds
  const clamped = Math.min(configured, HARD_CEILING[action]);
  const phaseCap = warmUpCap(account.warmUpPhase, action);
  if (phaseCap === 0) {
    throw new WarmUpError(accountId, action, account.warmUpPhase);
  }
  const warmupClamped = Math.min(clamped, phaseCap);
  const effectiveTimezone = timezoneOverride ?? account.timezone;
  const base = isWeekend(effectiveTimezone) ? Math.floor(warmupClamped * 0.5) : warmupClamped;

  // Guard 6: accounts with 2+ checkpoints in the last 30 days run at 50% of normal caps
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentCheckpoints = await tx.checkpoint.count({
    where: { accountId, detectedAt: { gte: cutoff } },
  });

  return recentCheckpoints >= 2 ? Math.floor(base * 0.5) : base;
}

export function dayKeyForTimezone(timezone: string, date = new Date()): string {
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

  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function pruneOldDailyCapKeys(
  caps: Record<string, Record<string, number>>,
  now = new Date()
): void {
  // Different campaigns on one account can use different target timezones.
  // Keep a small recent window so a far-ahead timezone doesn't erase a
  // still-current day for a far-behind timezone.
  const cutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  for (const key of Object.keys(caps)) {
    if (key < cutoff) delete caps[key];
  }
}

function monthKey(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export async function remainingDailyCap(
  accountId: string,
  action: ActionType,
  timezoneOverride?: string
): Promise<number> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { dailyCaps: true, timezone: true },
  });

  const caps = asCaps(account.dailyCaps);
  const effectiveTimezone = timezoneOverride ?? account.timezone;
  const today = dayKeyForTimezone(effectiveTimezone);
  const used = caps?.[today]?.[action] ?? 0;
  const limit = await getEffectiveCap(accountId, action, effectiveTimezone);
  return Math.max(0, limit - used);
}

export async function checkDailyCap(
  accountId: string,
  action: ActionType,
  timezoneOverride?: string
): Promise<void> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { dailyCaps: true, timezone: true, maxDailyCaps: true },
  });

  const effectiveTimezone = timezoneOverride ?? account.timezone;

  if (!isActiveHour(effectiveTimezone)) {
    throw new DailyCapExceededError(
      accountId,
      `${action} (outside active hours)`
    );
  }

  const caps = asCaps(account.dailyCaps);
  const today = dayKeyForTimezone(effectiveTimezone);
  const used = caps?.[today]?.[action] ?? 0;
  const limit = await getEffectiveCap(accountId, action, effectiveTimezone);

  if (used >= limit) {
    throw new DailyCapExceededError(accountId, action);
  }
}

export async function incrementDailyCap(
  accountId: string,
  action: ActionType,
  timezoneOverride?: string
): Promise<void> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { dailyCaps: true, timezone: true },
  });

  const caps = asCaps(account.dailyCaps);
  const today = dayKeyForTimezone(timezoneOverride ?? account.timezone);

  if (!caps[today]) caps[today] = {};
  caps[today][action] = (caps[today][action] ?? 0) + 1;

  pruneOldDailyCapKeys(caps);

  await prisma.account.update({
    where: { id: accountId },
    data: { dailyCaps: caps },
  });
}

export async function claimDailyCap(
  accountId: string,
  action: ActionType,
  timezoneOverride?: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<CapAccount[]>`
      SELECT "dailyCaps", "maxDailyCaps", "timezone", "warmUpPhase"
      FROM "Account"
      WHERE "id" = ${accountId}
      FOR UPDATE
    `;
    const account = rows[0];
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    const effectiveTimezone = timezoneOverride ?? account.timezone;

    if (!isActiveHour(effectiveTimezone)) {
      throw new DailyCapExceededError(
        accountId,
        `${action} (outside active hours)`
      );
    }

    const caps = asCaps(account.dailyCaps);
    const today = dayKeyForTimezone(effectiveTimezone);
    const used = caps?.[today]?.[action] ?? 0;
    const limit = await effectiveCapFromAccount(accountId, action, account, tx, effectiveTimezone);

    if (used >= limit) {
      throw new DailyCapExceededError(accountId, action);
    }

    if (!caps[today]) caps[today] = {};
    caps[today][action] = used + 1;

    pruneOldDailyCapKeys(caps);

    await tx.account.update({
      where: { id: accountId },
      data: { dailyCaps: caps },
    });
  });
}

async function monthlyInMailUsage(accountId: string): Promise<{
  caps: Record<string, number>;
  month: string;
  used: number;
  limit: number;
}> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { monthlyCaps: true, inMailMonthlyLimit: true },
  });
  const caps = asOverrides(account.monthlyCaps);
  const month = monthKey();
  return {
    caps,
    month,
    used: caps[month] ?? 0,
    limit: account.inMailMonthlyLimit,
  };
}

export async function checkMonthlyInMailCap(accountId: string): Promise<void> {
  const { used, limit } = await monthlyInMailUsage(accountId);
  if (used >= limit) {
    throw new DailyCapExceededError(accountId, "inmail (monthly credits)");
  }
}

export async function incrementMonthlyInMailCap(accountId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<CapAccount[]>`
      SELECT "monthlyCaps", "inMailMonthlyLimit"
      FROM "Account"
      WHERE "id" = ${accountId}
      FOR UPDATE
    `;
    const account = rows[0];
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    const caps = asOverrides(account.monthlyCaps);
    const month = monthKey();
    const used = caps[month] ?? 0;
    const limit = account.inMailMonthlyLimit ?? 50;

    if (used >= limit) {
      throw new DailyCapExceededError(accountId, "inmail (monthly credits)");
    }

    caps[month] = used + 1;
    for (const key of Object.keys(caps)) {
      if (key < month) delete caps[key];
    }

    await tx.account.update({
      where: { id: accountId },
      data: { monthlyCaps: caps },
    });
  });
}
