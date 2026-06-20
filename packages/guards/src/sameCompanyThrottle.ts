import { prisma } from "@linkedin-automation/db";

const THROTTLE_WINDOW_MS = 3 * 60 * 60 * 1000; // 3 hours

export class SameCompanyThrottleError extends Error {
  constructor(company: string) {
    super(
      `Same-company throttle: a lead at "${company}" was already messaged in the last 3 hours`
    );
    this.name = "SameCompanyThrottleError";
  }
}

export async function checkSameCompanyThrottle(
  accountId: string,
  company: string | null | undefined
): Promise<void> {
  if (!company) return;

  const since = new Date(Date.now() - THROTTLE_WINDOW_MS);

  // Get URLs of all leads messaged by this account in the last 3 hours
  const recentLogs = await prisma.activityLog.findMany({
    where: { accountId, actionType: "message", createdAt: { gte: since } },
    select: { targetUrl: true },
  });

  const recentUrls = recentLogs
    .map((l) => l.targetUrl)
    .filter((u): u is string => u != null);

  if (recentUrls.length === 0) return;

  // Check if any of those leads belong to the same company
  const conflict = await prisma.lead.findFirst({
    where: {
      linkedinUrl: { in: recentUrls },
      company: { equals: company, mode: "insensitive" },
    },
  });

  if (conflict) {
    throw new SameCompanyThrottleError(company);
  }
}
