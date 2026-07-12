/**
 * Read-only probe of the Sales Navigator surface (/sales/lead/...) under a
 * replayed cookie session — settles the "can ONE stored session drive both the
 * regular surface and Sales Nav?" question before SEND_INMAIL is built.
 *
 * What it does: load the given /sales/lead/ URL with the account's fingerprint
 * + proxy and a chosen cookie jar, classify the render (authenticated Sales-Nav
 * lead page vs login redirect vs logged-out guest view), optionally open the
 * compose panel and dump its DOM so the sendInMail implementation can be
 * grounded in the real structure. It NEVER sends anything, never types, never
 * persists cookies back, and never writes Account/Proxy rows — the account can
 * (and should) stay PAUSED while this runs.
 *
 * Cookie-jar variants (for the AQED-vs-AQEF auth-model test):
 *   (default)              stored jar from the DB (loadCookies)
 *   --cookies <file>       raw browser-extension export JSON instead of the DB jar
 *   --li-at-from <file>    splice ONLY the li_at from another export into the jar
 *   --strip-sales          drop li_a + li_ep_auth_context from the jar
 *
 * Other flags:
 *   --open-compose         click the lead page's "Message" button and dump the
 *                          compose panel structure (no typing, no send)
 *   --ua <string>          user-agent override for this run only (DB untouched)
 *   --label <name>         artifact folder label
 *
 * Usage (rebuild the browser package first — tsx loads its dist, not source):
 *   pnpm --filter @linkedin-automation/browser build
 *   DATABASE_URL=... ENCRYPTION_KEY=... HEADLESS=false \
 *     npx tsx scripts/probe-sales-nav-session.ts <accountId> <salesLeadUrl> [flags]
 */
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@linkedin-automation/db";
import {
  loadCookies,
  getProxyForAccount,
  buildPlaywrightProxy,
  createProxySessionId,
  detectProxyIp,
} from "@linkedin-automation/browser";
import type { BrowserContext, Cookie, Page } from "playwright";

chromium.use(StealthPlugin());

const REQUIRE_PROXY = process.env.REQUIRE_PROXY !== "false";
const ARTIFACT_ROOT =
  process.env.PROBE_ARTIFACT_DIR ?? "/tmp/linkedin-automation-artifacts";

interface Args {
  accountId: string;
  salesLeadUrl: string;
  cookiesFile?: string;
  liAtFromFile?: string;
  stripSales: boolean;
  openCompose: boolean;
  ua?: string;
  label: string;
}

function parseArgs(): Args {
  const positional: string[] = [];
  const argv = process.argv.slice(2);
  const args: Partial<Args> = { stripSales: false, openCompose: false, label: "probe" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cookies") args.cookiesFile = argv[++i];
    else if (a === "--li-at-from") args.liAtFromFile = argv[++i];
    else if (a === "--strip-sales") args.stripSales = true;
    else if (a === "--open-compose") args.openCompose = true;
    else if (a === "--ua") args.ua = argv[++i];
    else if (a === "--label") args.label = argv[++i];
    else positional.push(a);
  }
  const [accountId, salesLeadUrl] = positional;
  if (!accountId || !salesLeadUrl) {
    console.error(
      "Usage: tsx probe-sales-nav-session.ts <accountId> <salesLeadUrl> " +
        "[--cookies file] [--li-at-from file] [--strip-sales] [--open-compose] [--ua string] [--label name]"
    );
    process.exit(1);
  }
  return { ...(args as Args), accountId, salesLeadUrl };
}

/** Convert a raw browser-extension cookie export to Playwright's Cookie shape. */
function convertRawExport(raw: Array<Record<string, unknown>>): Cookie[] {
  return raw.map((c) => {
    const cookie: Record<string, unknown> = {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path ?? "/",
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
    };
    if (!c.session && typeof c.expirationDate === "number") {
      cookie.expires = c.expirationDate;
    }
    const sameSite = String(c.sameSite ?? "").toLowerCase().replace(/[_\s-]/g, "");
    if (sameSite === "strict") cookie.sameSite = "Strict";
    else if (sameSite === "lax") cookie.sameSite = "Lax";
    else if (sameSite === "none" || sameSite === "norestriction") cookie.sameSite = "None";
    return cookie as unknown as Cookie;
  });
}

function auditJar(label: string, cookies: Cookie[]): void {
  const get = (name: string) => cookies.find((c) => c.name === name)?.value;
  const liAt = get("li_at");
  const liA = get("li_a");
  const liEp = get("li_ep_auth_context");
  console.log(`\n[jar audit — ${label}] ${cookies.length} cookies`);
  console.log(`  li_at: ${liAt ? `${liAt.slice(0, 6)}… (len ${liAt.length})` : "MISSING"}`);
  console.log(`  li_a (Sales Nav): ${liA ? `${liA.slice(0, 12)}… present` : "absent"}`);
  console.log(`  li_ep_auth_context: ${liEp ? "present" : "absent"}`);
  console.log(`  JSESSIONID: ${get("JSESSIONID") ? "present" : "absent"}`);
}

async function buildJar(args: Args): Promise<Cookie[]> {
  let jar: Cookie[];
  if (args.cookiesFile) {
    const raw = JSON.parse(await readFile(args.cookiesFile, "utf8"));
    jar = convertRawExport(Array.isArray(raw) ? raw : raw.cookies);
    console.log(`Loaded jar from export file ${args.cookiesFile}`);
  } else {
    const stored = await loadCookies(args.accountId);
    if (!stored?.length) throw new Error("No stored cookies for this account");
    jar = stored;
    console.log("Loaded jar from DB (stored session)");
  }

  if (args.liAtFromFile) {
    const raw = JSON.parse(await readFile(args.liAtFromFile, "utf8"));
    const other = convertRawExport(Array.isArray(raw) ? raw : raw.cookies);
    const donor = other.find((c) => c.name === "li_at");
    if (!donor) throw new Error(`No li_at in ${args.liAtFromFile}`);
    jar = jar.filter((c) => c.name !== "li_at").concat([donor]);
    console.log(`Spliced li_at (${donor.value.slice(0, 6)}…) from ${args.liAtFromFile}`);
  }

  if (args.stripSales) {
    const before = jar.length;
    jar = jar.filter((c) => c.name !== "li_a" && c.name !== "li_ep_auth_context");
    console.log(`--strip-sales: removed ${before - jar.length} Sales-Nav cookie(s)`);
  }
  return jar;
}

async function safeScreenshot(page: Page, file: string): Promise<void> {
  try {
    await page.screenshot({ path: file, timeout: 15_000 });
  } catch {
    console.log(`  (screenshot ${path.basename(file)} timed out — skipped)`);
  }
}

/** Sales Nav is a heavy SPA; wait for the initial loading spinner to clear. */
async function waitForSalesNavRender(page: Page, maxMs = 90_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const state = await page.evaluate(() => {
        const loading = document.querySelector(".initial-loading-state, .initial-load-animation");
        const textLen = (document.body?.innerText ?? "").trim().length;
        return { stillLoading: Boolean(loading), textLen };
      });
      if (!state.stillLoading && state.textLen > 50) return true;
    } catch {
      // Client-side navigation destroyed the context — keep waiting on the new page.
    }
    await page.waitForTimeout(2_000);
  }
  return false;
}

/**
 * A jar without li_a gets redirected to /sales/contract-chooser on its first
 * /sales/ visit — the page where LinkedIn mints li_a once a contract is picked.
 * Click through it (what any Sales-Nav user does on login) and report what we
 * clicked so the production flow can reuse the selector.
 */
async function handleContractChooser(page: Page): Promise<boolean> {
  console.log("\n[contract-chooser] rendering...");
  const rendered = await waitForSalesNavRender(page);
  if (!rendered) {
    console.log("[contract-chooser] never finished rendering");
    return false;
  }
  const candidates = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("a, button, [role='button']"));
    return els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => ({
        tag: el.tagName,
        text: (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
        html: el.outerHTML.replace(/\s+/g, " ").slice(0, 300),
      }))
      .filter((c) => c.text);
  });
  console.log("[contract-chooser] visible controls:");
  candidates.forEach((c) => console.log(`  <${c.tag}> "${c.text}"`));

  const pick =
    page.locator("a:visible, button:visible, [role='button']:visible", {
      hasText: /continue|select|choose|sales navigator/i,
    }).first();
  try {
    await pick.waitFor({ timeout: 5_000 });
    const pickedText = (await pick.textContent())?.trim().replace(/\s+/g, " ").slice(0, 80);
    console.log(`[contract-chooser] clicking: "${pickedText}"`);
    await pick.click();
    await page.waitForURL((u) => !u.href.includes("contract-chooser"), { timeout: 45_000 });
    console.log(`[contract-chooser] passed → ${page.url()}`);
    return true;
  } catch (err) {
    console.log(`[contract-chooser] could not click through: ${String(err).slice(0, 200)}`);
    return false;
  }
}

type RenderClass = "authenticated-sales-nav" | "login-redirect" | "guest-or-logged-out" | "unknown";

async function classifyRender(page: Page): Promise<RenderClass> {
  const url = page.url();
  if (/\/(login|uas\/login|authwall|checkpoint|sales\/login)/.test(url)) return "login-redirect";

  const probe = await page.evaluate(() => {
    const text = document.body?.innerText ?? "";
    const buttons = Array.from(document.querySelectorAll("button")).map(
      (b) => b.textContent?.trim() ?? ""
    );
    return {
      title: document.title,
      hasSignIn: /\b(Sign in|Join now|Sign in with Email)\b/.test(text),
      hasMessageButton: buttons.some((t) => t === "Message" || t.startsWith("Message")),
      hasSalesNavChrome: Boolean(
        document.querySelector("[data-sales-navigator], .global-nav__sales-nav") ||
          /Sales Navigator/i.test(document.querySelector("header, nav")?.textContent ?? "")
      ),
    };
  });
  console.log(`  title: ${probe.title}`);
  console.log(
    `  markers: signIn=${probe.hasSignIn} messageBtn=${probe.hasMessageButton} salesNavChrome=${probe.hasSalesNavChrome}`
  );
  if (probe.hasMessageButton && !probe.hasSignIn) return "authenticated-sales-nav";
  if (probe.hasSignIn) return "guest-or-logged-out";
  return "unknown";
}

async function dumpComposePanel(page: Page, artifactDir: string): Promise<void> {
  // The lead top-card "Message" button is a real <button> next to Save. The top
  // nav also has a "Messaging" link — exclude it by exact name + button role.
  // Find the button in-DOM (most reliable on this obfuscated SPA), mark it, and
  // dump its outerHTML so the production selector can be grounded.
  const marked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button")).filter((b) => {
      const t = (b.textContent ?? "").trim();
      const r = b.getBoundingClientRect();
      return t === "Message" && r.width > 0 && r.height > 0;
    });
    if (!btns.length) {
      return {
        found: false,
        allMessageish: Array.from(document.querySelectorAll("a, button"))
          .filter((el) => /message/i.test(el.textContent ?? ""))
          .map((el) => `<${el.tagName}> "${(el.textContent ?? "").trim().slice(0, 30)}"`)
          .slice(0, 10),
      };
    }
    const btn = btns[0];
    btn.setAttribute("data-probe-msg", "1");
    return { found: true, html: btn.outerHTML.replace(/\s+/g, " ").slice(0, 600) };
  });

  if (!marked.found) {
    console.log("[compose] no exact 'Message' button. message-ish controls:");
    (marked.allMessageish ?? []).forEach((s) => console.log(`  ${s}`));
    throw new Error("Message button not found on lead page");
  }
  console.log(`\n[compose] Message button:\n  ${marked.html}`);
  await page.locator("[data-probe-msg='1']").click();
  await page.waitForTimeout(4_000);

  // NB: no named `const fn = (…) => …` inside page.evaluate — tsx/esbuild's
  // keepNames wraps those in a __name() helper that isn't defined in the page.
  const dump = await page.evaluate(() => {
    const subjects = Array.from(
      document.querySelectorAll(
        "input[placeholder*='ubject'], input[aria-label*='ubject'], input[name*='subject'], input[id*='subject']"
      )
    ).map((el) => el.outerHTML.replace(/\s+/g, " ").slice(0, 600));
    const bodies = Array.from(
      document.querySelectorAll("div[contenteditable='true'], textarea, div[role='textbox']")
    ).map((el) => el.outerHTML.replace(/\s+/g, " ").slice(0, 600));
    const sendButtons = Array.from(document.querySelectorAll("button"))
      .filter((b) => /^send/i.test(b.textContent?.trim() ?? ""))
      .map((el) => el.outerHTML.replace(/\s+/g, " ").slice(0, 600));
    // Likely panel containers, for selector scoping later.
    const panelEls = Array.from(
      document.querySelectorAll(
        "[class*='compose'], [class*='message-overlay'], [class*='messaging'], [class*='msg-overlay'], section[class*='messag'], aside, [role='dialog']"
      )
    ).slice(0, 8);
    const panels = panelEls.map(
      (el) => `${el.tagName}.${(el as HTMLElement).className}`.slice(0, 250)
    );
    // Full outerHTML of the richest panel container, for grounding the build.
    let richest: Element | undefined;
    let richestLen = -1;
    for (const el of panelEls) {
      if (el.outerHTML.length > richestLen) {
        richestLen = el.outerHTML.length;
        richest = el;
      }
    }
    return { subjects, bodies, sendButtons, panels, panelHtml: richest?.outerHTML ?? "" };
  });

  if (dump.panelHtml) {
    await writeFile(path.join(artifactDir, "compose-panel.html"), dump.panelHtml);
  }

  console.log(`\n[compose] subject field candidates (${dump.subjects.length}):`);
  dump.subjects.forEach((s) => console.log(`  ${s}`));
  console.log(`[compose] body field candidates (${dump.bodies.length}):`);
  dump.bodies.forEach((s) => console.log(`  ${s}`));
  console.log(`[compose] send button candidates (${dump.sendButtons.length}) — NOT clicked:`);
  dump.sendButtons.forEach((s) => console.log(`  ${s}`));
  console.log(`[compose] panel container candidates:`);
  dump.panels.forEach((s) => console.log(`  ${s}`));

  await writeFile(
    path.join(artifactDir, "compose-dump.json"),
    JSON.stringify(dump, null, 2)
  );
}

async function main() {
  const args = parseArgs();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const artifactDir = path.join(ARTIFACT_ROOT, `${stamp}-${args.label}`);
  await mkdir(artifactDir, { recursive: true });
  console.log(`Artifacts → ${artifactDir}`);

  // The Railway Postgres proxy has frequent transient "Can't reach database
  // server" blips — retry rather than burn the run.
  const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
    let lastErr: unknown;
    for (let i = 0; i < 5; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        console.log(`  (db attempt ${i + 1} failed, retrying in 3s)`);
        await new Promise((r) => setTimeout(r, 3_000));
      }
    }
    throw lastErr;
  };

  const account = await withRetry(() =>
    prisma.account.findUniqueOrThrow({
      where: { id: args.accountId },
      select: {
        userAgent: true,
        viewportWidth: true,
        viewportHeight: true,
        timezone: true,
        status: true,
      },
    })
  );
  console.log(`Account status: ${account.status} (read-only probe; not changing it)`);

  const jar = await buildJar(args);
  auditJar("as launched", jar);

  const proxy = await withRetry(() => getProxyForAccount(args.accountId));
  if (!proxy && REQUIRE_PROXY) throw new Error("No proxy attached (set REQUIRE_PROXY=false to skip)");
  const proxySessionId =
    proxy?.rotationMode === "STICKY_SESSION" ? createProxySessionId() : undefined;
  if (proxy) {
    const exitIp = await detectProxyIp(proxy, proxySessionId);
    console.log(`Proxy exit IP: ${exitIp ?? "(probe failed — continuing)"}`);
  }

  const browser = await chromium.launch({
    headless: process.env.HEADLESS === "true",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({
      proxy: proxy ? buildPlaywrightProxy(proxy, proxySessionId) : undefined,
      userAgent:
        args.ua ??
        account.userAgent ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      viewport: { width: account.viewportWidth, height: account.viewportHeight },
      locale: "en-US",
      timezoneId: account.timezone,
      extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
    });
    await context.tracing.start({ screenshots: true, snapshots: true });
    await context.addCookies(jar);
    const page = await context.newPage();

    console.log(`\nLoading ${args.salesLeadUrl} ...`);
    await page.goto(args.salesLeadUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    console.log(`Landed on: ${page.url()}`);

    // The chooser redirect can happen server-side (immediate) or client-side
    // (after hydration) — settle, handle it, and re-settle, up to 3 hops.
    let rendered = false;
    for (let hop = 0; hop < 3; hop++) {
      rendered = await waitForSalesNavRender(page);
      console.log(`SPA render settled: ${rendered} (now on ${page.url()})`);
      if (!page.url().includes("/sales/contract-chooser")) break;
      await safeScreenshot(page, path.join(artifactDir, `00-contract-chooser-${hop}.png`));
      const passed = await handleContractChooser(page);
      await safeScreenshot(page, path.join(artifactDir, `00b-after-chooser-${hop}.png`));
      if (!passed) break;
      if (!page.url().includes("/sales/lead/")) {
        console.log("Re-navigating to the lead URL...");
        await page.goto(args.salesLeadUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        console.log(`Landed on: ${page.url()}`);
      }
    }
    const renderClass = await classifyRender(page);
    console.log(`\nRESULT — render classification: ${renderClass}`);
    await safeScreenshot(page, path.join(artifactDir, "01-lead-page.png"));

    // Did LinkedIn mint/refresh Sales-Nav cookies during the load? (Interesting
    // for the strip-sales / AQED variants: tells us whether the surface
    // re-derives li_a from li_at or hard-requires it up front.)
    const after = await context.cookies();
    auditJar("after page load", after as Cookie[]);

    if (args.openCompose) {
      if (renderClass === "authenticated-sales-nav") {
        await dumpComposePanel(page, artifactDir);
        await safeScreenshot(page, path.join(artifactDir, "02-compose-open.png"));
      } else {
        console.log("Skipping --open-compose: page is not an authenticated Sales-Nav render.");
      }
    }
  } catch (err) {
    console.error("PROBE FAILED:", err);
    process.exitCode = 1;
  } finally {
    try {
      await context?.tracing.stop({ path: path.join(artifactDir, "trace.zip") });
    } catch {
      // trace is best-effort
    }
    // Deliberately NO saveCookies() here — this probe must never overwrite the
    // stored session, and its variant jars must never leak into the DB.
    await browser.close();
    await prisma.$disconnect();
  }
}

main();
