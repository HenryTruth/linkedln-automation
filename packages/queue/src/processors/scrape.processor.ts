import type { Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import {
  checkDailyCap,
  incrementDailyCap,
  assertWarmUpAllowed,
  checkActionWindow,
  pauseAccountForAnomaly,
  AccountPausedError,
  AnomalyError,
} from "@linkedin-automation/guards";
import { BrowserWorker, scrapeProfile } from "@linkedin-automation/browser";
import type { ScrapeJobData } from "../queues.js";

export async function scrapeProcessor(job: Job<ScrapeJobData>): Promise<void> {
  const { accountId, linkedinUrl } = job.data;

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { status: true, warmUpPhase: true },
  });

  if (account.status === AccountStatus.PAUSED) {
    throw new AccountPausedError(accountId);
  }

  // Skip blacklisted leads — look up by URL since scrape jobs carry linkedinUrl not leadId
  const existingLead = await prisma.lead.findUnique({
    where: { linkedinUrl },
    select: { blacklisted: true },
  });
  if (existingLead?.blacklisted) {
    return;
  }

  try {
    await checkDailyCap(accountId, "profileView");
    assertWarmUpAllowed(accountId, account.warmUpPhase, "profileView");
    await checkActionWindow(accountId);
  } catch (err) {
    if (err instanceof AnomalyError) {
      await pauseAccountForAnomaly(accountId, (err as Error).message);
    }
    throw err;
  }

  const worker = new BrowserWorker(accountId);
  try {
    await worker.launch();
    const page = await worker.getPage();
    await scrapeProfile(page, linkedinUrl, accountId);

    await incrementDailyCap(accountId, "profileView");

    await prisma.activityLog.create({
      data: {
        accountId,
        actionType: "scrape",
        targetUrl: linkedinUrl,
        result: "success",
      },
    });
  } finally {
    await worker.close();
  }
}
