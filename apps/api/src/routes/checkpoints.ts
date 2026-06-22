import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma } from "@linkedin-automation/db";

export const checkpointsRouter: IRouter = Router();

const ResolveSchema = z.object({
  resolvedBy: z.string().min(1),
});

checkpointsRouter.post("/:id/resolve", async (req, res, next) => {
  try {
    const { resolvedBy } = ResolveSchema.parse(req.body);
    const result = await prisma.checkpoint.updateMany({
      where: { id: req.params.id, account: { userId: req.user.id } },
      data: { resolvedAt: new Date(), resolvedBy },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Checkpoint not found" });
      return;
    }
    const checkpoint = await prisma.checkpoint.findFirstOrThrow({
      where: { id: req.params.id, account: { userId: req.user.id } },
    });
    res.json(checkpoint);
  } catch (err) {
    next(err);
  }
});

checkpointsRouter.get("/", async (req, res, next) => {
  try {
    const { accountId, unresolved } = req.query;
    const where: Record<string, unknown> = { account: { userId: req.user.id } };
    if (accountId) {
      where.accountId = accountId;
      where.account = { userId: req.user.id, id: accountId as string };
    }
    if (unresolved === "true") where.resolvedAt = null;

    const checkpoints = await prisma.checkpoint.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      include: { account: { select: { email: true } } },
    });
    res.json(checkpoints);
  } catch (err) {
    next(err);
  }
});
