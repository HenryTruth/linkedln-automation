import { Router, type IRouter } from "express";
import { prisma } from "@linkedin-automation/db";

export const statsRouter: IRouter = Router();

statsRouter.get("/", async (req, res, next) => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [
      connectsSentToday,
      messagesSentToday,
      inMailsSentToday,
      totalLeads,
      connectedLeads,
      repliedLeads,
      totalCampaignLeads,
      activeAccounts,
      openCheckpoints,
    ] = await Promise.all([
      prisma.activityLog.count({
        where: {
          actionType: "connect",
          createdAt: { gte: todayStart },
          account: { userId: req.user.id },
        },
      }),
      prisma.activityLog.count({
        where: {
          actionType: "message",
          createdAt: { gte: todayStart },
          account: { userId: req.user.id },
        },
      }),
      prisma.activityLog.count({
        where: {
          actionType: "inmail",
          createdAt: { gte: todayStart },
          account: { userId: req.user.id },
        },
      }),
      prisma.lead.count({ where: { userId: req.user.id } }),
      prisma.lead.count({
        where: { userId: req.user.id, connectionStatus: "CONNECTED" },
      }),
      prisma.campaignLead.count({
        where: {
          repliedAt: { not: null },
          campaign: { account: { userId: req.user.id } },
        },
      }),
      prisma.campaignLead.count({
        where: { campaign: { account: { userId: req.user.id } } },
      }),
      prisma.account.count({ where: { userId: req.user.id, status: "ACTIVE" } }),
      prisma.checkpoint.count({
        where: { resolvedAt: null, account: { userId: req.user.id } },
      }),
    ]);

    const replyRate =
      totalCampaignLeads > 0
        ? Math.round((repliedLeads / totalCampaignLeads) * 100)
        : 0;

    res.json({
      connectsSentToday,
      messagesSentToday,
      inMailsSentToday,
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
