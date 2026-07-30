import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma } from "@linkedin-automation/db";
import { generateCampaignStrategy, qualifyLead, reviewCampaignPreflight } from "../lib/ai.js";

export const aiRouter: IRouter = Router();

const CampaignStrategySchema = z.object({
  accountId: z.string().min(1).optional().nullable(),
  goal: z.string().min(5).max(1000),
  targetAudience: z.string().min(2).max(500),
  offer: z.string().max(500).optional().nullable(),
  tone: z.string().max(80).default("professional"),
});

aiRouter.post("/campaign-strategy", async (req, res, next) => {
  try {
    const data = CampaignStrategySchema.parse(req.body);
    const account = data.accountId
      ? await prisma.account.findFirst({
          where: { id: data.accountId, userId: req.user.id },
          select: {
            email: true,
            timezone: true,
            warmUpPhase: true,
            salesNavigatorEnabled: true,
            status: true,
            browserProfileStatus: true,
          },
        })
      : null;

    if (data.accountId && !account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const strategy = await generateCampaignStrategy({
      goal: data.goal,
      targetAudience: data.targetAudience,
      offer: data.offer,
      tone: data.tone,
      accountEmail: account?.email,
      accountTimezone: account?.timezone,
      warmUpPhase: account?.warmUpPhase,
      salesNavigatorEnabled: account?.salesNavigatorEnabled,
    });

    res.json(strategy);
  } catch (err) {
    next(err);
  }
});

aiRouter.post("/leads/:id/analyze", async (req, res, next) => {
  try {
    const data = z.object({ campaignId: z.string().optional().nullable() }).parse(req.body ?? {});
    const lead = await prisma.lead.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        postSignals: {
          orderBy: { scrapedAt: "desc" },
          take: 3,
          select: { keyword: true, excerpt: true },
        },
      },
    });
    const campaign = data.campaignId
      ? await prisma.campaign.findFirst({
          where: { id: data.campaignId, account: { userId: req.user.id } },
          select: {
            name: true,
            type: true,
            dailyLimit: true,
            connectionNoteTemplate: true,
          },
        })
      : null;

    if (data.campaignId && !campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const analysis = await qualifyLead({
      lead: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        title: lead.title,
        company: lead.company,
        linkedinUrl: lead.linkedinUrl,
        source: lead.source,
        connectionStatus: lead.connectionStatus,
        blacklisted: lead.blacklisted,
      },
      campaign: campaign
        ? {
            name: campaign.name,
            type: campaign.type,
            dailyLimit: campaign.dailyLimit,
            connectionNoteTemplate: campaign.connectionNoteTemplate,
          }
        : null,
      postSignals: lead.postSignals,
    });

    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        aiFitScore: Math.max(0, Math.min(100, Math.round(analysis.fitScore))),
        aiFit: analysis.fit,
        aiSummary: analysis.summary,
        aiRecommendedAngle: analysis.recommendedAngle,
        aiRiskFlags: analysis.riskFlags,
        aiSuggestedMessage: analysis.suggestedMessage,
        aiAnalyzedAt: new Date(),
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

aiRouter.post("/campaigns/:id/preflight", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
      include: {
        account: {
          select: {
            status: true,
            browserProfileStatus: true,
            warmUpPhase: true,
            salesNavigatorEnabled: true,
          },
        },
        messages: {
          orderBy: { sequenceOrder: "asc" },
          select: { bodyTemplate: true, delayDays: true },
        },
        contentSignalConfig: true,
        _count: { select: { leads: true } },
      },
    });

    const review = await reviewCampaignPreflight({
      campaign: {
        name: campaign.name,
        type: campaign.type,
        status: campaign.status,
        dailyLimit: campaign.dailyLimit,
        connectionNoteTemplate: campaign.connectionNoteTemplate,
        leadTotal: campaign._count.leads,
        messages: campaign.messages,
      },
      account: campaign.account,
    });

    res.json(review);
  } catch (err) {
    next(err);
  }
});
