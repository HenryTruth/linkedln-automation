import type { Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import {
  claimDailyCap,
  assertWarmUpAllowed,
  checkActionWindow,
  checkDuplicate,
  checkSessionErrorRate,
  pauseAccountForAnomaly,
  AccountPausedError,
  AnomalyError,
} from "@linkedin-automation/guards";
import { BrowserWorker, sendConnect } from "@linkedin-automation/browser";
import type { ConnectJobData } from "../queues.js";

export async function connectProcessor(
  job: Job<ConnectJobData>
): Promise<void> {
  const { accountId, linkedinUrl, note, campaignLeadId } = job.data;

  const [account, lead, campaignData] = await Promise.all([
    prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { status: true, warmUpPhase: true },
    }),
    prisma.lead.findUniqueOrThrow({
      where: { id: job.data.leadId },
      select: { blacklisted: true },
    }),
    campaignLeadId
      ? prisma.campaignLead.findUnique({
          where: { id: campaignLeadId },
          select: { campaign: { select: { targetTimezone: true } } },
        })
      : Promise.resolve(null),
  ]);
  const campaignTimezone = campaignData?.campaign?.targetTimezone ?? undefined;

  if (account.status === AccountStatus.PAUSED) {
    throw new AccountPausedError(accountId);
  }

  if (lead.blacklisted) {
    if (campaignLeadId) {
      await prisma.campaignLead.update({
        where: { id: campaignLeadId },
        data: { jobStatus: "SKIPPED", lastJobError: "Lead is blacklisted" },
      });
    }
    return; // silently skip — blacklisted leads are never acted on
  }

  try {
    assertWarmUpAllowed(accountId, account.warmUpPhase, "connection");
    await claimDailyCap(accountId, "connection", campaignTimezone);
    await checkActionWindow(accountId);
    await checkSessionErrorRate(accountId);
    await checkDuplicate(accountId, linkedinUrl, "connect");
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
    await sendConnect(page, linkedinUrl, note);

    await Promise.all([
      prisma.lead.update({
        where: { id: job.data.leadId },
        data: { connectionStatus: "PENDING" },
      }),
      prisma.activityLog.create({
        data: {
          accountId,
          actionType: "connect",
          targetUrl: linkedinUrl,
          result: "success",
        },
      }),
      campaignLeadId
        ? prisma.campaignLead.update({
            where: { id: campaignLeadId },
            data: {
              jobStatus: "SENT",
              lastActionAt: new Date(),
              lastJobError: null,
            },
          })
        : Promise.resolve(),
    ]);
  } catch (err) {
    const artifact = await worker.captureFailureArtifacts(`connect-${job.id ?? "unknown"}`);
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
