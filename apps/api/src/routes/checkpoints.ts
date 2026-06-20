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
    const checkpoint = await prisma.checkpoint.update({
      where: { id: req.params.id },
      data: { resolvedAt: new Date(), resolvedBy },
    });
    res.json(checkpoint);
  } catch (err) {
    next(err);
  }
});

checkpointsRouter.get("/", async (req, res, next) => {
  try {
    const { accountId, unresolved } = req.query;
    const where: Record<string, unknown> = {};
    if (accountId) where.accountId = accountId;
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
