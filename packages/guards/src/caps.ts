import { prisma, type WarmUpPhase } from "@linkedin-automation/db";
import { DailyCapExceededError, WarmUpError } from "./errors.js";
import { warmUpCap } from "./warmup.js";

export type ActionType =
  | "connection"
  | "message"
  | "profileView"
  | "searchPage";

// Conservative defaults for new / unknown accounts.
// Per-account overrides stored in Account.maxDailyCaps take precedence.
export const SYSTEM_CAPS: Record<ActionType, number> = {
  connection: 15,
  message: 40,
  profileView: 60,
  searchPage: 10,
};

// Hard ceilings — no account can exceed these regardless of override.
export const HARD_CEILING: Record<ActionType, number> = {
  connection: 50,
  message: 150,
  profileView: 250,
  searchPage: 40,
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

type CapAccount = {
  dailyCaps?: unknown;
  maxDailyCaps?: unknown;
  timezone: string;
  warmUpPhase: WarmUpPhase;
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
  action: ActionType
): Promise<number> {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { maxDailyCaps: true, warmUpPhase: true },
  });

  return effectiveCapFromAccount(accountId, action, account, prisma);
}

async function effectiveCapFromAccount(
  accountId: string,
  action: ActionType,
  account: Pick<CapAccount, "maxDailyCaps" | "warmUpPhase">,
  tx: CapReader
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
  const base = isWeekend() ? Math.floor(warmupClamped * 0.5) : warmupClamped;

  // Guard 6: accounts with 2+ checkpoints in the last 30 days run at 50% of normal caps
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentCheckpoints = await tx.checkpoint.count({
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

  const caps = asCaps(account.dailyCaps);
  const today = todayKey();
  const used = caps?.[today]?.[action] ?? 0;
  const limit = await getEffectiveCap(accountId, action);
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

  if (!isActiveHour(timezoneOverride ?? account.timezone)) {
    throw new DailyCapExceededError(
      accountId,
      `${action} (outside active hours)`
    );
  }

  const caps = asCaps(account.dailyCaps);
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

  const caps = asCaps(account.dailyCaps);
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

    if (!isActiveHour(timezoneOverride ?? account.timezone)) {
      throw new DailyCapExceededError(
        accountId,
        `${action} (outside active hours)`
      );
    }

    const caps = asCaps(account.dailyCaps);
    const today = todayKey();
    const used = caps?.[today]?.[action] ?? 0;
    const limit = await effectiveCapFromAccount(accountId, action, account, tx);

    if (used >= limit) {
      throw new DailyCapExceededError(accountId, action);
    }

    if (!caps[today]) caps[today] = {};
    caps[today][action] = used + 1;

    for (const key of Object.keys(caps)) {
      if (key < today) delete caps[key];
    }

    await tx.account.update({
      where: { id: accountId },
      data: { dailyCaps: caps },
    });
  });
}
