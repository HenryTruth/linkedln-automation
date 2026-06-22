import type { Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import {
  claimDailyCap,
  assertWarmUpAllowed,
  checkActionWindow,
  pauseAccountForAnomaly,
  AccountPausedError,
  AnomalyError,
} from "@linkedin-automation/guards";
import { BrowserWorker, scrapeProfile } from "@linkedin-automation/browser";
import type { ScrapeJobData } from "../queues.js";

export async function scrapeProcessor(job: Job<ScrapeJobData>): Promise<void> {
  const { accountId, linkedinUrl, campaignLeadId } = job.data;

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { status: true, warmUpPhase: true, userId: true },
  });

  if (account.status === AccountStatus.PAUSED) {
    throw new AccountPausedError(accountId);
  }

  // Skip blacklisted leads — look up by URL since scrape jobs carry linkedinUrl not leadId
  const existingLead = await prisma.lead.findUnique({
    where: {
      userId_linkedinUrl: {
        userId: account.userId,
        linkedinUrl,
      },
    },
    select: { blacklisted: true },
  });
  if (existingLead?.blacklisted) {
    if (campaignLeadId) {
      await prisma.campaignLead.update({
        where: { id: campaignLeadId },
        data: { jobStatus: "SKIPPED", lastJobError: "Lead is blacklisted" },
      });
    }
    return;
  }

  try {
    assertWarmUpAllowed(accountId, account.warmUpPhase, "profileView");
    await claimDailyCap(accountId, "profileView");
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

    await prisma.activityLog.create({
      data: {
        accountId,
        actionType: "scrape",
        targetUrl: linkedinUrl,
        result: "success",
      },
    });
    if (campaignLeadId) {
      await prisma.campaignLead.update({
        where: { id: campaignLeadId },
        data: {
          jobStatus: "SENT",
          lastActionAt: new Date(),
          lastJobError: null,
        },
      });
    }
  } catch (err) {
    const artifact = await worker.captureFailureArtifacts(`scrape-${job.id ?? "unknown"}`);
    if (campaignLeadId && artifact) {
      await prisma.campaignLead.update({
        where: { id: campaignLeadId },
        data: { lastJobError: `${(err as Error).message}\nArtifact: ${artifact}` },
      }).catch(() => {});
    }
    throw err;
  } finally {
    await worker.close();
  }
}
