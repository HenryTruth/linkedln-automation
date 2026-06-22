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

const ConfigSchema = z.object({
  keyword: z.string().min(1).max(200),
  dateRangeDays: z.number().int().min(1).max(30).default(7),
  maxLeads: z.number().int().min(1).max(200).default(50),
  titleFilter: z.string().optional().nullable(),
  companyFilter: z.string().optional().nullable(),
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

    const config = await prisma.contentSignalConfig.upsert({
      where: { campaignId: req.params.campaignId },
      create: { campaignId: req.params.campaignId, ...data },
      update: data,
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
      include: { contentSignalConfig: true },
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

    await contentSignalQueue.add(
      "content-signal-scrape",
      {
        accountId: campaign.accountId,
        campaignId: campaign.id,
        keyword: config.keyword,
        dateRangeDays: config.dateRangeDays,
        maxLeads: config.maxLeads,
        titleFilter: config.titleFilter,
        companyFilter: config.companyFilter,
        connectionNoteTemplate: config.connectionNoteTemplate,
      },
      { jobId: `campaign-${campaign.id}-content-signal` }
    );

    res.json({ queued: true, keyword: config.keyword });
  } catch (err) {
    next(err);
  }
});

// GET /content-signal/:campaignId/signals — list post signals collected
contentSignalRouter.get("/:campaignId/signals", async (req, res, next) => {
  try {
    await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.campaignId, account: { userId: req.user.id } },
      select: { id: true },
    });
    const signals = await prisma.postSignal.findMany({
      where: { campaignId: req.params.campaignId },
      include: { lead: true },
      orderBy: { scrapedAt: "desc" },
      take: 100,
    });
    res.json(signals);
  } catch (err) {
    next(err);
  }
});
