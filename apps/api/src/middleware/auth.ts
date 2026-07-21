import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "@linkedin-automation/db";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const auth = req.headers.authorization;
    const queryToken = typeof req.query.token === "string" ? req.query.token : null;
    const token = auth?.startsWith("Bearer ")
      ? auth.slice("Bearer ".length)
      : queryToken;
    if (!token) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }

    const session = await prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        expiresAt: true,
        user: { select: { id: true, email: true, plan: true } },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }

    req.user = session.user;
    next();
  } catch (err) {
    next(err);
  }
}
