import { prisma, AccountStatus } from "@linkedin-automation/db";
import { AnomalyError } from "./errors.js";
import { sendAlert } from "./alert.js";

const ACTION_WINDOW_MINUTES = 10;
const MAX_ACTIONS_PER_WINDOW = 5;
const SESSION_ERROR_RATE_SAMPLE = 10;
const MAX_SESSION_ERROR_RATE = 0.2;

export async function checkActionWindow(accountId: string): Promise<void> {
  const since = new Date(Date.now() - ACTION_WINDOW_MINUTES * 60 * 1000);
  const count = await prisma.activityLog.count({
    where: { accountId, createdAt: { gte: since } },
  });

  if (count >= MAX_ACTIONS_PER_WINDOW) {
    throw new AnomalyError(
      `Account ${accountId} fired ${count} actions in the last ${ACTION_WINDOW_MINUTES}min — pausing`
    );
  }
}

export async function checkDuplicate(
  accountId: string,
  targetUrl: string,
  actionType: string
): Promise<void> {
  const existing = await prisma.activityLog.findFirst({
    where: { accountId, targetUrl, actionType },
  });

  if (existing) {
    throw new AnomalyError(
      `Duplicate action detected: ${actionType} on ${targetUrl} for account ${accountId}`
    );
  }
}

/**
 * Guard 10: if the most recent N activity log entries for this account have an
 * error rate above 20%, the session is unhealthy — pause and investigate.
 */
export async function checkSessionErrorRate(accountId: string): Promise<void> {
  const recent = await prisma.activityLog.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take: SESSION_ERROR_RATE_SAMPLE,
    select: { result: true },
  });

  if (recent.length < SESSION_ERROR_RATE_SAMPLE) return; // not enough history yet

  // Every processor's failure path prefixes its activityLog result with
  // "failed:" (search/contentSignal explicitly; others simply don't log on
  // failure). Success strings vary per action ("success", "liked", "scraped
  // N leads across M pages", "withdrew N pending requests", etc.) — an exact
  // "success" match here mistook those legitimate non-"success" successes for
  // errors and inflated the rate for perfectly healthy accounts.
  const errorCount = recent.filter((l) => l.result === null || l.result.startsWith("failed:")).length;
  const rate = errorCount / recent.length;

  if (rate > MAX_SESSION_ERROR_RATE) {
    throw new AnomalyError(
      `Account ${accountId} session error rate ${(rate * 100).toFixed(0)}% exceeds ${MAX_SESSION_ERROR_RATE * 100}% threshold (${errorCount}/${recent.length} recent actions failed)`
    );
  }
}

/** Pause account in DB and send an alert. Call this when AnomalyError is caught in a processor. */
export async function pauseAccountForAnomaly(
  accountId: string,
  reason: string
): Promise<void> {
  await prisma.account.update({
    where: { id: accountId },
    data: { status: AccountStatus.PAUSED },
  });
  await sendAlert(
    `Account paused — anomaly detected`,
    `Account: ${accountId}\nReason: ${reason}`
  );
}
