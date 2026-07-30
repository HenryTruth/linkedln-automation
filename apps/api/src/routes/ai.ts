import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { prisma } from "@linkedin-automation/db";
import {
  generateCampaignStrategy,
  generateDocumentPlan,
  generateImageBytes,
  qualifyLead,
  refinePostDraft,
  reviewCampaignPreflight,
} from "../lib/ai.js";
import { renderDocumentPdf } from "../lib/pdf.js";

export const aiRouter: IRouter = Router();

const CampaignStrategySchema = z.object({
  accountId: z.string().min(1).optional().nullable(),
  goal: z.string().min(5).max(1000),
  targetAudience: z.string().min(2).max(500),
  offer: z.string().max(500).optional().nullable(),
  tone: z.string().max(80).default("professional"),
});

const RefinePostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  instruction: z.string().min(1).max(1000),
  angle: z.string().max(160).optional().nullable(),
  tone: z.string().max(80).optional().nullable(),
  audience: z.string().max(160).optional().nullable(),
  context: z.string().max(1200).optional().nullable(),
});

const AssetPostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  prompt: z.string().max(1200).optional().nullable(),
  audience: z.string().max(160).optional().nullable(),
});

function assetPublicUrl(req: Request, id: string, filename: string) {
  const base = process.env.API_PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`;
  return `${base.replace(/\/$/, "")}/ai-assets/${id}/${encodeURIComponent(filename)}`;
}

function safeFilename(value: string, extension: string) {
  const stem = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${stem || "vectra-asset"}.${extension}`;
}

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

aiRouter.post("/posts/refine", async (req, res, next) => {
  try {
    const data = RefinePostSchema.parse(req.body);
    const draft = await refinePostDraft(data);
    res.json(draft);
  } catch (err) {
    next(err);
  }
});

aiRouter.post("/posts/assets/image", async (req, res, next) => {
  try {
    const data = AssetPostSchema.parse(req.body);
    const prompt =
      data.prompt?.trim() ||
      `Create a professional LinkedIn image that supports this post: ${data.title}`;
    const bytes = await generateImageBytes({
      prompt,
      title: data.title,
      body: data.body,
      format: "png",
    });
    const asset = await prisma.aiGeneratedAsset.create({
      data: {
        userId: req.user.id,
        kind: "IMAGE",
        filename: safeFilename(data.title, "png"),
        mimeType: "image/png",
        bytes,
        prompt,
      },
    });
    res.status(201).json({
      id: asset.id,
      type: "IMAGE",
      url: assetPublicUrl(req, asset.id, asset.filename),
      title: data.title,
      description: prompt,
    });
  } catch (err) {
    next(err);
  }
});

aiRouter.post("/posts/assets/document", async (req, res, next) => {
  try {
    const data = AssetPostSchema.parse(req.body);
    const plan = await generateDocumentPlan({
      title: data.title,
      body: data.body,
      instruction: data.prompt,
      audience: data.audience,
    });
    const bytes = renderDocumentPdf(plan);
    const asset = await prisma.aiGeneratedAsset.create({
      data: {
        userId: req.user.id,
        kind: "DOCUMENT",
        filename: safeFilename(plan.title, "pdf"),
        mimeType: "application/pdf",
        bytes,
        prompt: data.prompt,
      },
    });
    res.status(201).json({
      id: asset.id,
      type: "DOCUMENT",
      url: assetPublicUrl(req, asset.id, asset.filename),
      title: plan.title,
      description: plan.subtitle,
    });
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
