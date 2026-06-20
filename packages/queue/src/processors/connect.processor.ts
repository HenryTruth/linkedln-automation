import type { Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import {
  checkDailyCap,
  incrementDailyCap,
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
  const { accountId, linkedinUrl, note } = job.data;

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
    return; // silently skip — blacklisted leads are never acted on
  }

  try {
    await checkDailyCap(accountId, "connection");
    assertWarmUpAllowed(accountId, account.warmUpPhase, "connection");
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

    await incrementDailyCap(accountId, "connection");

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
    ]);
  } finally {
    await worker.close();
  }
}
