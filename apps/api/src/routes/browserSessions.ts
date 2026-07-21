import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma } from "@linkedin-automation/db";
import { BrowserWorker } from "@linkedin-automation/browser";

export const browserSessionsRouter: IRouter = Router();

const DEFAULT_URL = "https://www.linkedin.com/feed/";
const SESSION_TTL_MS = 30 * 60_000;

type RemoteBrowserSession = {
  accountId: string;
  userId: string;
  worker: BrowserWorker;
  page: Awaited<ReturnType<BrowserWorker["getPage"]>>;
  lastUsedAt: number;
};

type BrowserPage = RemoteBrowserSession["page"];

const sessions = new Map<string, RemoteBrowserSession>();

function key(userId: string, accountId: string): string {
  return `${userId}:${accountId}`;
}

async function closeSession(sessionKey: string): Promise<void> {
  const session = sessions.get(sessionKey);
  if (!session) return;
  sessions.delete(sessionKey);
  await session.worker.close().catch(() => {});
}

async function assertAccountOwner(userId: string, accountId: string) {
  return prisma.account.findFirstOrThrow({
    where: { id: accountId, userId },
    select: { id: true },
  });
}

async function summarize(page: BrowserPage) {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const loginInputs = await page
    .locator("input[name=session_key], input[name=session_password]")
    .count()
    .catch(() => 0);
  const checkpointForms = await page
    .locator("form[action*='/checkpoint/'], #captcha-challenge")
    .count()
    .catch(() => 0);
  const profileLinks = await page
    .locator('main a[href*="/in/"]')
    .count()
    .catch(() => 0);
  const nextButtons = await page
    .locator('[data-testid^="pagination-controls-next-button"]')
    .count()
    .catch(() => 0);

  return {
    url,
    title,
    loginInputs,
    checkpointForms,
    profileLinks,
    nextButtons,
    authenticated:
      !/\/(login|uas\/login|authwall|checkpoint)/.test(url) &&
      loginInputs === 0 &&
      checkpointForms === 0,
    searchQualified:
      !/\/(login|uas\/login|authwall|checkpoint)/.test(url) &&
      profileLinks > 0,
  };
}

async function getSession(userId: string, accountId: string) {
  const sessionKey = key(userId, accountId);
  const session = sessions.get(sessionKey);
  if (!session) return null;
  if (Date.now() - session.lastUsedAt > SESSION_TTL_MS) {
    await closeSession(sessionKey);
    return null;
  }
  session.lastUsedAt = Date.now();
  return session;
}

browserSessionsRouter.post("/:id/browser-session/start", async (req, res, next) => {
  try {
    const schema = z.object({
      url: z.string().url().optional(),
    });
    const { url = DEFAULT_URL } = schema.parse(req.body ?? {});
    const accountId = req.params.id;
    await assertAccountOwner(req.user.id, accountId);

    const sessionKey = key(req.user.id, accountId);
    await closeSession(sessionKey);

    const worker = new BrowserWorker(accountId, {
      allowPaused: true,
      usePersistentProfile: true,
    });
    await worker.launch();
    const page = await worker.getPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(3_000);

    sessions.set(sessionKey, {
      accountId,
      userId: req.user.id,
      worker,
      page,
      lastUsedAt: Date.now(),
    });

    res.json(await summarize(page));
  } catch (err) {
    next(err);
  }
});

browserSessionsRouter.post("/:id/browser-session/stop", async (req, res, next) => {
  try {
    await assertAccountOwner(req.user.id, req.params.id);
    await closeSession(key(req.user.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

browserSessionsRouter.get("/:id/browser-session/status", async (req, res, next) => {
  try {
    await assertAccountOwner(req.user.id, req.params.id);
    const session = await getSession(req.user.id, req.params.id);
    if (!session) {
      res.status(404).json({ error: "No active browser session" });
      return;
    }
    res.json(await summarize(session.page));
  } catch (err) {
    next(err);
  }
});

browserSessionsRouter.get("/:id/browser-session/screenshot", async (req, res, next) => {
  try {
    await assertAccountOwner(req.user.id, req.params.id);
    const session = await getSession(req.user.id, req.params.id);
    if (!session) {
      res.status(404).json({ error: "No active browser session" });
      return;
    }
    const image = await session.page.screenshot({ type: "png", fullPage: false });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(image);
  } catch (err) {
    next(err);
  }
});

browserSessionsRouter.post("/:id/browser-session/navigate", async (req, res, next) => {
  try {
    const schema = z.object({ url: z.string().url() });
    const { url } = schema.parse(req.body);
    await assertAccountOwner(req.user.id, req.params.id);
    const session = await getSession(req.user.id, req.params.id);
    if (!session) {
      res.status(404).json({ error: "No active browser session" });
      return;
    }
    await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await session.page.waitForTimeout(2_000);
    res.json(await summarize(session.page));
  } catch (err) {
    next(err);
  }
});

browserSessionsRouter.post("/:id/browser-session/click", async (req, res, next) => {
  try {
    const schema = z.object({
      x: z.number().min(0),
      y: z.number().min(0),
    });
    const { x, y } = schema.parse(req.body);
    await assertAccountOwner(req.user.id, req.params.id);
    const session = await getSession(req.user.id, req.params.id);
    if (!session) {
      res.status(404).json({ error: "No active browser session" });
      return;
    }
    await session.page.mouse.click(x, y);
    await session.page.waitForTimeout(1_000);
    res.json(await summarize(session.page));
  } catch (err) {
    next(err);
  }
});

browserSessionsRouter.post("/:id/browser-session/type", async (req, res, next) => {
  try {
    const schema = z.object({
      text: z.string(),
    });
    const { text } = schema.parse(req.body);
    await assertAccountOwner(req.user.id, req.params.id);
    const session = await getSession(req.user.id, req.params.id);
    if (!session) {
      res.status(404).json({ error: "No active browser session" });
      return;
    }
    await session.page.keyboard.type(text, { delay: 30 });
    await session.page.waitForTimeout(500);
    res.json(await summarize(session.page));
  } catch (err) {
    next(err);
  }
});

browserSessionsRouter.post("/:id/browser-session/press", async (req, res, next) => {
  try {
    const schema = z.object({
      key: z.string().min(1),
    });
    const { key: keyName } = schema.parse(req.body);
    await assertAccountOwner(req.user.id, req.params.id);
    const session = await getSession(req.user.id, req.params.id);
    if (!session) {
      res.status(404).json({ error: "No active browser session" });
      return;
    }
    await session.page.keyboard.press(keyName);
    await session.page.waitForTimeout(1_000);
    res.json(await summarize(session.page));
  } catch (err) {
    next(err);
  }
});
