import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma } from "@linkedin-automation/db";
import {
  anomalyCheckQueue,
  connectQueue,
  contentSignalQueue,
  messageQueue,
  scrapeQueue,
  searchScrapeQueue,
  sequenceDispatchQueue,
  syncStatusQueue,
  withdrawQueue,
} from "@linkedin-automation/queue";

export const jobsRouter: IRouter = Router();

const queues = {
  connect: connectQueue,
  message: messageQueue,
  scrape: scrapeQueue,
  searchScrape: searchScrapeQueue,
  withdraw: withdrawQueue,
  sequenceDispatch: sequenceDispatchQueue,
  contentSignal: contentSignalQueue,
  anomalyCheck: anomalyCheckQueue,
  syncStatus: syncStatusQueue,
};

const JobQuerySchema = z.object({
  queue: z.enum(Object.keys(queues) as [keyof typeof queues, ...(keyof typeof queues)[]]).optional(),
  state: z
    .enum(["failed", "waiting", "active", "delayed", "completed"])
    .default("failed"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

jobsRouter.get("/", async (req, res, next) => {
  try {
    const { queue, state, limit } = JobQuerySchema.parse(req.query);
    const queueEntries = Object.entries(queues).filter(([name]) => !queue || name === queue);
    const accounts = await prisma.account.findMany({
      where: { userId: req.user.id },
      select: { id: true },
    });
    const accountIds = new Set(accounts.map((account) => account.id));
    const campaigns = await prisma.campaign.findMany({
      where: { account: { userId: req.user.id } },
      select: { id: true },
    });
    const campaignIds = new Set(campaigns.map((campaign) => campaign.id));

    const jobs = (
      await Promise.all(
        queueEntries.map(async ([name, bullQueue]) => {
          const rows = await bullQueue.getJobs([state], 0, limit - 1, false);
          return rows
            .filter((job) => {
              const data = job.data as { accountId?: string; campaignId?: string };
              return (
                (data.accountId && accountIds.has(data.accountId)) ||
                (data.campaignId && campaignIds.has(data.campaignId)) ||
                name === "sequenceDispatch" ||
                name === "anomalyCheck" ||
                name === "syncStatus"
              );
            })
            .map((job) => ({
              id: job.id,
              queue: name,
              name: job.name,
              state,
              attemptsMade: job.attemptsMade,
              failedReason: job.failedReason ?? null,
              timestamp: job.timestamp,
              processedOn: job.processedOn ?? null,
              finishedOn: job.finishedOn ?? null,
              data: job.data,
            }));
        })
      )
    )
      .flat()
      .sort((a, b) => (b.finishedOn ?? b.processedOn ?? b.timestamp) - (a.finishedOn ?? a.processedOn ?? a.timestamp))
      .slice(0, limit);

    res.json({ jobs, state, queue: queue ?? "all", limit });
  } catch (err) {
    next(err);
  }
});
