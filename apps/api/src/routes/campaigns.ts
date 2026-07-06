import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma, CampaignType, CampaignStatus, ConnectionStatus, LeadSource } from "@linkedin-automation/db";
import {
  connectQueue,
  inMailQueue,
  messageQueue,
  scrapeQueue,
  searchScrapeQueue,
  contentSignalQueue,
  maybeCompleteCampaign,
} from "@linkedin-automation/queue";
import { renderTemplate, validateTemplate } from "@linkedin-automation/guards";

export const campaignsRouter: IRouter = Router();

const NOTE_MAX = 300;

function isSalesNavigatorUrl(value: string): boolean {
  const url = new URL(value);
  return (
    url.hostname.endsWith("linkedin.com") &&
    (url.pathname.startsWith("/sales/search/people") ||
      url.pathname.startsWith("/sales/lists/people") ||
      url.pathname.startsWith("/sales/lead/"))
  );
}

type CampaignReadyAccount = {
  id: string;
  status: string;
  cookiesEncrypted: string | null;
  proxyId: string | null;
  salesNavigatorEnabled?: boolean;
};

function assertCampaignAccountReady(account: CampaignReadyAccount): string | null {
  if (account.status !== "ACTIVE") {
    return "Account is paused or restricted. Resume the account before starting a campaign.";
  }
  if (!account.proxyId) {
    return "Proxy required. Assign a matching residential proxy to this account before starting a campaign.";
  }
  if (!account.cookiesEncrypted) {
    return "LinkedIn session required. Connect or refresh this account's LinkedIn session before starting a campaign.";
  }
  return null;
}

function isSalesNavigatorLeadUrl(value: string): boolean {
  try {
    return new URL(value).pathname.startsWith("/sales/lead/");
  } catch {
    return false;
  }
}

const CreateCampaignSchema = z.object({
  name: z.string().min(1),
  accountId: z.string(),
  type: z.nativeEnum(CampaignType),
  dailyLimit: z.number().int().min(1).max(40).default(10),
  connectionNoteTemplate: z.string().max(NOTE_MAX).nullable().optional(),
  targetTimezone: z.string().nullable().optional(),
});

const UpdateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.nativeEnum(CampaignStatus).optional(),
  dailyLimit: z.number().int().min(1).max(40).optional(),
  connectionNoteTemplate: z.string().max(NOTE_MAX).nullable().optional(),
  targetTimezone: z.string().nullable().optional(),
});

const CreateMessageSchema = z.object({
  sequenceOrder: z.number().int().min(0),
  subjectTemplate: z.string().min(1).max(200).nullable().optional(),
  bodyTemplate: z.string().min(1),
  variantGroup: z.string().default("A"),
  delayDays: z.number().int().min(0).default(3),
});

const UpdateMessageSchema = z.object({
  sequenceOrder: z.number().int().min(0).optional(),
  subjectTemplate: z.string().min(1).max(200).nullable().optional(),
  bodyTemplate: z.string().min(1).optional(),
  variantGroup: z.string().min(1).optional(),
  delayDays: z.number().int().min(0).optional(),
});

campaignsRouter.get("/", async (req, res, next) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { account: { userId: req.user.id } },
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
    await prisma.account.findFirstOrThrow({
      where: { id: data.accountId, userId: req.user.id },
      select: { id: true },
    });
    const campaign = await prisma.campaign.create({ data });
    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.post("/:id/duplicate", async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).optional(),
    });
    const { name } = schema.parse(req.body);
    const source = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
      include: {
        messages: { orderBy: { sequenceOrder: "asc" } },
        contentSignalConfig: true,
      },
    });

    const copy = await prisma.campaign.create({
      data: {
        name: name ?? `${source.name} Copy`,
        accountId: source.accountId,
        type: source.type,
        status: CampaignStatus.PAUSED,
        dailyLimit: source.dailyLimit,
        messages: {
          create: source.messages.map((message) => ({
                sequenceOrder: message.sequenceOrder,
                subjectTemplate: message.subjectTemplate,
                bodyTemplate: message.bodyTemplate,
            variantGroup: message.variantGroup,
            delayDays: message.delayDays,
          })),
        },
        contentSignalConfig: source.contentSignalConfig
          ? {
              create: {
                keyword: source.contentSignalConfig.keyword,
                dateRangeDays: source.contentSignalConfig.dateRangeDays,
                maxLeads: source.contentSignalConfig.maxLeads,
                titleFilter: source.contentSignalConfig.titleFilter,
                companyFilter: source.contentSignalConfig.companyFilter,
                connectionNoteTemplate:
                  source.contentSignalConfig.connectionNoteTemplate,
              },
            }
          : undefined,
      },
      include: { _count: { select: { leads: true } } },
    });

    res.status(201).json(copy);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get("/:id", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
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
    const data = UpdateCampaignSchema.parse(req.body);
    const result = await prisma.campaign.updateMany({
      where: { id: req.params.id, account: { userId: req.user.id } },
      data,
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
    });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.delete("/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    await prisma.campaign.findFirstOrThrow({
      where: { id, account: { userId: req.user.id } },
      select: { id: true },
    });
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
    await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
      select: { id: true },
    });
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
    await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
      select: { id: true },
    });
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
    await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
      select: { id: true },
    });
    await Promise.all(
      ids.map((msgId, index) =>
        prisma.message.update({
          where: { id: msgId, campaignId: req.params.id },
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
    const data = UpdateMessageSchema.parse(req.body);
    if (data.bodyTemplate) {
      validateTemplate(data.bodyTemplate);
    }
    await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
      select: { id: true },
    });
    const message = await prisma.message.update({
      where: { id: req.params.msgId, campaignId: req.params.id },
      data,
    });
    res.json(message);
  } catch (err) {
    next(err);
  }
});

campaignsRouter.delete("/:id/messages/:msgId", async (req, res, next) => {
  try {
    await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
      select: { id: true },
    });
    await prisma.message.delete({ where: { id: req.params.msgId, campaignId: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── Campaign start ─────────────────────────────────────────────────────────

// ── Add lead to campaign ───────────────────────────────────────────────────

const AddLeadSchema = z.object({
  linkedinUrl: z.string().url(),
  source: z.nativeEnum(LeadSource).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
});

campaignsRouter.post("/:id/leads", async (req, res, next) => {
  try {
    const data = AddLeadSchema.parse(req.body);
    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
    });

    const source =
      data.source ?? (isSalesNavigatorLeadUrl(data.linkedinUrl) ? LeadSource.SALES_NAVIGATOR : LeadSource.MANUAL);

    const lead = await prisma.lead.upsert({
      where: {
        userId_linkedinUrl: {
          userId: req.user.id,
          linkedinUrl: data.linkedinUrl,
        },
      },
      create: { ...data, source, userId: req.user.id, accountId: campaign.accountId },
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
    const schema = z.object({
      searchUrl: z.string().url(),
      source: z.enum(["LINKEDIN", "SALES_NAVIGATOR"]).default("LINKEDIN"),
    });
    const { searchUrl, source } = schema.parse(req.body);

    if (source === "SALES_NAVIGATOR" && !isSalesNavigatorUrl(searchUrl)) {
      res.status(422).json({
        error: "Sales Navigator source requires a linkedin.com/sales search, list, or lead URL.",
      });
      return;
    }
    if (source === "LINKEDIN" && isSalesNavigatorUrl(searchUrl)) {
      res.status(422).json({
        error: "This is a Sales Navigator URL. Select Sales Navigator as the source.",
      });
      return;
    }

    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
      include: {
        account: {
          select: {
            id: true,
            status: true,
            cookiesEncrypted: true,
            proxyId: true,
            salesNavigatorEnabled: true,
          },
        },
      },
    });

    const readinessError = assertCampaignAccountReady(campaign.account);
    if (readinessError) {
      res.status(422).json({ error: readinessError });
      return;
    }
    if (source === "SALES_NAVIGATOR" && !campaign.account.salesNavigatorEnabled) {
      res.status(422).json({
        error: "Enable Sales Navigator on this account before scraping Sales Navigator URLs.",
      });
      return;
    }

    // Queue a search-scrape job to crawl results pages and discover profiles
    const job = await searchScrapeQueue.add("scrape-search", {
      accountId: campaign.accountId,
      searchUrl,
      campaignId: campaign.id,
      source,
    });

    res.status(201).json({ queued: 1, jobId: job.id, searchUrl, source });
  } catch (err) {
    next(err);
  }
});

campaignsRouter.get("/:id/search-jobs", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
      select: { id: true },
    });

    const jobs = await searchScrapeQueue.getJobs(
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

campaignsRouter.delete("/:id/search-jobs", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
      select: { id: true },
    });

    // Only finished jobs are cleared — waiting/active/delayed ones are still
    // doing work and stay visible until they resolve.
    const jobs = await searchScrapeQueue.getJobs(
      ["completed", "failed"],
      0,
      200,
      false
    );

    let removed = 0;
    for (const job of jobs) {
      const data = job.data as { campaignId?: string };
      if (data.campaignId !== campaign.id) continue;
      await job.remove();
      removed++;
    }

    res.json({ removed });
  } catch (err) {
    next(err);
  }
});

// ── Start campaign ─────────────────────────────────────────────────────────

campaignsRouter.post("/:id/start", async (req, res, next) => {
  try {
    const fullCampaign = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
      include: {
        account: {
          select: {
            id: true,
            status: true,
            cookiesEncrypted: true,
            proxyId: true,
            salesNavigatorEnabled: true,
          },
        },
        messages: { orderBy: { sequenceOrder: "asc" } },
        leads: {
          where: {
            OR: [{ nextActionAt: null }, { nextActionAt: { lte: new Date() } }],
            jobStatus: { notIn: ["QUEUED", "RUNNING"] },
          },
          include: { lead: true },
        },
      },
    });

    const readinessError = assertCampaignAccountReady(fullCampaign.account);
    if (readinessError) {
      res.status(422).json({ error: readinessError });
      return;
    }
    if (
      fullCampaign.type === CampaignType.INMAIL &&
      !fullCampaign.account.salesNavigatorEnabled
    ) {
      res.status(422).json({
        error: "Enable Sales Navigator on this account before starting an InMail campaign.",
      });
      return;
    }

    const batch = fullCampaign.leads.slice(0, fullCampaign.dailyLimit);
    const dispatched: string[] = [];

    // Determine available variant groups from step-0 messages
    const step0Messages = fullCampaign.messages.filter((m) => m.sequenceOrder === 0);
    const variantGroups = [...new Set(step0Messages.map((m) => m.variantGroup))];
    if (
      variantGroups.length === 0 &&
      (fullCampaign.type === CampaignType.MESSAGE || fullCampaign.type === CampaignType.INMAIL)
    ) {
      res.status(422).json({ error: "No message templates defined for this campaign" });
      return;
    }

    for (const cl of batch) {
      const lead = cl.lead;

      if (fullCampaign.type === CampaignType.CONNECT) {
        if (isSalesNavigatorLeadUrl(lead.linkedinUrl)) {
          await prisma.campaignLead.update({
            where: { id: cl.id },
            data: {
              jobStatus: "SKIPPED",
              lastJobError:
                "Sales Navigator lead URLs cannot be used for connection requests. Add the public LinkedIn profile URL instead.",
            },
          });
          continue;
        }
        const note = fullCampaign.connectionNoteTemplate
          ? renderTemplate(fullCampaign.connectionNoteTemplate, {
              firstName: lead.firstName,
              lastName: lead.lastName,
              company: lead.company,
              title: lead.title,
            })
          : undefined;
        const jobId = `campaign-${fullCampaign.id}-lead-${lead.id}-connect`;
        await connectQueue.add(
          "connect",
          {
            accountId: fullCampaign.accountId,
            leadId: lead.id,
            linkedinUrl: lead.linkedinUrl,
            note,
            campaignLeadId: cl.id,
          },
          { jobId }
        );
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { jobStatus: "QUEUED", queuedJobId: jobId, lastJobError: null },
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
        if (isSalesNavigatorLeadUrl(lead.linkedinUrl)) {
          await prisma.campaignLead.update({
            where: { id: cl.id },
            data: {
              jobStatus: "SKIPPED",
              lastJobError:
                "Sales Navigator lead URLs cannot be used for first-degree messages. Add the public LinkedIn profile URL instead.",
            },
          });
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

        const jobId = `campaign-${fullCampaign.id}-lead-${lead.id}-message-0`;
        await messageQueue.add(
          "message",
          {
            accountId: fullCampaign.accountId,
            leadId: lead.id,
            linkedinUrl: lead.linkedinUrl,
            messageBody,
            campaignLeadId: cl.id,
            sequenceStep: 0,
            company: lead.company,
          },
          { jobId }
        );
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { jobStatus: "QUEUED", queuedJobId: jobId, lastJobError: null },
        });
      } else if (fullCampaign.type === CampaignType.INMAIL) {
        const assignedVariant =
          variantGroups[Math.floor(Math.random() * variantGroups.length)];

        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { variantGroup: assignedVariant },
        });

        const template =
          step0Messages.find((m) => m.variantGroup === assignedVariant) ??
          step0Messages[0];

        const messageBody = renderTemplate(template.bodyTemplate, {
          firstName: lead.firstName,
          lastName: lead.lastName,
          company: lead.company,
          title: lead.title,
        });
        const subject = renderTemplate(
          template.subjectTemplate ?? "Hi {{firstName}}",
          {
            firstName: lead.firstName,
            lastName: lead.lastName,
            company: lead.company,
            title: lead.title,
          }
        ).trim() || "Quick question";
        const jobId = `campaign-${fullCampaign.id}-lead-${lead.id}-inmail`;

        await inMailQueue.add(
          "inmail",
          {
            accountId: fullCampaign.accountId,
            leadId: lead.id,
            linkedinUrl: lead.linkedinUrl,
            subject,
            messageBody,
            campaignLeadId: cl.id,
            company: lead.company,
          },
          { jobId }
        );
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { jobStatus: "QUEUED", queuedJobId: jobId, lastJobError: null },
        });
      } else if (fullCampaign.type === CampaignType.SCRAPE) {
        const jobId = `campaign-${fullCampaign.id}-lead-${lead.id}-scrape`;
        await scrapeQueue.add(
          "scrape",
          {
            accountId: fullCampaign.accountId,
            linkedinUrl: lead.linkedinUrl,
            campaignId: fullCampaign.id,
            campaignLeadId: cl.id,
          },
          { jobId }
        );
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { jobStatus: "QUEUED", queuedJobId: jobId, lastJobError: null },
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
      await contentSignalQueue.add(
        "content-signal-scrape",
        {
          accountId: fullCampaign.accountId,
          campaignId: fullCampaign.id,
          keyword: config.keyword,
          dateRangeDays: config.dateRangeDays,
          maxLeads: config.maxLeads,
          titleFilter: config.titleFilter,
          companyFilter: config.companyFilter,
          connectionNoteTemplate: config.connectionNoteTemplate,
        },
        { jobId: `campaign-${fullCampaign.id}-content-signal` }
      );
      dispatched.push(`content-signal:${config.keyword}`);
    }

    // Restarting a completed campaign (e.g. after new leads were added)
    // puts it back to ACTIVE so workers pick its leads up again.
    if (dispatched.length > 0 && fullCampaign.status === CampaignStatus.COMPLETED) {
      await prisma.campaign.update({
        where: { id: fullCampaign.id },
        data: { status: CampaignStatus.ACTIVE },
      });
    }

    res.json({ dispatched: dispatched.length, urls: dispatched });
  } catch (err) {
    next(err);
  }
});

// GET /campaigns/:id/stats — conversion funnel for this campaign
campaignsRouter.get("/:id/stats", async (req, res, next) => {
  try {
    const campaignId = req.params.id;
    await prisma.campaign.findFirstOrThrow({
      where: { id: campaignId, account: { userId: req.user.id } },
      select: { id: true },
    });

    const [totalLeads, connected, pending, replied] = await Promise.all([
      prisma.campaignLead.count({ where: { campaignId } }),
      prisma.campaignLead.count({
        where: { campaignId, lead: { connectionStatus: "CONNECTED" } },
      }),
      prisma.campaignLead.count({
        where: { campaignId, lead: { connectionStatus: "PENDING" } },
      }),
      prisma.campaignLead.count({
        where: { campaignId, repliedAt: { not: null } },
      }),
    ]);

    const requestsSent = connected + pending;
    const acceptanceRate =
      requestsSent > 0 ? Math.round((connected / requestsSent) * 100) : 0;
    const replyRate =
      connected > 0 ? Math.round((replied / connected) * 100) : 0;

    res.json({ totalLeads, connected, pending, replied, acceptanceRate, replyRate });
  } catch (err) {
    next(err);
  }
});

// POST /campaigns/:id/leads/:leadId/mark-replied — manually mark a lead as replied
campaignsRouter.post("/:id/leads/:leadId/mark-replied", async (req, res, next) => {
  try {
    await prisma.campaignLead.updateMany({
      where: {
        campaignId: req.params.id,
        leadId: req.params.leadId,
        campaign: { account: { userId: req.user.id } },
        repliedAt: null,
      },
      data: { repliedAt: new Date() },
    });
    // A manual reply can be the last outstanding item in a message sequence.
    await maybeCompleteCampaign(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
