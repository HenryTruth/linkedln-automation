import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma, AccountStatus, type Proxy } from "@linkedin-automation/db";
import {
  detectCheckpoint,
  sendAlert,
  IpMismatchError,
  MissingProxyError,
} from "@linkedin-automation/guards";
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
const ARTIFACT_DIR =
  process.env.BROWSER_ARTIFACT_DIR ?? "/tmp/linkedin-automation-artifacts";
const REQUIRE_PROXY = process.env.REQUIRE_PROXY !== "false";
const DEFAULT_PROFILE_ROOT =
  process.env.LINKEDIN_BROWSER_PROFILE_ROOT ??
  process.env.BROWSER_PROFILE_ROOT ??
  "/tmp/linkedin-automation-browser-profiles";

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

export interface BrowserWorkerOptions {
  allowPaused?: boolean;
  profileRoot?: string;
  usePersistentProfile?: boolean;
}

export class BrowserWorker {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private accountId: string;
  private options: BrowserWorkerOptions;
  private persistentContext = false;
  private sessionStart: number = 0;
  private sessionMaxMs: number = randomSessionMaxMs();
  private proxy: Proxy | null = null;
  private proxyIp: string | null = null;
  private proxySessionId: string | null = null;
  private ipCheckCounter = 0;

  constructor(accountId: string, options: BrowserWorkerOptions = {}) {
    this.accountId = accountId;
    this.options = options;
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

    if (account.status === AccountStatus.PAUSED && !this.options.allowPaused) {
      throw new Error(`Account ${this.accountId} is paused`);
    }

    const proxy = await getProxyForAccount(this.accountId);
    if (!proxy && REQUIRE_PROXY) {
      throw new MissingProxyError(this.accountId);
    }

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

    const launchOptions = {
      headless: process.env.HEADLESS === "true",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
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
    };

    this.persistentContext =
      this.options.usePersistentProfile ??
      process.env.LINKEDIN_PERSISTENT_PROFILE === "true";

    if (this.persistentContext) {
      const root = this.options.profileRoot ?? DEFAULT_PROFILE_ROOT;
      const userDataDir = path.join(root, safeName(this.accountId));
      await mkdir(userDataDir, { recursive: true });
      this.context = await chromium.launchPersistentContext(
        userDataDir,
        launchOptions
      );
      this.browser = this.context.browser();
    } else {
      this.browser = await chromium.launch({
        headless: launchOptions.headless,
        args: launchOptions.args,
      });

      this.context = await this.browser.newContext({
        proxy: launchOptions.proxy,
        userAgent: launchOptions.userAgent,
        viewport: launchOptions.viewport,
        locale: launchOptions.locale,
        timezoneId: launchOptions.timezoneId,
        extraHTTPHeaders: launchOptions.extraHTTPHeaders,
      });
    }
    await this.context.tracing.start({ screenshots: true, snapshots: true });

    const shouldLoadStoredCookies =
      !this.persistentContext || process.env.LINKEDIN_SEED_PROFILE_COOKIES === "true";
    if (shouldLoadStoredCookies) {
      const cookies = await loadCookies(this.accountId);
      if (cookies?.length) {
        await this.context.addCookies(cookies);
      }
    }

    this.page = this.context.pages()[0] ?? (await this.context.newPage());
    this.sessionStart = Date.now();
  }

  async captureFailureArtifacts(label: string): Promise<string | null> {
    if (!this.context) return null;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseName = safeName(`${stamp}-${this.accountId}-${label}`);
    await mkdir(ARTIFACT_DIR, { recursive: true });
    const screenshotPath = path.join(ARTIFACT_DIR, `${baseName}.png`);
    const tracePath = path.join(ARTIFACT_DIR, `${baseName}.zip`);

    try {
      await this.page?.screenshot({ path: screenshotPath, fullPage: true });
    } catch {
      // Screenshot is best-effort; trace capture below is still useful.
    }

    try {
      await this.context.tracing.stop({ path: tracePath });
    } catch {
      return screenshotPath;
    }

    return tracePath;
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
        // Only persist cookies from a session that still looks logged in.
        // A run that ended on a login/authwall/checkpoint page, or that lost
        // its auth token (li_at), would otherwise overwrite the last known-good
        // stored session with a dead one — turning one bad run into a permanent
        // logout that needs a manual cookie re-import.
        const url = this.page.url();
        const loggedOutUrl = /\/(login|uas\/login|authwall|checkpoint)/.test(url);
        const liAt = cookies.find((c) => c.name === "li_at")?.value ?? "";
        if (!loggedOutUrl && liAt) {
          await saveCookies(this.accountId, cookies);
        }
      } catch {
        // Don't throw on cookie save failure during close
      }
    }
    if (this.context) {
      await this.context.close().catch(() => {});
    }
    if (!this.persistentContext) {
      await this.browser?.close().catch(() => {});
    }
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}
