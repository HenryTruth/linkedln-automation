import type { Request, Response, NextFunction } from "express";
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

  console.error(err);
  const message =
    process.env.NODE_ENV !== "production" && err instanceof Error
      ? err.message
      : "Internal server error";
  res.status(500).json({ error: message });
}
