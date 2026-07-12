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
import { BrowserWorker, likePost } from "@linkedin-automation/browser";
import type { LikePostJobData } from "../queues.js";

export async function likePostProcessor(job: Job<LikePostJobData>): Promise<void> {
  const { accountId, leadId, campaignLeadId, postUrl } = job.data;

  const [account, lead, campaignData] = await Promise.all([
    prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { status: true, warmUpPhase: true },
    }),
    prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
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

  if (lead.blacklisted) {
    await prisma.campaignLead.update({
      where: { id: campaignLeadId },
      data: { jobStatus: "SKIPPED", lastJobError: "Lead is blacklisted" },
    });
    return;
  }

  try {
    // Reuses the "profileView" bucket (lightweight page visit, most headroom) —
    // see §4 of docs/plans/sequence-builder-engine.md for why this doesn't get
    // its own ActionType.
    assertWarmUpAllowed(accountId, account.warmUpPhase, "profileView");
    await claimDailyCap(accountId, "profileView", campaignTimezone);
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
    const result = await likePost(page, postUrl);

    await prisma.activityLog.create({
      data: { accountId, actionType: "likePost", targetUrl: postUrl, result },
    });

    await prisma.campaignLead.update({
      where: { id: campaignLeadId },
      data: { lastActionAt: new Date(), jobStatus: "SENT", lastJobError: null },
    });
  } catch (err) {
    const artifact = await worker.captureFailureArtifacts(`likePost-${job.id ?? "unknown"}`);
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
