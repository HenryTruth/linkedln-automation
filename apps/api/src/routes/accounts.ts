import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma, AccountStatus, WarmUpPhase } from "@linkedin-automation/db";
import { scheduleWithdrawalForAccount } from "@linkedin-automation/queue";
import { encrypt, SYSTEM_CAPS, HARD_CEILING } from "@linkedin-automation/guards";
import {
  buildLinkedInAuthorizationUrl,
  exchangeLinkedInCode,
  parseLinkedInOAuthState,
} from "../lib/linkedinApi.js";

const WARMUP_ORDER: WarmUpPhase[] = [
  WarmUpPhase.MANUAL,
  WarmUpPhase.WEEK2,
  WarmUpPhase.WEEK3,
  WarmUpPhase.WEEK4,
  WarmUpPhase.FULL,
];

export const accountsRouter: IRouter = Router();
export const linkedinOAuthCallbackRouter: IRouter = Router();

type AccountPayload = Awaited<ReturnType<typeof prisma.account.findFirstOrThrow>>;

function publicProxy<T extends { password?: string } | null | undefined>(proxy: T) {
  if (!proxy) return proxy;
  const { password: _password, ...safeProxy } = proxy;
  return safeProxy;
}

function publicAccount<T extends AccountPayload & { proxy?: unknown }>(account: T) {
  const {
    cookiesEncrypted: _cookiesEncrypted,
    linkedinAccessTokenEncrypted: _linkedinAccessTokenEncrypted,
    proxy,
    ...safeAccount
  } = account;
  return {
    ...safeAccount,
    hasSession: Boolean(_cookiesEncrypted),
    sessionStatus: _cookiesEncrypted ? "ACTIVE" : "MISSING",
    hasLinkedInApiConnection: Boolean(
      _linkedinAccessTokenEncrypted && safeAccount.linkedinMemberUrn
    ),
    proxy: publicProxy(proxy as ({ password?: string } & Record<string, unknown>) | null | undefined),
  };
}

const CreateAccountSchema = z.object({
  email: z.string().email(),
  proxyId: z.string().optional(),
  timezone: z.string().default("America/New_York"),
  userAgent: z.string().optional(),
  salesNavigatorEnabled: z.boolean().default(false),
  inMailMonthlyLimit: z.number().int().min(1).max(500).default(50),
});

const UpdateAccountSchema = z.object({
  email: z.string().email().optional(),
  proxyId: z.string().nullable().optional(),
  timezone: z.string().min(1).optional(),
  userAgent: z.string().nullable().optional(),
  viewportWidth: z.number().int().min(320).max(3840).optional(),
  viewportHeight: z.number().int().min(320).max(2160).optional(),
  salesNavigatorEnabled: z.boolean().optional(),
  inMailMonthlyLimit: z.number().int().min(1).max(500).optional(),
  warmUpPhase: z.nativeEnum(WarmUpPhase).optional(),
  status: z.nativeEnum(AccountStatus).optional(),
});

accountsRouter.get("/", async (req, res, next) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: req.user.id },
      include: { proxy: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(accounts.map(publicAccount));
  } catch (err) {
    next(err);
  }
});

linkedinOAuthCallbackRouter.get("/", async (req, res) => {
  const successRedirect =
    process.env.LINKEDIN_OAUTH_SUCCESS_REDIRECT ??
    "http://localhost:3000/accounts?linkedin=connected";
  const errorRedirect =
    process.env.LINKEDIN_OAUTH_ERROR_REDIRECT ??
    "http://localhost:3000/accounts?linkedin=error";

  try {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const stateParam = typeof req.query.state === "string" ? req.query.state : null;
    const error = typeof req.query.error_description === "string"
      ? req.query.error_description
      : typeof req.query.error === "string"
      ? req.query.error
      : null;

    if (error) throw new Error(error);
    if (!code || !stateParam) throw new Error("Missing LinkedIn OAuth callback parameters.");

    const state = parseLinkedInOAuthState(stateParam);
    const token = await exchangeLinkedInCode(code);

    const result = await prisma.account.updateMany({
      where: { id: state.accountId, userId: state.userId },
      data: {
        linkedinAccessTokenEncrypted: token.accessTokenEncrypted,
        linkedinAccessTokenExpiresAt: token.accessTokenExpiresAt,
        linkedinMemberUrn: token.memberUrn,
        linkedinConnectedAt: new Date(),
      },
    });

    if (result.count === 0) throw new Error("LinkedIn account was not found.");
    res.redirect(successRedirect);
  } catch (err) {
    const message = err instanceof Error ? err.message : "LinkedIn OAuth failed.";
    const url = new URL(errorRedirect);
    url.searchParams.set("message", message);
    res.redirect(url.toString());
  }
});

accountsRouter.post("/:id/linkedin-oauth/start", async (req, res, next) => {
  try {
    await prisma.account.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true },
    });
    res.json({
      authorizationUrl: buildLinkedInAuthorizationUrl({
        accountId: req.params.id,
        userId: req.user.id,
      }),
    });
  } catch (err) {
    next(err);
  }
});

accountsRouter.post("/", async (req, res, next) => {
  try {
    const data = CreateAccountSchema.parse(req.body);
    if (data.proxyId) {
      await prisma.proxy.findFirstOrThrow({
        where: { id: data.proxyId, userId: req.user.id },
        select: { id: true },
      });
    }
    const account = await prisma.account.create({
      data: { ...data, userId: req.user.id },
    });
    await scheduleWithdrawalForAccount(account.id);
    res.status(201).json(publicAccount(account));
  } catch (err) {
    next(err);
  }
});

accountsRouter.get("/:id", async (req, res, next) => {
  try {
    const account = await prisma.account.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      include: { proxy: true },
    });
    res.json(publicAccount(account));
  } catch (err) {
    next(err);
  }
});

accountsRouter.put("/:id", async (req, res, next) => {
  try {
    const data = UpdateAccountSchema.parse(req.body);
    if (data.proxyId) {
      await prisma.proxy.findFirstOrThrow({
        where: { id: data.proxyId, userId: req.user.id },
        select: { id: true },
      });
    }
    const result = await prisma.account.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data,
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const account = await prisma.account.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      include: { proxy: true },
    });
    res.json(publicAccount(account));
  } catch (err) {
    next(err);
  }
});

accountsRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.account.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

accountsRouter.post("/:id/pause", async (req, res, next) => {
  try {
    const result = await prisma.account.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { status: AccountStatus.PAUSED },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const account = await prisma.account.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
    });
    res.json(publicAccount(account));
  } catch (err) {
    next(err);
  }
});

// POST /accounts/:id/cookies — store session cookies after manual login
accountsRouter.post("/:id/cookies", async (req, res, next) => {
  try {
    const schema = z.object({
      cookies: z.string().min(1),
      consent: z.literal(true, {
        errorMap: () => ({
          message:
            "Cookie storage consent is required before session cookies can be saved.",
        }),
      }),
    });
    const { cookies } = schema.parse(req.body);
    const result = await prisma.account.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { cookiesEncrypted: encrypt(cookies), cookiesConsentAt: new Date() },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /accounts/:id/advance-warmup — move to next warm-up phase
accountsRouter.post("/:id/advance-warmup", async (req, res, next) => {
  try {
    const account = await prisma.account.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      select: { warmUpPhase: true },
    });
    const currentIndex = WARMUP_ORDER.indexOf(account.warmUpPhase);
    if (currentIndex >= WARMUP_ORDER.length - 1) {
      res.status(409).json({ error: "Account is already at full automation (FULL phase)" });
      return;
    }
    await prisma.account.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { warmUpPhase: WARMUP_ORDER[currentIndex + 1] },
    });
    const updated = await prisma.account.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      include: { proxy: true },
    });
    res.json(publicAccount(updated));
  } catch (err) {
    next(err);
  }
});

// POST /accounts/:id/downgrade-warmup — move to previous warm-up phase
accountsRouter.post("/:id/downgrade-warmup", async (req, res, next) => {
  try {
    const account = await prisma.account.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      select: { warmUpPhase: true },
    });
    const currentIndex = WARMUP_ORDER.indexOf(account.warmUpPhase);
    if (currentIndex <= 0) {
      res.status(409).json({ error: "Account is already at the minimum warm-up phase (MANUAL)" });
      return;
    }
    await prisma.account.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { warmUpPhase: WARMUP_ORDER[currentIndex - 1] },
    });
    const updated = await prisma.account.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      include: { proxy: true },
    });
    res.json(publicAccount(updated));
  } catch (err) {
    next(err);
  }
});

// PUT /accounts/:id/caps — set per-account daily cap overrides
accountsRouter.put("/:id/caps", async (req, res, next) => {
  try {
    const schema = z.object({
      connection:  z.number().int().min(1).max(HARD_CEILING.connection).optional(),
      message:     z.number().int().min(1).max(HARD_CEILING.message).optional(),
      inmail:      z.number().int().min(1).max(HARD_CEILING.inmail).optional(),
      profileView: z.number().int().min(1).max(HARD_CEILING.profileView).optional(),
      searchPage:  z.number().int().min(1).max(HARD_CEILING.searchPage).optional(),
    });
    const caps = schema.parse(req.body);
    const result = await prisma.account.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { maxDailyCaps: caps },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const account = await prisma.account.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      include: { proxy: true },
    });
    res.json(publicAccount(account));
  } catch (err) {
    next(err);
  }
});

// GET /accounts/:id/caps — return current overrides + system defaults + hard ceilings
accountsRouter.get("/:id/caps", async (req, res, next) => {
  try {
    const account = await prisma.account.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      select: { maxDailyCaps: true },
    });
    res.json({
      overrides: account.maxDailyCaps,
      systemDefaults: SYSTEM_CAPS,
      hardCeilings: HARD_CEILING,
    });
  } catch (err) {
    next(err);
  }
});

accountsRouter.post("/:id/resume", async (req, res, next) => {
  try {
    const openCheckpoint = await prisma.checkpoint.findFirst({
      where: {
        accountId: req.params.id,
        resolvedAt: null,
        account: { userId: req.user.id },
      },
    });
    if (openCheckpoint) {
      res.status(409).json({
        error: "Account has an unresolved checkpoint — resolve it first",
        checkpointId: openCheckpoint.id,
      });
      return;
    }
    const result = await prisma.account.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { status: AccountStatus.ACTIVE },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const account = await prisma.account.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      include: { proxy: true },
    });
    res.json(publicAccount(account));
  } catch (err) {
    next(err);
  }
});
