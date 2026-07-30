import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma } from "@linkedin-automation/db";
import { generateCampaignStrategy } from "../lib/ai.js";

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
