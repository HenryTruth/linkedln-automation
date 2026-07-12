import type { Job } from "bullmq";
import { prisma, AccountStatus, ConnectionStatus } from "@linkedin-automation/db";
import {
  claimDailyCap,
  assertWarmUpAllowed,
  checkActionWindow,
  checkSessionErrorRate,
  pauseAccountForAnomaly,
  AccountPausedError,
  AnomalyError,
} from "@linkedin-automation/guards";
import { BrowserWorker, withdrawConnection } from "@linkedin-automation/browser";
import type { WithdrawSingleJobData } from "../queues.js";

export async function withdrawSingleProcessor(
  job: Job<WithdrawSingleJobData>
): Promise<void> {
  const { accountId, leadId, campaignLeadId, linkedinUrl } = job.data;

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
    // Reuses the "connection" bucket — inverse of sending a request, same
    // LinkedIn surface. See §4 of docs/plans/sequence-builder-engine.md.
    assertWarmUpAllowed(accountId, account.warmUpPhase, "connection");
    await claimDailyCap(accountId, "connection", campaignTimezone);
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
    const result = await withdrawConnection(page, linkedinUrl);

    await prisma.activityLog.create({
      data: { accountId, actionType: "withdrawSingle", targetUrl: linkedinUrl, result },
    });

    if (result === "withdrawn") {
      await prisma.lead.update({
        where: { id: leadId },
        data: { connectionStatus: ConnectionStatus.WITHDRAWN },
      });
    }

    await prisma.campaignLead.update({
      where: { id: campaignLeadId },
      data: { lastActionAt: new Date(), jobStatus: "SENT", lastJobError: null },
    });
  } catch (err) {
    const artifact = await worker.captureFailureArtifacts(`withdrawSingle-${job.id ?? "unknown"}`);
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
