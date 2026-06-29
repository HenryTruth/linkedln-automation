import type { Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import {
  claimDailyCap,
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
): Promise<void> {
  const {
    accountId,
    campaignId,
    keyword,
    dateRangeDays,
    maxLeads,
    titleFilter,
    companyFilter,
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

  if (account.status === AccountStatus.PAUSED) {
    throw new AccountPausedError(accountId);
  }

  try {
    // Guard A: search counts as searchPage cap usage
    assertWarmUpAllowed(accountId, account.warmUpPhase, "searchPage");
    await claimDailyCap(accountId, "searchPage", campaignTimezone);
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
    await worker.launch();
    const page = await worker.getPage();

    const { collected, skipped, newLeads } = await scrapeContentSearch(
      page,
      accountId,
      campaignId,
      keyword,
      dateRangeDays,
      maxLeads,
      titleFilter,
      companyFilter
    );

    await Promise.all([
      prisma.contentSignalConfig.update({
        where: { campaignId },
        data: { lastScrapedAt: new Date() },
      }),
      prisma.activityLog.create({
        data: {
          accountId,
          actionType: "scrape",
          targetUrl: `linkedin.com/search/content?keywords=${encodeURIComponent(keyword)}`,
          result: `collected:${collected} skipped:${skipped}`,
        },
      }),
    ]);

    // Auto-queue connection requests for new leads if a note template is configured (Guard D).
    // Guard A: connect jobs must fire at least 15–30 min after the scrape session ends.
    if (connectionNoteTemplate && newLeads.length > 0) {
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
  } catch (err) {
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
