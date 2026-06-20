import { Router, type IRouter } from "express";
import { prisma } from "@linkedin-automation/db";

export const statsRouter: IRouter = Router();

statsRouter.get("/", async (_req, res, next) => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [
      connectsSentToday,
      messagesSentToday,
      totalLeads,
      connectedLeads,
      repliedLeads,
      totalCampaignLeads,
      activeAccounts,
      openCheckpoints,
    ] = await Promise.all([
      prisma.activityLog.count({
        where: { actionType: "connect", createdAt: { gte: todayStart } },
      }),
      prisma.activityLog.count({
        where: { actionType: "message", createdAt: { gte: todayStart } },
      }),
      prisma.lead.count(),
      prisma.lead.count({ where: { connectionStatus: "CONNECTED" } }),
      prisma.campaignLead.count({ where: { repliedAt: { not: null } } }),
      prisma.campaignLead.count(),
      prisma.account.count({ where: { status: "ACTIVE" } }),
      prisma.checkpoint.count({ where: { resolvedAt: null } }),
    ]);

    const replyRate =
      totalCampaignLeads > 0
        ? Math.round((repliedLeads / totalCampaignLeads) * 100)
        : 0;

    res.json({
      connectsSentToday,
      messagesSentToday,
      totalLeads,
      connectedLeads,
      replyRate,
      activeAccounts,
      openCheckpoints,
    });
  } catch (err) {
    next(err);
  }
});
