import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@linkedin-automation/db";
import {
  DailyCapExceededError,
  WarmUpError,
  AnomalyError,
  AccountPausedError,
} from "@linkedin-automation/guards";

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Invalid request",
      issues: err.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (
    err instanceof DailyCapExceededError ||
    err instanceof WarmUpError ||
    err instanceof AnomalyError ||
    err instanceof AccountPausedError
  ) {
    res.status(409).json({ error: (err as Error).message });
    return;
  }

  if (err instanceof Error && err.message.includes("not found")) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = err.meta?.target;
    const fields = Array.isArray(target) ? target.join(", ") : String(target ?? "field");
    const message = fields.includes("email")
      ? "An account with this email already exists — edit the existing account instead of adding a new one."
      : `A record with this ${fields} already exists.`;
    res.status(409).json({ error: message });
    return;
  }

  console.error(err);
  const message =
    process.env.NODE_ENV !== "production" && err instanceof Error
      ? err.message
      : "Internal server error";
  res.status(500).json({ error: message });
}
