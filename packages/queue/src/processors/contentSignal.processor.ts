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
import { connectQueue, contentSignalQueue } from "../queues.js";
import type { ContentSignalJobData } from "../queues.js";

const NEXT_DAY_CONTINUE_DELAY_MS = 12 * 60 * 60 * 1000;

async function maybeQueueAutoContinue(args: {
  job: Job<ContentSignalJobData>;
  accountId: string;
  campaignId: string;
  collected: number;
  nextPage: number;
  pagesScraped: number;
  currentEmptyBatchCount: number;
  campaignTimezone?: string;
}) {
  const {
    job,
    accountId,
    campaignId,
    collected,
    nextPage,
    pagesScraped,
    currentEmptyBatchCount,
    campaignTimezone,
  } = args;

  const emptyBatchCount = collected === 0 ? currentEmptyBatchCount + 1 : 0;
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      status: true,
      accountId: true,
      contentSignalConfig: true,
      _count: { select: { leads: true } },
    },
  });
  const config = campaign?.contentSignalConfig;
  if (!campaign || !config?.autoContinueUntilTarget) return null;
  if (campaign.accountId !== accountId || campaign.status !== "ACTIVE") return null;
  if (pagesScraped <= 0) return null;
  if (campaign._count.leads >= config.maxLeads) return null;
  if (emptyBatchCount >= config.autoContinueEmptyRunsLimit) return null;

  const remainingLeadTarget = Math.max(0, config.maxLeads - campaign._count.leads);
  const requestedPages = Math.min(
    config.maxPagesPerRun,
    Math.max(1, Math.ceil(remainingLeadTarget / 10))
  );
  const remainingSearchPages = await remainingDailyCap(accountId, "searchPage", campaignTimezone);
  const pagesForNextRun =
    remainingSearchPages > 0 ? Math.min(requestedPages, remainingSearchPages) : requestedPages;
  const delay =
    remainingSearchPages > 0
      ? config.autoContinueDelayMinutes * 60 * 1000
      : NEXT_DAY_CONTINUE_DELAY_MS;

  const continuation = await contentSignalQueue.add(
    "content-signal-scrape",
    {
      accountId,
      campaignId,
      keyword: config.keyword,
      dateRangeDays: config.dateRangeDays,
      maxLeads: config.maxLeads,
      startPage: nextPage,
      maxPagesPerRun: pagesForNextRun,
      titleFilter: config.titleFilter,
      companyFilter: config.companyFilter,
      locationFilter: config.locationFilter,
      connectionNoteTemplate: config.connectionNoteTemplate,
      autoContinueUntilTarget: true,
      emptyBatchCount,
    },
    {
      jobId: `campaign-${campaignId}-content-signal-auto-${Date.now()}`,
      delay,
    }
  );

  await job.log(
    `auto-continue queued job ${continuation.id} from page ${nextPage} for ${pagesForNextRun} page(s) after ${Math.round(delay / 60_000)} minute(s)`
  );
  return {
    jobId: continuation.id,
    delay,
    startPage: nextPage,
    maxPagesPerRun: pagesForNextRun,
    emptyBatchCount,
    remainingLeadTarget,
    remainingSearchPages,
  };
}

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
    autoContinueUntilTarget = false,
    emptyBatchCount = 0,
  } = job.data;

  const [account, campaign] = await Promise.all([
    prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { status: true, warmUpPhase: true },
    }),
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        targetTimezone: true,
        _count: { select: { leads: true } },
      },
    }),
  ]);
  const campaignTimezone = campaign?.targetTimezone ?? undefined;
  const remainingLeadTarget = Math.max(0, maxLeads - (campaign?._count.leads ?? 0));
  const safeMaxPages = Math.min(10, Math.max(1, maxPagesPerRun));
  const pagesNeededForTarget = Math.max(1, Math.ceil(remainingLeadTarget / 10));
  const pagesThisRun = Math.min(safeMaxPages, pagesNeededForTarget);
  const endPage = startPage + pagesThisRun - 1;

  if (account.status === AccountStatus.PAUSED) {
    throw new AccountPausedError(accountId);
  }
  if (remainingLeadTarget <= 0) {
    await job.updateProgress({
      phase: "target_reached",
      page: startPage,
      maxPages: startPage,
      startPage,
      endPage: startPage,
      collected: 0,
      skipped: 0,
      scanned: 0,
      leadLimit: maxLeads,
    });
    return { collected: 0, skipped: 0, scanned: 0, pagesScraped: 0, nextPage: startPage };
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
    if (remainingSearchPages < pagesThisRun) {
      throw new Error(
        `Not enough search-page capacity for this content scrape. Requested ${pagesThisRun} page${pagesThisRun === 1 ? "" : "s"}, but this account has ${remainingSearchPages} search page${remainingSearchPages === 1 ? "" : "s"} remaining today. Lower pages per run, raise the account's Search Pages cap, or try again tomorrow.`
      );
    }
    for (let i = 0; i < pagesThisRun; i++) {
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
      pagesThisRun,
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

    if (autoContinueUntilTarget) {
      const continuation = await maybeQueueAutoContinue({
        job,
        accountId,
        campaignId,
        collected,
        nextPage,
        pagesScraped,
        currentEmptyBatchCount: emptyBatchCount,
        campaignTimezone,
      });
      if (continuation) {
        await job.updateProgress({
          phase: "continued",
          page: Math.max(startPage, nextPage - 1),
          maxPages: endPage,
          startPage,
          endPage,
          collected,
          skipped,
          scanned,
          leadLimit: maxLeads,
          continuation,
        });
      }
    }
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
