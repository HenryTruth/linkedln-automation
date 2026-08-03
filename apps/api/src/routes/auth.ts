import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma } from "@linkedin-automation/db";
import {
  getDashboardPublicUrl,
  sendVerificationEmail,
} from "../lib/emailVerification.js";

const scrypt = promisify(scryptCallback);
const SESSION_DAYS = 30;
const VERIFICATION_HOURS = 24;

export const authRouter: IRouter = Router();

const CredentialsSchema = z.object({
  email: z.string().email().transform((email) => email.toLowerCase()),
  password: z.string().min(1),
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  return { token, expiresAt };
}

async function createVerificationToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + VERIFICATION_HOURS * 60 * 60 * 1000);
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  return { token, expiresAt };
}

export async function sendUserVerificationEmail(user: { id: string; email: string }) {
  const { token } = await createVerificationToken(user.id);
  const verificationUrl = `${getDashboardPublicUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  await sendVerificationEmail({ email: user.email, verificationUrl });
}

function isAdminEmail(email: string) {
  const adminEmail = process.env.ADMIN_EMAIL;
  return Boolean(adminEmail && email.toLowerCase() === adminEmail.toLowerCase());
}

function publicUser(user: {
  id: string;
  email: string;
  plan: string;
  emailVerifiedAt?: Date | null;
  isAdmin?: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    plan: user.plan,
    emailVerified: Boolean(user.emailVerifiedAt),
    hasAllFeatures: true,
    isAdmin: Boolean(user.isAdmin || isAdminEmail(user.email)),
  };
}

authRouter.post("/signup", async (req, res, next) => {
  try {
    const { email, password } = CredentialsSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (!existing.emailVerifiedAt) {
        await sendUserVerificationEmail(existing);
        res.status(200).json({
          user: publicUser(existing),
          message: "Check your inbox for a verification link before signing in.",
        });
        return;
      }
      res.status(409).json({ error: "Email is already signed up" });
      return;
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        plan: "FREE_FOREVER",
      },
      select: { id: true, email: true, plan: true, emailVerifiedAt: true, isAdmin: true },
    });
    await sendUserVerificationEmail(user);
    res.status(201).json({
      user: publicUser(user),
      message: "Check your inbox for a verification link before signing in.",
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/resend-verification", async (req, res, next) => {
  try {
    const { email } = z.object({
      email: z.string().email().transform((value) => value.toLowerCase()),
    }).parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (user && !user.emailVerifiedAt) {
      await sendUserVerificationEmail(user);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/verify-email", async (req, res, next) => {
  try {
    const { token } = z.object({ token: z.string().min(16) }).parse(req.body);
    const tokenHash = hashToken(token);
    const record = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            plan: true,
            emailVerifiedAt: true,
            isAdmin: true,
          },
        },
      },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      res.status(400).json({ error: "Invalid or expired verification link" });
      return;
    }

    const user = await prisma.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: record.user.emailVerifiedAt ?? new Date() },
      select: { id: true, email: true, plan: true, emailVerifiedAt: true, isAdmin: true },
    });
    await prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    await prisma.emailVerificationToken.deleteMany({
      where: {
        userId: record.userId,
        id: { not: record.id },
        usedAt: null,
      },
    });

    const session = await createSession(user.id);
    res.json({ user: publicUser(user), ...session });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = CredentialsSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    if (!user.emailVerifiedAt) {
      res.status(403).json({ error: "Please verify your email before signing in." });
      return;
    }
    if (user.suspendedAt) {
      res.status(403).json({ error: "Your account has been suspended. Contact support." });
      return;
    }

    const session = await createSession(user.id);
    res.json({
      user: publicUser({
        id: user.id,
        email: user.email,
        plan: user.plan,
        emailVerifiedAt: user.emailVerifiedAt,
        isAdmin: user.isAdmin,
      }),
      ...session,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
    if (!token) {
      res.status(401).json({ error: "Missing bearer token" });
      return;
    }

    const session = await prisma.authSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            plan: true,
            emailVerifiedAt: true,
            suspendedAt: true,
            isAdmin: true,
          },
        },
      },
    });
    if (!session || session.expiresAt < new Date()) {
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }
    if (!session.user.emailVerifiedAt) {
      res.status(403).json({ error: "Please verify your email before continuing." });
      return;
    }
    if (session.user.suspendedAt) {
      res.status(403).json({ error: "Your account has been suspended. Contact support." });
      return;
    }

    res.json({ user: publicUser(session.user), expiresAt: session.expiresAt });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
    if (token) {
      await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
