import type { Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import {
  claimDailyCap,
  remainingDailyCap,
  assertWarmUpAllowed,
  checkActionWindow,
  checkSessionErrorRate,
  checkKeywordUniqueness,
  renderTemplate,
  pauseAccountForAnomaly,
  AccountPausedError,
  AnomalyError,
} from "@linkedin-automation/guards";
import { BrowserWorker, scrapeContentSearch } from "@linkedin-automation/browser";
import { connectQueue } from "../queues.js";
import type { ContentSignalJobData } from "../queues.js";

export async function contentSignalProcessor(
  job: Job<ContentSignalJobData>
): Promise<{ collected: number; skipped: number; scanned: number; pagesScraped: number; nextPage: number }> {
  const {
    accountId,
    campaignId,
    keyword,
    dateRangeDays,
    maxLeads,
    startPage = 1,
    maxPagesPerRun = 3,
    titleFilter,
    companyFilter,
    locationFilter,
    connectionNoteTemplate,
  } = job.data;

  const [account, campaign] = await Promise.all([
    prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { status: true, warmUpPhase: true },
    }),
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { targetTimezone: true },
    }),
  ]);
  const campaignTimezone = campaign?.targetTimezone ?? undefined;
  const safeMaxPages = Math.min(10, Math.max(1, maxPagesPerRun));
  const endPage = startPage + Math.min(safeMaxPages, Math.ceil(maxLeads / 10)) - 1;

  if (account.status === AccountStatus.PAUSED) {
    throw new AccountPausedError(accountId);
  }

  await job.updateProgress({
    phase: "checking_safety",
    page: startPage,
    maxPages: endPage,
    startPage,
    endPage,
    collected: 0,
    skipped: 0,
    scanned: 0,
    leadLimit: maxLeads,
  });

  try {
    // Guard A: content search consumes one searchPage cap per result page requested.
    assertWarmUpAllowed(accountId, account.warmUpPhase, "searchPage");
    const remainingSearchPages = await remainingDailyCap(accountId, "searchPage", campaignTimezone);
    if (remainingSearchPages < safeMaxPages) {
      throw new Error(
        `Not enough search-page capacity for this content scrape. Requested ${safeMaxPages} page${safeMaxPages === 1 ? "" : "s"}, but this account has ${remainingSearchPages} search page${remainingSearchPages === 1 ? "" : "s"} remaining today. Lower pages per run, raise the account's Search Pages cap, or try again tomorrow.`
      );
    }
    for (let i = 0; i < safeMaxPages; i++) {
      await claimDailyCap(accountId, "searchPage", campaignTimezone);
    }
    await checkActionWindow(accountId);
    await checkSessionErrorRate(accountId);
    // Guard E: keyword uniqueness across active campaigns
    await checkKeywordUniqueness(keyword, campaignId);
  } catch (err) {
    if (err instanceof AnomalyError) {
      await pauseAccountForAnomaly(accountId, (err as Error).message);
    }
    throw err;
  }

  const worker = new BrowserWorker(accountId);
  try {
    await job.updateProgress({
      phase: "opening_browser",
      page: startPage,
      maxPages: endPage,
      startPage,
      endPage,
      collected: 0,
      skipped: 0,
      scanned: 0,
      leadLimit: maxLeads,
    });
    await worker.launch();
    const page = await worker.getPage();

    const { collected, skipped, scanned, pagesScraped, nextPage, newLeads } = await scrapeContentSearch(
      page,
      accountId,
      campaignId,
      keyword,
      dateRangeDays,
      maxLeads,
      titleFilter,
      companyFilter,
      locationFilter,
      startPage,
      safeMaxPages,
      (progress) => job.updateProgress(progress)
    );

    await job.updateProgress({
      phase: "saving_results",
      page: Math.max(startPage, nextPage - 1),
      maxPages: endPage,
      startPage,
      endPage,
      collected,
      skipped,
      scanned,
      leadLimit: maxLeads,
    });

    await Promise.all([
      prisma.contentSignalConfig.update({
        where: { campaignId },
        data: { lastScrapedAt: new Date(), nextPageToScrape: nextPage },
      }),
      prisma.activityLog.create({
        data: {
          accountId,
          actionType: "scrape",
          targetUrl: `linkedin.com/search/content?keywords=${encodeURIComponent(keyword)}`,
          result: `collected:${collected} skipped:${skipped} scanned:${scanned} requested:${maxLeads} pages:${startPage}-${Math.max(startPage, nextPage - 1)} nextPage:${nextPage}`,
        },
      }),
    ]);

    // Auto-queue connection requests for new leads if a note template is configured (Guard D).
    // Guard A: connect jobs must fire at least 15–30 min after the scrape session ends.
    if (connectionNoteTemplate && newLeads.length > 0) {
      await job.updateProgress({
        phase: "queueing_connections",
        page: Math.max(startPage, nextPage - 1),
        maxPages: endPage,
        startPage,
        endPage,
        collected,
        skipped,
        scanned,
        leadLimit: maxLeads,
      });
      const BASE_DELAY_MS = 15 * 60 * 1000;
      const JITTER_MS = 15 * 60 * 1000;

      for (const lead of newLeads) {
        const note = renderTemplate(connectionNoteTemplate, {
          firstName: lead.firstName,
          lastName: lead.lastName,
          company: lead.company,
          postExcerpt: lead.postExcerpt,
          postTopic: lead.postTopic,
          postDate: lead.postDate,
        });

        const delayMs = BASE_DELAY_MS + Math.random() * JITTER_MS;

        await connectQueue.add(
          `content-signal-connect-${lead.leadId}`,
          {
            accountId,
            leadId: lead.leadId,
            linkedinUrl: lead.linkedinUrl,
            note,
          },
          { jobId: `content-signal-connect-${lead.leadId}`, delay: delayMs }
        );
      }
    }

    await job.updateProgress({
      phase: "completed",
      page: Math.max(startPage, nextPage - 1),
      maxPages: endPage,
      startPage,
      endPage,
      collected,
      skipped,
      scanned,
      leadLimit: maxLeads,
    });
    return { collected, skipped, scanned, pagesScraped, nextPage };
  } catch (err) {
    await job.updateProgress({
      phase: "failed",
      page: startPage,
      maxPages: endPage,
      startPage,
      endPage,
      collected: 0,
      skipped: 0,
      scanned: 0,
      leadLimit: maxLeads,
    }).catch(() => {});
    const artifact = await worker.captureFailureArtifacts(`content-signal-${job.id ?? "unknown"}`);
    if (artifact) {
      await prisma.activityLog.create({
        data: {
          accountId,
          actionType: "contentSignal",
          targetUrl: `linkedin.com/search/content?keywords=${encodeURIComponent(keyword)}`,
          result: `failed: ${(err as Error).message}; artifact: ${artifact}`,
        },
      }).catch(() => {});
    }
    throw err;
  } finally {
    await worker.close();
  }
}
