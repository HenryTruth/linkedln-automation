import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma } from "@linkedin-automation/db";
import {
  connectQueue,
  messageQueue,
  inMailQueue,
  scrapeQueue,
  withdrawQueue,
  searchScrapeQueue,
  sequenceDispatchQueue,
  sequenceEngineDispatchQueue,
  likePostQueue,
  withdrawSingleQueue,
  visitProfileQueue,
  contentSignalQueue,
  anomalyCheckQueue,
  syncStatusQueue,
  sessionHealthCheckQueue,
  linkedInPostPublishQueue,
} from "@linkedin-automation/queue";
import { sendUserVerificationEmail } from "./auth.js";
import { publicProxy } from "./proxies.js";

export const adminRouter: IRouter = Router();

const queues = {
  connect: connectQueue,
  message: messageQueue,
  inMail: inMailQueue,
  scrape: scrapeQueue,
  withdraw: withdrawQueue,
  searchScrape: searchScrapeQueue,
  sequenceDispatch: sequenceDispatchQueue,
  sequenceEngineDispatch: sequenceEngineDispatchQueue,
  likePost: likePostQueue,
  withdrawSingle: withdrawSingleQueue,
  visitProfile: visitProfileQueue,
  contentSignal: contentSignalQueue,
  anomalyCheck: anomalyCheckQueue,
  syncStatus: syncStatusQueue,
  sessionHealthCheck: sessionHealthCheckQueue,
  linkedinPostPublish: linkedInPostPublishQueue,
};

const jobStates = ["active", "waiting", "delayed", "completed", "failed"] as const;

function isAdminEmail(email: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  return Boolean(adminEmail && email.toLowerCase() === adminEmail.toLowerCase());
}

function isAdminUser(user: { email: string; isAdmin?: boolean }): boolean {
  return Boolean(user.isAdmin || isAdminEmail(user.email));
}

adminRouter.get("/users", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        plan: true,
        emailVerifiedAt: true,
        suspendedAt: true,
        createdAt: true,
        _count: { select: { accounts: true } },
        accounts: { select: { _count: { select: { campaigns: true } } } },
      },
    });
    res.json(
      users.map(({ accounts, _count, ...user }) => ({
        ...user,
        accountCount: _count.accounts,
        campaignCount: accounts.reduce((sum, a) => sum + a._count.campaigns, 0),
      }))
    );
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/users/:id", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        plan: true,
        emailVerifiedAt: true,
        suspendedAt: true,
        createdAt: true,
        accounts: {
          select: {
            id: true,
            email: true,
            status: true,
            warmUpPhase: true,
            createdAt: true,
            campaigns: {
              select: { id: true, name: true, type: true, status: true, createdAt: true },
            },
          },
        },
      },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/users/:id/resend-verification", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.emailVerifiedAt) {
      res.status(400).json({ error: "User is already verified" });
      return;
    }
    await sendUserVerificationEmail(user);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/users/:id/suspend", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, isAdmin: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (isAdminUser(user)) {
      res.status(400).json({ error: "Cannot suspend the admin account" });
      return;
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { suspendedAt: new Date() },
      select: { id: true, email: true, suspendedAt: true },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

adminRouter.post("/users/:id/unsuspend", async (req, res, next) => {
  try {
    const result = await prisma.user.updateMany({
      where: { id: req.params.id },
      data: { suspendedAt: null },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: req.params.id },
      select: { id: true, email: true, suspendedAt: true },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

adminRouter.delete("/users/:id", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, isAdmin: true },
    });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (isAdminUser(user)) {
      res.status(400).json({ error: "Cannot delete the admin account" });
      return;
    }
    await prisma.user.delete({ where: { id: user.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/queues", async (_req, res, next) => {
  try {
    const queueEntries = Object.entries(queues);

    const countsPerQueue = await Promise.all(
      queueEntries.map(async ([name, bullQueue]) => [name, await bullQueue.getJobCounts(...jobStates)] as const)
    );
    const byQueue = Object.fromEntries(countsPerQueue);
    const totals = Object.fromEntries(
      jobStates.map((s) => [s, countsPerQueue.reduce((sum, [, c]) => sum + (c[s] ?? 0), 0)])
    );

    const failedPerQueue = await Promise.all(
      queueEntries.map(async ([name, bullQueue]) => {
        const rows = await bullQueue.getJobs(["failed"], 0, 9, false);
        return rows.map((job) => ({
          id: job.id,
          queue: name,
          name: job.name,
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason ?? null,
          timestamp: job.timestamp,
          finishedOn: job.finishedOn ?? null,
          data: job.data,
        }));
      })
    );
    const recentFailures = failedPerQueue
      .flat()
      .sort((a, b) => (b.finishedOn ?? b.timestamp) - (a.finishedOn ?? a.timestamp))
      .slice(0, 50);

    res.json({ totals, byQueue, recentFailures });
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/checkpoints", async (req, res, next) => {
  try {
    const { unresolved } = z.object({ unresolved: z.string().optional() }).parse(req.query);
    const checkpoints = await prisma.checkpoint.findMany({
      where: unresolved === "true" ? { resolvedAt: null } : {},
      orderBy: { detectedAt: "desc" },
      include: { account: { select: { email: true, user: { select: { email: true } } } } },
    });
    res.json(checkpoints);
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/proxies", async (_req, res, next) => {
  try {
    const proxies = await prisma.proxy.findMany({
      orderBy: { updatedAt: "desc" },
      include: { user: { select: { email: true } } },
    });
    res.json(proxies.map(publicProxy));
  } catch (err) {
    next(err);
  }
});

adminRouter.get("/accounts", async (_req, res, next) => {
  try {
    const [byStatus, byWarmUp, accounts] = await Promise.all([
      prisma.account.groupBy({ by: ["status"], _count: true }),
      prisma.account.groupBy({ by: ["warmUpPhase"], _count: true }),
      prisma.account.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          status: true,
          warmUpPhase: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      }),
    ]);
    res.json({ byStatus, byWarmUp, accounts });
  } catch (err) {
    next(err);
  }
});
