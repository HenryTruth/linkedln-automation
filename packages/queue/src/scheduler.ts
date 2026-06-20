import { Worker } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import { getConnection } from "./redis.js";
import { connectProcessor } from "./processors/connect.processor.js";
import { messageProcessor } from "./processors/message.processor.js";
import { scrapeProcessor } from "./processors/scrape.processor.js";
import { searchScrapeProcessor } from "./processors/search.processor.js";
import { withdrawProcessor } from "./processors/withdraw.processor.js";
import { sequenceProcessor } from "./processors/sequence.processor.js";
import { contentSignalProcessor } from "./processors/contentSignal.processor.js";
import { withdrawQueue, sequenceDispatchQueue } from "./queues.js";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

const SEQUENCE_TICK_MS = 15 * 60 * 1000; // 15 minutes

export function startWorkers(): void {
  const connection = getConnection();

  // Concurrency=1 per queue: one browser session at a time per worker process
  new Worker("connect", connectProcessor, { connection, concurrency: 1 });
  new Worker("message", messageProcessor, { connection, concurrency: 1 });
  new Worker("scrape", scrapeProcessor, { connection, concurrency: 1 });
  new Worker("searchScrape", searchScrapeProcessor, { connection, concurrency: 1 });
  new Worker("withdraw", withdrawProcessor, { connection, concurrency: 1 });
  // Sequence dispatcher runs serially — it spawns browser sessions internally
  new Worker("sequenceDispatch", sequenceProcessor, { connection, concurrency: 1 });
  new Worker("contentSignal", contentSignalProcessor, { connection, concurrency: 1 });

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
