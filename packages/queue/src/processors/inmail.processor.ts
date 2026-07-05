import type { Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import {
  claimDailyCap,
  checkMonthlyInMailCap,
  incrementMonthlyInMailCap,
  assertWarmUpAllowed,
  checkActionWindow,
  checkDuplicate,
  checkSessionErrorRate,
  checkSameCompanyThrottle,
  hashMessageBody,
  checkMessageBodyDedup,
  pauseAccountForAnomaly,
  AccountPausedError,
  AnomalyError,
} from "@linkedin-automation/guards";
import { BrowserWorker, sendInMail } from "@linkedin-automation/browser";
import type { InMailJobData } from "../queues.js";

export async function inMailProcessor(job: Job<InMailJobData>): Promise<void> {
  const { accountId, linkedinUrl, subject, messageBody, campaignLeadId, company } =
    job.data;

  const [account, lead, campaignData] = await Promise.all([
    prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { status: true, warmUpPhase: true, salesNavigatorEnabled: true },
    }),
    prisma.lead.findUniqueOrThrow({
      where: { id: job.data.leadId },
      select: { blacklisted: true },
    }),
    prisma.campaignLead.findUnique({
      where: { id: campaignLeadId },
      select: { campaign: { select: { targetTimezone: true } } },
    }),
  ]);
  const campaignTimezone = campaignData?.campaign?.targetTimezone ?? undefined;

  if (account.status === AccountStatus.PAUSED) {
    throw new AccountPausedError(accountId);
  }

  if (!account.salesNavigatorEnabled) {
    throw new Error("Sales Navigator must be enabled on this account before InMail can run.");
  }

  if (lead.blacklisted) {
    await prisma.campaignLead.update({
      where: { id: campaignLeadId },
      data: { jobStatus: "SKIPPED", lastJobError: "Lead is blacklisted" },
    });
    return;
  }

  const bodyHash = hashMessageBody(`${subject}\n${messageBody}`);

  try {
    assertWarmUpAllowed(accountId, account.warmUpPhase, "inmail");
    await checkMonthlyInMailCap(accountId);
    await claimDailyCap(accountId, "inmail", campaignTimezone);
    await checkActionWindow(accountId);
    await checkSessionErrorRate(accountId);
    await checkDuplicate(accountId, linkedinUrl, "inmail");
    await checkMessageBodyDedup(accountId, bodyHash);
    await checkSameCompanyThrottle(accountId, company);
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
    await sendInMail(page, linkedinUrl, subject, messageBody);
    await incrementMonthlyInMailCap(accountId);

    await prisma.activityLog.create({
      data: {
        accountId,
        actionType: "inmail",
        targetUrl: linkedinUrl,
        result: "success",
        bodyHash,
      },
    });

    await prisma.campaignLead.update({
      where: { id: campaignLeadId },
      data: {
        lastActionAt: new Date(),
        stage: { increment: 1 },
        jobStatus: "SENT",
        lastJobError: null,
      },
    });
  } catch (err) {
    const artifact = await worker.captureFailureArtifacts(`inmail-${job.id ?? "unknown"}`);
    await prisma.campaignLead.update({
      where: { id: campaignLeadId },
      data: { lastJobError: `${(err as Error).message}\nArtifact: ${artifact ?? "unavailable"}` },
    }).catch(() => {});
    throw err;
  } finally {
    await worker.close();
  }
}
