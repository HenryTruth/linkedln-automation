import { Worker, type Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import { getConnection } from "./redis.js";
import { connectProcessor } from "./processors/connect.processor.js";
import { messageProcessor } from "./processors/message.processor.js";
import { inMailProcessor } from "./processors/inmail.processor.js";
import { scrapeProcessor } from "./processors/scrape.processor.js";
import { searchScrapeProcessor } from "./processors/search.processor.js";
import { withdrawProcessor } from "./processors/withdraw.processor.js";
import { sequenceProcessor } from "./processors/sequence.processor.js";
import { contentSignalProcessor } from "./processors/contentSignal.processor.js";
import { anomalyCheckProcessor } from "./processors/anomaly.processor.js";
import { syncStatusProcessor } from "./processors/syncStatus.processor.js";
import { withdrawQueue, sequenceDispatchQueue, anomalyCheckQueue, syncStatusQueue } from "./queues.js";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

const SEQUENCE_TICK_MS = 15 * 60 * 1000; // 15 minutes

function attachCampaignLeadJobState(worker: Worker): void {
  worker.on("active", async (job: Job) => {
    const campaignLeadId = (job.data as { campaignLeadId?: string }).campaignLeadId;
    if (!campaignLeadId) return;
    await prisma.campaignLead
      .update({
        where: { id: campaignLeadId },
        data: { jobStatus: "RUNNING", lastJobError: null },
      })
      .catch(() => {});
  });

  worker.on("failed", async (job, err) => {
    const campaignLeadId = (job?.data as { campaignLeadId?: string } | undefined)
      ?.campaignLeadId;
    if (!campaignLeadId) return;
    await prisma.campaignLead
      .update({
        where: { id: campaignLeadId },
        data: {
          jobStatus: "FAILED",
          lastJobError: err.message.slice(0, 2_000),
        },
      })
      .catch(() => {});
  });
}

export function startWorkers(): void {
  const connection = getConnection();

  // Concurrency=1 per queue: one browser session at a time per worker process
  attachCampaignLeadJobState(new Worker("connect", connectProcessor, { connection, concurrency: 1 }));
  attachCampaignLeadJobState(new Worker("message", messageProcessor, { connection, concurrency: 1 }));
  attachCampaignLeadJobState(new Worker("inMail", inMailProcessor, { connection, concurrency: 1 }));
  attachCampaignLeadJobState(new Worker("scrape", scrapeProcessor, { connection, concurrency: 1 }));
  new Worker("searchScrape", searchScrapeProcessor, { connection, concurrency: 1 });
  new Worker("withdraw", withdrawProcessor, { connection, concurrency: 1 });
  // Sequence dispatcher runs serially — it spawns browser sessions internally
  new Worker("sequenceDispatch", sequenceProcessor, { connection, concurrency: 1 });
  new Worker("contentSignal", contentSignalProcessor, { connection, concurrency: 1 });
  new Worker("anomalyCheck", anomalyCheckProcessor, { connection, concurrency: 1 });
  new Worker("syncStatus", syncStatusProcessor, { connection, concurrency: 1 });

  console.log("BullMQ workers started");
}

export async function startSequenceTicker(): Promise<void> {
  await sequenceDispatchQueue.add(
    "sequence-tick",
    { _tick: true },
    {
      repeat: { every: SEQUENCE_TICK_MS },
      jobId: "sequence-tick",
    }
  );
  console.log("Sequence dispatcher ticker registered (every 15 min)");
}

export async function scheduleWithdrawalJobs(): Promise<void> {
  const accounts = await prisma.account.findMany({
    where: { status: AccountStatus.ACTIVE },
    select: { id: true },
  });

  for (const { id } of accounts) {
    await withdrawQueue.add(
      `withdraw-repeat-${id}`,
      { accountId: id },
      {
        repeat: { every: FOURTEEN_DAYS_MS },
        jobId: `withdraw-repeat-${id}`,
      }
    );
  }

  console.log(`Withdrawal cron scheduled for ${accounts.length} account(s)`);
}

const ANOMALY_TICK_MS = 60 * 60 * 1000; // every hour

export async function startAnomalyTicker(): Promise<void> {
  await anomalyCheckQueue.add(
    "anomaly-tick",
    { _tick: true },
    {
      repeat: { every: ANOMALY_TICK_MS },
      jobId: "anomaly-tick",
    }
  );
  console.log("Anomaly detection ticker registered (every 60 min)");
}

const SYNC_STATUS_TICK_MS = 4 * 60 * 60 * 1000; // every 4 hours

export async function startSyncStatusTicker(): Promise<void> {
  await syncStatusQueue.add(
    "sync-status-tick",
    { _tick: true },
    {
      repeat: { every: SYNC_STATUS_TICK_MS },
      jobId: "sync-status-tick",
    }
  );
  console.log("Sync-status ticker registered (every 4 hours)");
}

export async function scheduleWithdrawalForAccount(
  accountId: string
): Promise<void> {
  await withdrawQueue.add(
    `withdraw-repeat-${accountId}`,
    { accountId },
    {
      repeat: { every: FOURTEEN_DAYS_MS },
      jobId: `withdraw-repeat-${accountId}`,
    }
  );
}
