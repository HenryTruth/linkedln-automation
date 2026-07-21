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
type BrowserSummary = Awaited<ReturnType<typeof summarize>>;

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

function normalizeSearchUrlForQualification(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.searchParams.delete("page");
  url.searchParams.sort();
  return url.toString();
}

function detectSearchSource(value: string): "LINKEDIN" | "SALES_NAVIGATOR" {
  const url = new URL(value);
  if (
    url.pathname.startsWith("/sales/search/people") ||
    url.pathname.startsWith("/sales/lists/people") ||
    url.pathname.startsWith("/sales/lead/")
  ) {
    return "SALES_NAVIGATOR";
  }
  return "LINKEDIN";
}

async function persistBrowserSummary(accountId: string, summary: BrowserSummary): Promise<void> {
  const checkpoint = summary.checkpointForms > 0 || /\/(authwall|checkpoint)/.test(summary.url);
  const login = summary.loginInputs > 0 || /\/(login|uas\/login)/.test(summary.url);
  const status = checkpoint ? "CHECKPOINT" : login ? "LOGIN_REQUIRED" : summary.authenticated ? "AUTHENTICATED" : "UNKNOWN";
  const error = checkpoint
    ? "LinkedIn checkpoint or auth wall is visible in the hosted browser."
    : login
    ? "LinkedIn login is visible in the hosted browser."
    : null;

  await prisma.account.update({
    where: { id: accountId },
    data: {
      browserProfileStatus: status,
      browserProfileLastCheckedAt: new Date(),
      browserProfileLastCheckError: error,
    },
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
    .locator('main a[href*="/in/"], a[href*="/sales/lead/"]')
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

    const summary = await summarize(page);
    await persistBrowserSummary(accountId, summary);
    res.json(summary);
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
    const summary = await summarize(session.page);
    await persistBrowserSummary(req.params.id, summary);
    res.json(summary);
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
    const summary = await summarize(session.page);
    await persistBrowserSummary(req.params.id, summary);
    res.json(summary);
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
    const summary = await summarize(session.page);
    await persistBrowserSummary(req.params.id, summary);
    res.json(summary);
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
    const summary = await summarize(session.page);
    await persistBrowserSummary(req.params.id, summary);
    res.json(summary);
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
    const summary = await summarize(session.page);
    await persistBrowserSummary(req.params.id, summary);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

browserSessionsRouter.post("/:id/browser-session/qualify-search", async (req, res, next) => {
  try {
    const schema = z.object({ searchUrl: z.string().url() });
    const { searchUrl } = schema.parse(req.body);
    await assertAccountOwner(req.user.id, req.params.id);
    const session = await getSession(req.user.id, req.params.id);
    if (!session) {
      res.status(404).json({ error: "No active browser session" });
      return;
    }

    await session.page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await session.page
      .waitForSelector("main a[href*='/in/'], a[href*='/sales/lead/']", { timeout: 20_000 })
      .catch(() => {});
    await session.page.waitForTimeout(2_000);
    const summary = await summarize(session.page);
    await persistBrowserSummary(req.params.id, summary);

    if (!summary.authenticated) {
      const message =
        summary.checkpointForms > 0
          ? "LinkedIn is showing a checkpoint in the hosted browser. Resolve it before qualifying searches."
          : "LinkedIn is showing a login/auth page in the hosted browser. Log in before qualifying searches.";
      await prisma.account.update({
        where: { id: req.params.id },
        data: {
          lastSearchQualificationError: message,
          lastSearchQualifiedAt: null,
          lastSearchQualifiedUrl: null,
          lastSearchQualifiedSource: null,
          lastSearchQualifiedProfileLinks: null,
          lastSearchQualifiedNextButtons: null,
        },
      });
      res.status(422).json({ error: message, summary });
      return;
    }

    if (!summary.searchQualified) {
      const message =
        "This URL did not render LinkedIn profile results in the hosted browser. Open a people-search page with visible results, then qualify again.";
      await prisma.account.update({
        where: { id: req.params.id },
        data: {
          lastSearchQualificationError: message,
          lastSearchQualifiedAt: null,
          lastSearchQualifiedUrl: null,
          lastSearchQualifiedSource: null,
          lastSearchQualifiedProfileLinks: summary.profileLinks,
          lastSearchQualifiedNextButtons: summary.nextButtons,
        },
      });
      res.status(422).json({ error: message, summary });
      return;
    }

    await prisma.account.update({
      where: { id: req.params.id },
      data: {
        lastSearchQualifiedAt: new Date(),
        lastSearchQualifiedUrl: normalizeSearchUrlForQualification(searchUrl),
        lastSearchQualifiedSource: detectSearchSource(searchUrl),
        lastSearchQualifiedProfileLinks: summary.profileLinks,
        lastSearchQualifiedNextButtons: summary.nextButtons,
        lastSearchQualificationError: null,
      },
    });

    res.json({
      ...summary,
      normalizedSearchUrl: normalizeSearchUrlForQualification(searchUrl),
      source: detectSearchSource(searchUrl),
    });
  } catch (err) {
    next(err);
  }
});
