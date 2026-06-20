import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma, AccountStatus, WarmUpPhase } from "@linkedin-automation/db";
import { scheduleWithdrawalForAccount } from "@linkedin-automation/queue";
import { encrypt } from "@linkedin-automation/guards";

const WARMUP_ORDER: WarmUpPhase[] = [
  WarmUpPhase.MANUAL,
  WarmUpPhase.WEEK2,
  WarmUpPhase.WEEK3,
  WarmUpPhase.WEEK4,
  WarmUpPhase.FULL,
];

export const accountsRouter: IRouter = Router();

const CreateAccountSchema = z.object({
  email: z.string().email(),
  proxyId: z.string().optional(),
  timezone: z.string().default("America/New_York"),
  userAgent: z.string().optional(),
});

accountsRouter.get("/", async (_req, res, next) => {
  try {
    const accounts = await prisma.account.findMany({
      include: { proxy: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(accounts);
  } catch (err) {
    next(err);
  }
});

accountsRouter.post("/", async (req, res, next) => {
  try {
    const data = CreateAccountSchema.parse(req.body);
    const account = await prisma.account.create({ data });
    await scheduleWithdrawalForAccount(account.id);
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
});

accountsRouter.get("/:id", async (req, res, next) => {
  try {
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { proxy: true },
    });
    res.json(account);
  } catch (err) {
    next(err);
  }
});

accountsRouter.put("/:id", async (req, res, next) => {
  try {
    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(account);
  } catch (err) {
    next(err);
  }
});

accountsRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.account.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

accountsRouter.post("/:id/pause", async (req, res, next) => {
  try {
    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: { status: AccountStatus.PAUSED },
    });
    res.json(account);
  } catch (err) {
    next(err);
  }
});

// POST /accounts/:id/cookies — store session cookies after manual login
accountsRouter.post("/:id/cookies", async (req, res, next) => {
  try {
    const schema = z.object({ cookies: z.string().min(1) });
    const { cookies } = schema.parse(req.body);
    await prisma.account.update({
      where: { id: req.params.id },
      data: { cookiesEncrypted: encrypt(cookies) },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /accounts/:id/advance-warmup — move to next warm-up phase
accountsRouter.post("/:id/advance-warmup", async (req, res, next) => {
  try {
    const account = await prisma.account.findUniqueOrThrow({
      where: { id: req.params.id },
      select: { warmUpPhase: true },
    });
    const currentIndex = WARMUP_ORDER.indexOf(account.warmUpPhase);
    if (currentIndex >= WARMUP_ORDER.length - 1) {
      res.status(409).json({ error: "Account is already at full automation (FULL phase)" });
      return;
    }
    const updated = await prisma.account.update({
      where: { id: req.params.id },
      data: { warmUpPhase: WARMUP_ORDER[currentIndex + 1] },
      include: { proxy: true },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

accountsRouter.post("/:id/resume", async (req, res, next) => {
  try {
    const openCheckpoint = await prisma.checkpoint.findFirst({
      where: { accountId: req.params.id, resolvedAt: null },
    });
    if (openCheckpoint) {
      res.status(409).json({
        error: "Account has an unresolved checkpoint — resolve it first",
        checkpointId: openCheckpoint.id,
      });
      return;
    }
    const account = await prisma.account.update({
      where: { id: req.params.id },
      data: { status: AccountStatus.ACTIVE },
    });
    res.json(account);
  } catch (err) {
    next(err);
  }
});
