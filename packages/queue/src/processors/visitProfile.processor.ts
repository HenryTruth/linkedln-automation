import type { Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import {
  claimDailyCap,
  assertWarmUpAllowed,
  checkActionWindow,
  checkSessionErrorRate,
  pauseAccountForAnomaly,
  AccountPausedError,
  AnomalyError,
} from "@linkedin-automation/guards";
import { BrowserWorker, visitProfile } from "@linkedin-automation/browser";
import type { VisitProfileJobData } from "../queues.js";

export async function visitProfileProcessor(
  job: Job<VisitProfileJobData>
): Promise<void> {
  const { accountId, leadId, campaignLeadId, linkedinUrl } = job.data;

  const [account, lead] = await Promise.all([
    prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { status: true, warmUpPhase: true },
    }),
    prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
      select: { blacklisted: true },
    }),
  ]);

  if (account.status === AccountStatus.PAUSED) {
    throw new AccountPausedError(accountId);
  }

  if (lead.blacklisted) {
    await prisma.campaignLead.update({
      where: { id: campaignLeadId },
      data: { jobStatus: "SKIPPED", lastJobError: "Lead is blacklisted" },
    });
    return;
  }

  try {
    assertWarmUpAllowed(accountId, account.warmUpPhase, "profileView");
    await claimDailyCap(accountId, "profileView");
    await checkActionWindow(accountId);
    await checkSessionErrorRate(accountId);
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
    await visitProfile(page, linkedinUrl);

    await prisma.activityLog.create({
      data: { accountId, actionType: "visitProfile", targetUrl: linkedinUrl, result: "success" },
    });

    await prisma.campaignLead.update({
      where: { id: campaignLeadId },
      data: { lastActionAt: new Date(), jobStatus: "SENT", lastJobError: null },
    });
  } catch (err) {
    const artifact = await worker.captureFailureArtifacts(`visitProfile-${job.id ?? "unknown"}`);
    await prisma.campaignLead
      .update({
        where: { id: campaignLeadId },
        data: { lastJobError: `${(err as Error).message}\nArtifact: ${artifact ?? "unavailable"}` },
      })
      .catch(() => {});
    throw err;
  } finally {
    await worker.close();
  }
}
