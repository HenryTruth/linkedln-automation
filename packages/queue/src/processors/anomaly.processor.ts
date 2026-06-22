import type { Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import {
  checkActionWindow,
  checkSessionErrorRate,
  pauseAccountForAnomaly,
  AnomalyError,
} from "@linkedin-automation/guards";
import type { AnomalyCheckJobData } from "../queues.js";

export async function anomalyCheckProcessor(
  _job: Job<AnomalyCheckJobData>
): Promise<void> {
  const accounts = await prisma.account.findMany({
    where: { status: AccountStatus.ACTIVE },
    select: { id: true },
  });

  for (const { id } of accounts) {
    try {
      await checkActionWindow(id);
    } catch (err) {
      if (err instanceof AnomalyError) {
        await pauseAccountForAnomaly(id, err.message);
        continue; // account is paused — skip error-rate check for it
      }
    }

    try {
      await checkSessionErrorRate(id);
    } catch (err) {
      if (err instanceof AnomalyError) {
        await pauseAccountForAnomaly(id, err.message);
      }
    }
  }
}
