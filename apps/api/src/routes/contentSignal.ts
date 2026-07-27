import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma } from "@linkedin-automation/db";
import { contentSignalQueue } from "@linkedin-automation/queue";
import {
  checkKeywordUniqueness,
  validateContentSignalNote,
  ContentSignalGuardError,
} from "@linkedin-automation/guards";

export const contentSignalRouter: IRouter = Router();

type CampaignReadyAccount = {
  status: string;
  cookiesEncrypted: string | null;
  browserProfileStatus?: string | null;
  proxyId: string | null;
};

function campaignAccountReadinessError(account: CampaignReadyAccount): string | null {
  if (account.status !== "ACTIVE") {
    return "Account is paused or restricted. Resume the account before starting a campaign.";
  }
  if (!account.proxyId) {
    return "Proxy required. Assign a matching residential proxy to this account before starting a campaign.";
  }
  if (!account.cookiesEncrypted && account.browserProfileStatus !== "AUTHENTICATED") {
    return "LinkedIn session required. Connect the hosted browser profile or refresh this account's LinkedIn session before starting a campaign.";
  }
  return null;
}

const ConfigSchema = z.object({
  keyword: z.string().min(1).max(200),
  dateRangeDays: z.number().int().min(1).max(30).default(7),
  maxLeads: z.number().int().min(1).max(200).default(50),
  maxPagesPerRun: z.number().int().min(1).max(10).default(3),
  nextPageToScrape: z.number().int().min(1).max(100).optional(),
  autoContinueUntilTarget: z.boolean().default(false),
  autoContinueDelayMinutes: z.number().int().min(15).max(24 * 60).default(60),
  autoContinueEmptyRunsLimit: z.number().int().min(1).max(10).default(3),
  titleFilter: z.string().optional().nullable(),
  companyFilter: z.string().optional().nullable(),
  locationFilter: z.string().optional().nullable(),
  connectionNoteTemplate: z.string().max(300).optional().nullable(),
});

// GET /content-signal/:campaignId — get config for a campaign
contentSignalRouter.get("/:campaignId", async (req, res, next) => {
  try {
    await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.campaignId, account: { userId: req.user.id } },
      select: { id: true },
    });
    const config = await prisma.contentSignalConfig.findUnique({
      where: { campaignId: req.params.campaignId },
    });
    if (!config) {
      res.status(404).json({ error: "No content signal config for this campaign" });
      return;
    }
    res.json(config);
  } catch (err) {
    next(err);
  }
});

// POST /content-signal/:campaignId — create or replace config
contentSignalRouter.post("/:campaignId", async (req, res, next) => {
  try {
    const data = ConfigSchema.parse(req.body);
    await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.campaignId, account: { userId: req.user.id } },
      select: { id: true },
    });

    // Guard E — keyword must be unique across active campaigns
    try {
      await checkKeywordUniqueness(data.keyword, req.params.campaignId);
    } catch (err) {
      if (err instanceof ContentSignalGuardError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }

    // Guard D — if a connection note template is provided it must reference post context
    if (data.connectionNoteTemplate) {
      try {
        validateContentSignalNote(data.connectionNoteTemplate);
      } catch (err) {
        if (err instanceof ContentSignalGuardError) {
          res.status(422).json({ error: err.message });
          return;
        }
        throw err;
      }
    }

    const existing = await prisma.contentSignalConfig.findUnique({
      where: { campaignId: req.params.campaignId },
      select: { keyword: true, locationFilter: true },
    });
    const shouldResetCursor =
      !existing ||
      existing.keyword.toLowerCase() !== data.keyword.toLowerCase() ||
      (existing.locationFilter ?? "") !== (data.locationFilter ?? "");

    const config = await prisma.contentSignalConfig.upsert({
      where: { campaignId: req.params.campaignId },
      create: { campaignId: req.params.campaignId, ...data, nextPageToScrape: data.nextPageToScrape ?? 1 },
      update: {
        ...data,
        ...(shouldResetCursor && data.nextPageToScrape === undefined
          ? { nextPageToScrape: 1 }
          : {}),
      },
    });

    res.status(201).json(config);
  } catch (err) {
    next(err);
  }
});

// PUT /content-signal/:campaignId — update config
contentSignalRouter.put("/:campaignId", async (req, res, next) => {
  try {
    const data = ConfigSchema.partial().parse(req.body);
    await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.campaignId, account: { userId: req.user.id } },
      select: { id: true },
    });

    if (data.keyword) {
      try {
        await checkKeywordUniqueness(data.keyword, req.params.campaignId);
      } catch (err) {
        if (err instanceof ContentSignalGuardError) {
          res.status(409).json({ error: err.message });
          return;
        }
        throw err;
      }
    }

    const config = await prisma.contentSignalConfig.update({
      where: { campaignId: req.params.campaignId },
      data,
    });

    res.json(config);
  } catch (err) {
    next(err);
  }
});

// POST /content-signal/:campaignId/run — trigger a scrape job
contentSignalRouter.post("/:campaignId/run", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.campaignId, account: { userId: req.user.id } },
      include: {
        contentSignalConfig: true,
        _count: { select: { leads: true } },
        account: {
          select: {
            status: true,
            cookiesEncrypted: true,
            browserProfileStatus: true,
            proxyId: true,
          },
        },
      },
    });

    if (campaign.type !== "CONTENT_SIGNAL") {
      res.status(422).json({ error: "Campaign is not a CONTENT_SIGNAL type" });
      return;
    }

    const config = campaign.contentSignalConfig;
    if (!config) {
      res.status(422).json({ error: "No keyword config set — save a config first" });
      return;
    }

    const readinessError = campaignAccountReadinessError(campaign.account);
    if (readinessError) {
      res.status(422).json({ error: readinessError });
      return;
    }

    const remainingLeadTarget = Math.max(0, config.maxLeads - campaign._count.leads);
    if (remainingLeadTarget <= 0) {
      res.status(422).json({ error: "Content Signal target already reached. Increase max leads or remove leads before running again." });
      return;
    }

    const job = await contentSignalQueue.add(
      "content-signal-scrape",
      {
        accountId: campaign.accountId,
        campaignId: campaign.id,
        keyword: config.keyword,
        dateRangeDays: config.dateRangeDays,
        maxLeads: config.maxLeads,
        startPage: config.nextPageToScrape,
        maxPagesPerRun: config.maxPagesPerRun,
        titleFilter: config.titleFilter,
        companyFilter: config.companyFilter,
        locationFilter: config.locationFilter,
        connectionNoteTemplate: config.connectionNoteTemplate,
        autoContinueUntilTarget: config.autoContinueUntilTarget,
        emptyBatchCount: 0,
      },
      { jobId: `campaign-${campaign.id}-content-signal-${Date.now()}` }
    );

    const pageCount = Math.min(
      config.maxPagesPerRun,
      Math.max(1, Math.ceil(remainingLeadTarget / 10))
    );
    res.json({
      queued: true,
      keyword: config.keyword,
      jobId: job.id,
      startPage: config.nextPageToScrape,
      maxPagesPerRun: config.maxPagesPerRun,
      pageCount,
      autoContinueUntilTarget: config.autoContinueUntilTarget,
    });
  } catch (err) {
    next(err);
  }
});

// POST /content-signal/:campaignId/reset-cursor — start the next scrape from page 1
contentSignalRouter.post("/:campaignId/reset-cursor", async (req, res, next) => {
  try {
    await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.campaignId, account: { userId: req.user.id } },
      select: { id: true },
    });
    const config = await prisma.contentSignalConfig.update({
      where: { campaignId: req.params.campaignId },
      data: { nextPageToScrape: 1 },
    });
    res.json(config);
  } catch (err) {
    next(err);
  }
});

// GET /content-signal/:campaignId/jobs — show recent scrape queue state
contentSignalRouter.get("/:campaignId/jobs", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.campaignId, account: { userId: req.user.id } },
      select: { id: true },
    });

    const jobs = await contentSignalQueue.getJobs(
      ["waiting", "active", "delayed", "completed", "failed"],
      0,
      24,
      false
    );

    const scoped = await Promise.all(
      jobs
        .filter((job) => {
          const data = job.data as { campaignId?: string };
          return data.campaignId === campaign.id;
        })
        .map(async (job) => ({
          id: job.id,
          name: job.name,
          state: await job.getState(),
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason ?? null,
          timestamp: job.timestamp,
          processedOn: job.processedOn ?? null,
          finishedOn: job.finishedOn ?? null,
          progress: job.progress,
          data: job.data,
          returnvalue: job.returnvalue ?? null,
        }))
    );

    scoped.sort(
      (a, b) =>
        (b.finishedOn ?? b.processedOn ?? b.timestamp) -
        (a.finishedOn ?? a.processedOn ?? a.timestamp)
    );

    res.json({ jobs: scoped });
  } catch (err) {
    next(err);
  }
});

const SignalsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /content-signal/:campaignId/signals — list post signals collected (paginated)
contentSignalRouter.get("/:campaignId/signals", async (req, res, next) => {
  try {
    const { page, limit } = SignalsQuerySchema.parse(req.query);
    await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.campaignId, account: { userId: req.user.id } },
      select: { id: true },
    });
    const where = { campaignId: req.params.campaignId };
    const [signals, total] = await Promise.all([
      prisma.postSignal.findMany({
        where,
        include: { lead: true },
        orderBy: { scrapedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.postSignal.count({ where }),
    ]);
    res.json({ signals, total, page, limit });
  } catch (err) {
    next(err);
  }
});
