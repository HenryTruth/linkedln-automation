import type { NextFunction, Request, Response } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const isAdminEmail = Boolean(
    adminEmail && req.user.email.toLowerCase() === adminEmail.toLowerCase()
  );
  if (!req.user.isAdmin && !isAdminEmail) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
