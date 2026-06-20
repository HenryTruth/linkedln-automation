import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma, CampaignType, CampaignStatus, ConnectionStatus } from "@linkedin-automation/db";
import {
  connectQueue,
  messageQueue,
  scrapeQueue,
  searchScrapeQueue,
  contentSignalQueue,
} from "@linkedin-automation/queue";
import { renderTemplate, validateTemplate } from "@linkedin-automation/guards";

export const campaignsRouter: IRouter = Router();

const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  accountId: z.string(),
  type: z.nativeEnum(CampaignType),
  dailyLimit: z.number().int().min(1).max(40).default(10),
});

const CreateMessageSchema = z.object({
  sequenceOrder: z.number().int().min(0),
  bodyTemplate: z.string().min(1),
  variantGroup: z.string().default("A"),
  delayDays: z.number().int().min(0).default(3),
});

campaignsRouter.get("/", async (_req, res, next) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: { _count: { select: { leads: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(campaigns);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post("/", async (req, res, next) => {
  try {
    const data = CreateCampaignSchema.parse(req.body);
    const campaign = await prisma.campaign.create({ data });
    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get("/:id", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        leads: { include: { lead: true, postSignal: true } },
        messages: { orderBy: { sequenceOrder: "asc" } },
        contentSignalConfig: true,
      },
    });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.put("/:id", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    // Delete children in FK-safe order — no cascade configured in schema
    await prisma.campaignLead.deleteMany({ where: { campaignId: id } });
    await prisma.postSignal.deleteMany({ where: { campaignId: id } });
    await prisma.contentSignalConfig.deleteMany({ where: { campaignId: id } });
    await prisma.message.deleteMany({ where: { campaignId: id } });
    await prisma.campaign.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── Message template CRUD ──────────────────────────────────────────────────

campaignsRouter.get("/:id/messages", async (req, res, next) => {
  try {
    const messages = await prisma.message.findMany({
      where: { campaignId: req.params.id },
      orderBy: [{ sequenceOrder: "asc" }, { variantGroup: "asc" }],
    });
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post("/:id/messages", async (req, res, next) => {
  try {
    const data = CreateMessageSchema.parse(req.body);
    validateTemplate(data.bodyTemplate);
    const message = await prisma.message.create({
      data: { campaignId: req.params.id, ...data },
    });
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.put("/:id/messages/reorder", async (req, res, next) => {
  try {
    const schema = z.object({ ids: z.array(z.string()) });
    const { ids } = schema.parse(req.body);
    await Promise.all(
      ids.map((msgId, index) =>
        prisma.message.update({
          where: { id: msgId },
          data: { sequenceOrder: index },
        })
      )
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.put("/:id/messages/:msgId", async (req, res, next) => {
  try {
    if (req.body.bodyTemplate) {
      validateTemplate(req.body.bodyTemplate);
    }
    const message = await prisma.message.update({
      where: { id: req.params.msgId },
      data: req.body,
    });
    res.json(message);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.delete("/:id/messages/:msgId", async (req, res, next) => {
  try {
    await prisma.message.delete({ where: { id: req.params.msgId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── Campaign start ─────────────────────────────────────────────────────────

// ── Add lead to campaign ───────────────────────────────────────────────────

const AddLeadSchema = z.object({
  linkedinUrl: z.string().url(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
});

campaignsRouter.post("/:id/leads", async (req, res, next) => {
  try {
    const data = AddLeadSchema.parse(req.body);
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: req.params.id },
    });

    const lead = await prisma.lead.upsert({
      where: { linkedinUrl: data.linkedinUrl },
      create: { ...data, accountId: campaign.accountId },
      update: {},
    });

    const campaignLead = await prisma.campaignLead.upsert({
      where: { campaignId_leadId: { campaignId: campaign.id, leadId: lead.id } },
      create: { campaignId: campaign.id, leadId: lead.id },
      update: {},
    });

    res.status(201).json({ lead, campaignLeadId: campaignLead.id });
  } catch (err) {
    next(err);
  }
});

// ── Add search URL to SCRAPE campaign ─────────────────────────────────────

campaignsRouter.post("/:id/search-urls", async (req, res, next) => {
  try {
    const schema = z.object({ searchUrl: z.string().url() });
    const { searchUrl } = schema.parse(req.body);

    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: req.params.id },
    });

    // Queue a search-scrape job to crawl results pages and discover profiles
    await searchScrapeQueue.add("scrape-search", {
      accountId: campaign.accountId,
      searchUrl,
      campaignId: campaign.id,
    });

    res.status(201).json({ queued: 1, searchUrl });
  } catch (err) {
    next(err);
  }
});

// ── Start campaign ─────────────────────────────────────────────────────────

campaignsRouter.post("/:id/start", async (req, res, next) => {
  try {
    const fullCampaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        messages: { orderBy: { sequenceOrder: "asc" } },
        leads: {
          where: {
            OR: [{ nextActionAt: null }, { nextActionAt: { lte: new Date() } }],
          },
          include: { lead: true },
        },
      },
    });

    const batch = fullCampaign.leads.slice(0, fullCampaign.dailyLimit);
    const dispatched: string[] = [];

    // Determine available variant groups from step-0 messages
    const step0Messages = fullCampaign.messages.filter((m) => m.sequenceOrder === 0);
    const variantGroups = [...new Set(step0Messages.map((m) => m.variantGroup))];
    if (variantGroups.length === 0 && fullCampaign.type === CampaignType.MESSAGE) {
      res.status(422).json({ error: "No message templates defined for this campaign" });
      return;
    }

    for (const cl of batch) {
      const lead = cl.lead;

      if (fullCampaign.type === CampaignType.CONNECT) {
        await connectQueue.add("connect", {
          accountId: fullCampaign.accountId,
          leadId: lead.id,
          linkedinUrl: lead.linkedinUrl,
        });
      } else if (fullCampaign.type === CampaignType.MESSAGE) {
        // Assign a variant group to this lead (random from available groups)
        const assignedVariant =
          variantGroups[Math.floor(Math.random() * variantGroups.length)];

        // Persist variant assignment
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { variantGroup: assignedVariant },
        });

        // Pick the step-0 message for this variant (fall back to first available)
        const template =
          step0Messages.find((m) => m.variantGroup === assignedVariant) ??
          step0Messages[0];

        // Skip leads that haven't connected yet
        if (lead.connectionStatus !== ConnectionStatus.CONNECTED) {
          continue;
        }

        const messageBody = renderTemplate(template.bodyTemplate, {
          firstName: lead.firstName,
          lastName: lead.lastName,
          company: lead.company,
          title: lead.title,
        });

        // Schedule nextActionAt for the second message in the sequence (if any)
        const step1Message = fullCampaign.messages.find((m) => m.sequenceOrder === 1);
        const nextActionAt = step1Message
          ? new Date(Date.now() + step1Message.delayDays * 24 * 60 * 60 * 1000)
          : null;

        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { nextActionAt },
        });

        await messageQueue.add("message", {
          accountId: fullCampaign.accountId,
          leadId: lead.id,
          linkedinUrl: lead.linkedinUrl,
          messageBody,
          campaignLeadId: cl.id,
          sequenceStep: 0,
          company: lead.company,
        });
      } else if (fullCampaign.type === CampaignType.SCRAPE) {
        await scrapeQueue.add("scrape", {
          accountId: fullCampaign.accountId,
          linkedinUrl: lead.linkedinUrl,
          campaignId: fullCampaign.id,
        });
      }

      dispatched.push(lead.linkedinUrl);
    }

    // CONTENT_SIGNAL campaigns are triggered via the content-signal scrape job,
    // not via the lead batch loop above.
    if (fullCampaign.type === CampaignType.CONTENT_SIGNAL) {
      const config = await prisma.contentSignalConfig.findUnique({
        where: { campaignId: fullCampaign.id },
      });
      if (!config) {
        res.status(422).json({
          error: "No keyword config set on this campaign — save one in the Content Signal panel first",
        });
        return;
      }
      await contentSignalQueue.add("content-signal-scrape", {
        accountId: fullCampaign.accountId,
        campaignId: fullCampaign.id,
        keyword: config.keyword,
        dateRangeDays: config.dateRangeDays,
        maxLeads: config.maxLeads,
        titleFilter: config.titleFilter,
        companyFilter: config.companyFilter,
        connectionNoteTemplate: config.connectionNoteTemplate,
      });
      dispatched.push(`content-signal:${config.keyword}`);
    }

    res.json({ dispatched: dispatched.length, urls: dispatched });
  } catch (err) {
    next(err);
  }
});
