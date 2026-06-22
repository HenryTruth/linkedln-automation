import type { Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import {
  claimDailyCap,
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
import { BrowserWorker, sendMessage } from "@linkedin-automation/browser";
import type { MessageJobData } from "../queues.js";

export async function messageProcessor(
  job: Job<MessageJobData>
): Promise<void> {
  const {
    accountId,
    linkedinUrl,
    messageBody,
    campaignLeadId,
    sequenceStep,
    company,
  } = job.data;

  const [account, lead] = await Promise.all([
    prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { status: true, warmUpPhase: true },
    }),
    prisma.lead.findUniqueOrThrow({
      where: { id: job.data.leadId },
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

  const bodyHash = hashMessageBody(messageBody);

  try {
    assertWarmUpAllowed(accountId, account.warmUpPhase, "message");
    await claimDailyCap(accountId, "message");
    await checkActionWindow(accountId);
    await checkSessionErrorRate(accountId);

    // Single-shot messages check for exact duplicate actions.
    // Sequence steps skip this — the sequence engine manages deduplication
    // via nextActionAt and campaignLead.stage.
    if (sequenceStep === undefined) {
      await checkDuplicate(accountId, linkedinUrl, "message");
    }

    // Guard 9: don't send the same rendered message body to more than 3 people per day
    await checkMessageBodyDedup(accountId, bodyHash);

    // Guard: don't message two people at the same company within 3 hours
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
    await sendMessage(page, linkedinUrl, messageBody);

    await prisma.activityLog.create({
      data: {
        accountId,
        actionType: "message",
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
    const artifact = await worker.captureFailureArtifacts(`message-${job.id ?? "unknown"}`);
    await prisma.campaignLead.update({
      where: { id: campaignLeadId },
      data: { lastJobError: `${(err as Error).message}\nArtifact: ${artifact ?? "unavailable"}` },
    }).catch(() => {});
    throw err;
  } finally {
    await worker.close();
  }
}
