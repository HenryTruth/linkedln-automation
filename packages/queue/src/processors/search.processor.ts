import type { Job } from "bullmq";
import { prisma, AccountStatus, CampaignStatus, LeadSource } from "@linkedin-automation/db";
import {
  assertWarmUpAllowed,
  checkActionWindow,
  pauseAccountForAnomaly,
  AccountPausedError,
  AnomalyError,
} from "@linkedin-automation/guards";
import { BrowserWorker, scrapeSearch } from "@linkedin-automation/browser";
import type { SearchScrapeJobData } from "../queues.js";

export interface SearchScrapeResult {
  scraped: number;
  pagesScraped: number;
  lastUrl: string;
}

export async function searchScrapeProcessor(
  job: Job<SearchScrapeJobData>
): Promise<SearchScrapeResult> {
  const { accountId, searchUrl, campaignId, leadLimit, source = "LINKEDIN" } = job.data;
  // LinkedIn renders 10 results per page — derive the page budget from the
  // requested lead count instead of always stopping after the default 5.
  const maxPages = job.data.maxPages ?? (leadLimit ? Math.ceil(leadLimit / 10) : 5);

  const [account, campaign] = await Promise.all([
    prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { status: true, warmUpPhase: true, userId: true },
    }),
    campaignId
      ? prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { targetTimezone: true },
        })
      : Promise.resolve(null),
  ]);
  const campaignTimezone = campaign?.targetTimezone ?? undefined;

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

  const worker = new BrowserWorker(accountId);
  try {
    await worker.launch();
    const page = await worker.getPage();

    const { urls, pagesScraped, lastUrl } = await scrapeSearch(
      page,
      searchUrl,
      accountId,
      maxPages,
      source,
      campaignTimezone,
      leadLimit
    );

    // A "successful" scrape with zero results usually means LinkedIn served a
    // layout our selectors don't recognize — keep a screenshot for diagnosis.
    let emptyNote = "";
    if (urls.length === 0) {
      const artifact = await worker.captureFailureArtifacts(
        `search-empty-${job.id ?? "unknown"}`
      );
      emptyNote = `; landed on ${lastUrl}${artifact ? `; artifact: ${artifact}` : ""}`;
    }

    await prisma.activityLog.create({
      data: {
        accountId,
        actionType: "searchScrape",
        targetUrl: searchUrl,
        result: `scraped ${urls.length} ${source.toLowerCase()} leads across ${pagesScraped} pages${emptyNote}`,
      },
    });

    if (campaignId && urls.length > 0) {
      const leadSource =
        source === "SALES_NAVIGATOR" ? LeadSource.SALES_NAVIGATOR : LeadSource.LINKEDIN_SEARCH;
      for (const linkedinUrl of urls) {
        const lead = await prisma.lead.upsert({
          where: {
            userId_linkedinUrl: {
              userId: account.userId,
              linkedinUrl,
            },
          },
          create: { userId: account.userId, linkedinUrl, source: leadSource, accountId },
          update: {},
        });

        await prisma.campaignLead.upsert({
          where: { campaignId_leadId: { campaignId, leadId: lead.id } },
          create: { campaignId, leadId: lead.id },
          update: {},
        });
      }

      // Fresh leads mean fresh work — a campaign that had auto-completed
      // goes back to ACTIVE so the new profiles can be scraped.
      await prisma.campaign.updateMany({
        where: { id: campaignId, status: CampaignStatus.COMPLETED },
        data: { status: CampaignStatus.ACTIVE },
      });
    }

    return { scraped: urls.length, pagesScraped, lastUrl };
  } catch (err) {
    const artifact = await worker.captureFailureArtifacts(`search-${job.id ?? "unknown"}`);
    if (artifact) {
      await prisma.activityLog.create({
        data: {
          accountId,
          actionType: "searchScrape",
          targetUrl: searchUrl,
          result: `failed: ${(err as Error).message}; artifact: ${artifact}`,
        },
      }).catch(() => {});
    }
    throw err;
  } finally {
    await worker.close();
  }
}
