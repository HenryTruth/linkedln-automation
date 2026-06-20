import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { prisma, AccountStatus, type Proxy } from "@linkedin-automation/db";
import { detectCheckpoint, sendAlert, IpMismatchError } from "@linkedin-automation/guards";
import { saveCookies, loadCookies } from "./session.js";
import {
  getProxyForAccount,
  buildPlaywrightProxy,
  detectProxyIp,
  createProxySessionId,
} from "./proxy.js";
import type { Browser, BrowserContext, Page } from "playwright";

chromium.use(StealthPlugin());

function randomSessionMaxMs(): number {
  return Math.floor(Math.random() * (90 - 60 + 1) + 60) * 60_000;
}

// How often (in getPage() calls) to re-verify the proxy exit IP mid-session.
const IP_CHECK_INTERVAL = 10;

export class BrowserWorker {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private accountId: string;
  private sessionStart: number = 0;
  private sessionMaxMs: number = randomSessionMaxMs();
  private proxy: Proxy | null = null;
  private proxyIp: string | null = null;
  private proxySessionId: string | null = null;
  private ipCheckCounter = 0;

  constructor(accountId: string) {
    this.accountId = accountId;
  }

  async launch(): Promise<void> {
    // Guard 3: headless mode is not safe in production — LinkedIn detects it.
    // Always use HEADLESS=false with a virtual display (Xvfb) in production.
    if (process.env.NODE_ENV === "production" && process.env.HEADLESS === "true") {
      throw new Error(
        "HEADLESS=true is not allowed in production. Run the browser with Xvfb and set HEADLESS=false."
      );
    }

    const account = await prisma.account.findUniqueOrThrow({
      where: { id: this.accountId },
      select: {
        userAgent: true,
        viewportWidth: true,
        viewportHeight: true,
        timezone: true,
        status: true,
      },
    });

    if (account.status === AccountStatus.PAUSED) {
      throw new Error(`Account ${this.accountId} is paused`);
    }

    const proxy = await getProxyForAccount(this.accountId);
    if (proxy) {
      const proxySessionId =
        proxy.rotationMode === "STICKY_SESSION" ? createProxySessionId() : null;
      const healthy = await import("./proxy.js").then((m) =>
        m.checkProxyHealth(proxy, proxySessionId ?? undefined)
      );
      if (!healthy) throw new Error(`Proxy for account ${this.accountId} is unhealthy`);

      // Guard 10: capture the proxy exit IP at session start so we can detect
      // mid-session rotation (residential proxies occasionally rotate unexpectedly).
      this.proxy = proxy;
      this.proxySessionId = proxySessionId;
      this.proxyIp = await detectProxyIp(proxy, proxySessionId ?? undefined);
      await prisma.proxy.update({
        where: { id: proxy.id },
        data: {
          currentSessionId: proxySessionId,
          currentExitIp: this.proxyIp,
          lastSessionStartedAt: new Date(),
          lastUsed: new Date(),
        },
      });
    }

    this.browser = await chromium.launch({
      headless: process.env.HEADLESS === "true",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });

    this.context = await this.browser.newContext({
      proxy: proxy
        ? buildPlaywrightProxy(proxy, this.proxySessionId ?? undefined)
        : undefined,
      userAgent:
        account.userAgent ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      viewport: {
        width: account.viewportWidth,
        height: account.viewportHeight,
      },
      locale: "en-US",
      timezoneId: account.timezone,
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });

    const cookies = await loadCookies(this.accountId);
    if (cookies?.length) {
      await this.context.addCookies(cookies);
    }

    this.page = await this.context.newPage();
    this.sessionStart = Date.now();
  }

  async getPage(): Promise<Page> {
    if (!this.page) throw new Error("Worker not launched");

    // Enforce session duration limit
    const elapsed = Date.now() - this.sessionStart;
    if (elapsed > this.sessionMaxMs) {
      throw new Error("Session duration limit reached — restart required");
    }

    const checkpoint = await detectCheckpoint(this.page);
    if (checkpoint) {
      await this.handleCheckpoint();
      throw new Error(`Checkpoint detected on account ${this.accountId}`);
    }

    // Guard 10: verify proxy exit IP hasn't changed mid-session.
    // Checked every IP_CHECK_INTERVAL calls to avoid excessive network overhead.
    if (this.proxy && this.proxyIp) {
      this.ipCheckCounter++;
      if (this.ipCheckCounter % IP_CHECK_INTERVAL === 0) {
        await this.checkIpConsistency();
      }
    }

    return this.page;
  }

  private async checkIpConsistency(): Promise<void> {
    if (!this.proxy || !this.proxyIp) return;
    const currentIp = await detectProxyIp(
      this.proxy,
      this.proxySessionId ?? undefined
    );
    if (currentIp && currentIp !== this.proxyIp) {
      await this.handleIpMismatch(this.proxyIp, currentIp);
      throw new IpMismatchError(this.proxyIp, currentIp);
    }
  }

  private async handleIpMismatch(expected: string, actual: string): Promise<void> {
    await prisma.account.update({
      where: { id: this.accountId },
      data: { status: AccountStatus.PAUSED },
    });
    await sendAlert(
      `Proxy IP mismatch — account ${this.accountId} paused`,
      `Expected exit IP: ${expected}\nActual exit IP: ${actual}\n\n` +
        `The proxy appears to have rotated mid-session. The session has been killed and ` +
        `the account paused to prevent LinkedIn from seeing a sudden location change.\n\n` +
        `Action required: verify your proxy configuration, then re-activate the account:\n` +
        `  PATCH /accounts/${this.accountId}  { "status": "ACTIVE" }`
    );
  }

  private async handleCheckpoint(): Promise<void> {
    await prisma.account.update({
      where: { id: this.accountId },
      data: { status: AccountStatus.PAUSED },
    });

    await prisma.checkpoint.create({
      data: { accountId: this.accountId },
    });

    await sendAlert(
      `Checkpoint detected — account ${this.accountId} paused`,
      `LinkedIn showed a security check or CAPTCHA for account ${this.accountId}.\n` +
        `The account has been paused automatically.\n\n` +
        `Action required: resolve the checkpoint manually on LinkedIn, then re-activate the account via the API:\n` +
        `  PATCH /accounts/${this.accountId}  { "status": "ACTIVE" }`
    );
  }

  async close(): Promise<void> {
    if (this.context && this.page) {
      try {
        const cookies = await this.context.cookies();
        await saveCookies(this.accountId, cookies);
      } catch {
        // Don't throw on cookie save failure during close
      }
    }
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
