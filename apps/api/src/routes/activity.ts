import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma } from "@linkedin-automation/db";

export const activityRouter: IRouter = Router();

const ActivityFilterSchema = z.object({
  accountId: z.string().optional(),
  actionType: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function userFacingActivityResult(actionType: string, result?: string | null): string | null {
  if (!result) return result ?? null;

  if (actionType === "sessionHealthCheck") {
    if (
      /launchPersistentContext|profile appears to be in use|profile is already in use|Opening in existing browser session|process_singleton|Browser logs|--user-data-dir/i.test(
        result
      )
    ) {
      return "skipped: browser profile is busy; Vectra will retry automatically";
    }

    if (/checkpoint|authwall/i.test(result)) {
      return "failed: LinkedIn needs account verification";
    }

    if (/login|session/i.test(result)) {
      return "failed: LinkedIn session needs attention";
    }

    if (result.startsWith("failed:") && result.length > 120) {
      return "failed: session check could not complete; Vectra will retry automatically";
    }
  }

  return result.length > 500 ? `${result.slice(0, 500)}...` : result;
}

// GET /activity/export — CSV download of all matching logs (hard cap: 10k rows)
activityRouter.get("/export", async (req, res, next) => {
  try {
    const schema = z.object({
      accountId: z.string().optional(),
      actionType: z.string().optional(),
    });
    const { accountId, actionType } = schema.parse(req.query);

    const where: Record<string, unknown> = { account: { userId: req.user.id } };
    if (accountId) {
      where.accountId = accountId;
      where.account = { userId: req.user.id, id: accountId };
    }
    if (actionType) where.actionType = actionType;

    const logs = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 10_000,
    });

    const lines = [
      "id,accountId,actionType,targetUrl,result,createdAt",
      ...logs.map((l) =>
        [
          l.id,
          l.accountId,
          l.actionType,
          `"${(l.targetUrl ?? "").replace(/"/g, '""')}"`,
          `"${(userFacingActivityResult(l.actionType, l.result) ?? "").replace(/"/g, '""')}"`,
          l.createdAt.toISOString(),
        ].join(",")
      ),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="activity-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(lines.join("\n"));
  } catch (err) {
    next(err);
  }
});

activityRouter.get("/", async (req, res, next) => {
  try {
    const { accountId, actionType, page, limit } =
      ActivityFilterSchema.parse(req.query);

    const where: Record<string, unknown> = { account: { userId: req.user.id } };
    if (accountId) {
      where.accountId = accountId;
      where.account = { userId: req.user.id, id: accountId };
    }
    if (actionType) where.actionType = actionType;

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.activityLog.count({ where }),
    ]);

    res.json({
      logs: logs.map((log) => ({
        ...log,
        result: userFacingActivityResult(log.actionType, log.result),
      })),
      total,
      page,
      limit,
    });
  } catch (err) {
    next(err);
  }
});
