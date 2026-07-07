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
import { sequenceEngineProcessor } from "./processors/sequenceEngine.processor.js";
import { likePostProcessor } from "./processors/likePost.processor.js";
import { withdrawSingleProcessor } from "./processors/withdrawSingle.processor.js";
import { visitProfileProcessor } from "./processors/visitProfile.processor.js";
import { sessionHealthCheckProcessor } from "./processors/sessionHealthCheck.processor.js";
import {
  withdrawQueue,
  sequenceDispatchQueue,
  anomalyCheckQueue,
  syncStatusQueue,
  sequenceEngineDispatchQueue,
  sessionHealthCheckQueue,
} from "./queues.js";
import { maybeCompleteCampaignForLead } from "./campaignCompletion.js";
import { advanceSequenceLead } from "./sequenceGraph.js";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

const SEQUENCE_TICK_MS = 15 * 60 * 1000; // 15 minutes

const SEQUENCE_ENGINE_TICK_MS = 5 * 60 * 1000; // 5 minutes — day-scale WAITs need finer granularity

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

  worker.on("completed", async (job: Job) => {
    const campaignLeadId = (job.data as { campaignLeadId?: string }).campaignLeadId;
    if (!campaignLeadId) return;
    // No-op for non-SEQUENCE leads — see sequenceGraph.ts.
    await advanceSequenceLead(campaignLeadId).catch(() => {});
    await maybeCompleteCampaignForLead(campaignLeadId).catch(() => {});
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
    // Only a final failure settles the lead — earlier attempts will retry.
    const willRetry = job && job.attemptsMade < (job.opts.attempts ?? 1);
    if (!willRetry) {
      await maybeCompleteCampaignForLead(campaignLeadId).catch(() => {});
    }
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
  // SEQUENCE engine — parallel to the legacy MESSAGE dispatcher above, only
  // ever touches CampaignLead rows on SEQUENCE campaigns.
  new Worker("sequenceEngineDispatch", sequenceEngineProcessor, { connection, concurrency: 1 });
  attachCampaignLeadJobState(new Worker("likePost", likePostProcessor, { connection, concurrency: 1 }));
  attachCampaignLeadJobState(new Worker("withdrawSingle", withdrawSingleProcessor, { connection, concurrency: 1 }));
  attachCampaignLeadJobState(new Worker("visitProfile", visitProfileProcessor, { connection, concurrency: 1 }));
  // Not lead-scoped — proactively visits LinkedIn per account to surface a
  // dead session early instead of waiting for some other job to hit it.
  new Worker("sessionHealthCheck", sessionHealthCheckProcessor, { connection, concurrency: 1 });

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

export async function startSequenceEngineTicker(): Promise<void> {
  await sequenceEngineDispatchQueue.add(
    "sequence-engine-tick",
    { _tick: true },
    {
      repeat: { every: SEQUENCE_ENGINE_TICK_MS },
      jobId: "sequence-engine-tick",
    }
  );
  console.log("SEQUENCE engine ticker registered (every 5 min)");
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

const SESSION_HEALTH_CHECK_TICK_MS = 30 * 60 * 1000; // every 30 minutes

export async function startSessionHealthCheckTicker(): Promise<void> {
  await sessionHealthCheckQueue.add(
    "session-health-tick",
    { _tick: true },
    {
      repeat: { every: SESSION_HEALTH_CHECK_TICK_MS },
      jobId: "session-health-tick",
    }
  );
  console.log("Session health check ticker registered (every 30 min)");
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
