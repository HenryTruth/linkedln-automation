import type { Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import {
  AccountPausedError,
  AnomalyError,
  checkSessionErrorRate,
  pauseAccountForAnomaly,
} from "@linkedin-automation/guards";
import { BrowserWorker, withdrawPendingConnections } from "@linkedin-automation/browser";
import type { WithdrawJobData } from "../queues.js";

export async function withdrawProcessor(
  job: Job<WithdrawJobData>
): Promise<void> {
  const { accountId } = job.data;

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { status: true },
  });

  if (account.status === AccountStatus.PAUSED) {
    throw new AccountPausedError(accountId);
  }

  try {
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
    const count = await withdrawPendingConnections(page, accountId);

    await prisma.activityLog.create({
      data: {
        accountId,
        actionType: "withdraw",
        result: `withdrew ${count} pending requests`,
      },
    });
  } finally {
    await worker.close();
  }
}
