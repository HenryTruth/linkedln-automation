import type { Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import {
  assertWarmUpAllowed,
  checkActionWindow,
  remainingDailyCap,
  incrementDailyCap,
  pauseAccountForAnomaly,
  AccountPausedError,
  AnomalyError,
  DailyCapExceededError,
} from "@linkedin-automation/guards";
import { BrowserWorker, scrapeSearch } from "@linkedin-automation/browser";
import type { SearchScrapeJobData } from "../queues.js";

export async function searchScrapeProcessor(
  job: Job<SearchScrapeJobData>
): Promise<void> {
  const { accountId, searchUrl, campaignId, maxPages = 5 } = job.data;

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { status: true, warmUpPhase: true },
  });

  if (account.status === AccountStatus.PAUSED) {
    throw new AccountPausedError(accountId);
  }

  try {
    assertWarmUpAllowed(accountId, account.warmUpPhase, "searchPage");
    await checkActionWindow(accountId);
  } catch (err) {
    if (err instanceof AnomalyError) {
      await pauseAccountForAnomaly(accountId, (err as Error).message);
    }
    throw err;
  }

  const remaining = await remainingDailyCap(accountId, "searchPage");
  if (remaining === 0) {
    throw new DailyCapExceededError(accountId, "searchPage");
  }

  const pagesToScrape = Math.min(maxPages, remaining);

  const worker = new BrowserWorker(accountId);
  try {
    await worker.launch();
    const page = await worker.getPage();
    const { urls, pagesScraped } = await scrapeSearch(
      page,
      searchUrl,
      accountId,
      pagesToScrape
    );

    // Increment cap once per page actually visited
    for (let i = 0; i < pagesScraped; i++) {
      await incrementDailyCap(accountId, "searchPage");
    }

    await prisma.activityLog.create({
      data: {
        accountId,
        actionType: "searchScrape",
        targetUrl: searchUrl,
        result: `scraped ${urls.length} leads across ${pagesScraped} pages`,
      },
    });

    if (campaignId && urls.length > 0) {
      for (const linkedinUrl of urls) {
        const lead = await prisma.lead.findUnique({
          where: { linkedinUrl },
          select: { id: true },
        });
        if (!lead) continue;

        await prisma.campaignLead.upsert({
          where: { campaignId_leadId: { campaignId, leadId: lead.id } },
          create: { campaignId, leadId: lead.id },
          update: {},
        });
      }
    }
  } finally {
    await worker.close();
  }
}
