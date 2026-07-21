/**
 * Open a real persistent Chromium profile for one LinkedIn account.
 *
 * This is the safer path for LinkedIn search pagination: the user logs in and
 * resolves any checkpoint in the same browser profile/proxy context that the
 * scraper later uses, instead of transplanting cookies into a fresh browser.
 *
 * Usage:
 *   pnpm --filter @linkedin-automation/browser build
 *   HEADLESS=false LINKEDIN_PERSISTENT_PROFILE=true \
 *   LINKEDIN_BROWSER_PROFILE_ROOT="$HOME/.linkedin-automation/profiles" \
 *   pnpm exec tsx scripts/local-linkedin-profile.ts <accountId> [searchUrl]
 *
 * Add --scrape to run a 2-page scrape after qualification:
 *   ... local-linkedin-profile.ts <accountId> "<searchUrl>" --scrape --leadLimit=20
 */
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { prisma } from "@linkedin-automation/db";
import { BrowserWorker, scrapeSearch } from "@linkedin-automation/browser";

function argValue(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function prompt(message: string): Promise<void> {
  if (!input.isTTY) return;
  const rl = createInterface({ input, output });
  try {
    await rl.question(message);
  } finally {
    rl.close();
  }
}

async function pageSummary(page: Awaited<ReturnType<BrowserWorker["getPage"]>>) {
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
  return { url, title, loginInputs, checkpointForms, profileLinks, nextButtons };
}

async function main() {
  const [accountId, maybeSearchUrl] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const shouldScrape = process.argv.includes("--scrape");
  const leadLimit = Number(argValue("leadLimit", "20"));
  const timezoneOverride = argValue("timezone", "Asia/Tokyo");

  if (!accountId) {
    console.error(
      "Usage: tsx scripts/local-linkedin-profile.ts <accountId> [searchUrl] [--scrape] [--leadLimit=20] [--timezone=Asia/Tokyo]"
    );
    process.exit(1);
  }

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: {
      email: true,
      status: true,
      timezone: true,
      proxy: {
        select: {
          host: true,
          port: true,
          country: true,
          city: true,
          rotationMode: true,
          healthStatus: true,
        },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        accountId,
        email: account.email,
        status: account.status,
        accountTimezone: account.timezone,
        proxy: account.proxy
          ? {
              host: account.proxy.host,
              port: account.proxy.port,
              country: account.proxy.country,
              city: account.proxy.city,
              rotationMode: account.proxy.rotationMode,
              healthStatus: account.proxy.healthStatus,
            }
          : null,
        profileRoot:
          process.env.LINKEDIN_BROWSER_PROFILE_ROOT ??
          process.env.BROWSER_PROFILE_ROOT ??
          "/tmp/linkedin-automation-browser-profiles",
      },
      null,
      2
    )
  );

  const worker = new BrowserWorker(accountId, {
    allowPaused: true,
    usePersistentProfile: true,
  });

  try {
    await worker.launch();
    const page = await worker.getPage();

    await page.goto("https://ipinfo.io/json", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const ipText = await page.locator("body").innerText({ timeout: 10_000 });
    const ip = JSON.parse(ipText) as {
      ip?: string;
      city?: string;
      region?: string;
      country?: string;
      org?: string;
      timezone?: string;
    };
    console.log("Browser exit:", {
      ip: ip.ip,
      city: ip.city,
      region: ip.region,
      country: ip.country,
      org: ip.org,
      timezone: ip.timezone,
    });

    await page.goto("https://www.linkedin.com/feed/", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForTimeout(5_000);
    console.log("Feed:", await pageSummary(page));

    await prompt(
      "If LinkedIn is asking you to sign in or resolve a checkpoint, do it in the opened browser, then press Enter here."
    );

    if (maybeSearchUrl) {
      await page.goto(maybeSearchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForTimeout(12_000);
      const searchSummary = await pageSummary(page);
      console.log("Search:", searchSummary);

      const qualified =
        !/\/(login|uas\/login|authwall|checkpoint)/.test(searchSummary.url) &&
        searchSummary.profileLinks > 0;
      console.log("Search qualified:", qualified);

      if (qualified && shouldScrape) {
        const maxPages = Math.ceil(leadLimit / 10);
        const result = await scrapeSearch(
          page,
          maybeSearchUrl,
          accountId,
          maxPages,
          "LINKEDIN",
          timezoneOverride,
          leadLimit
        );
        console.log("Scrape result:", result);
      }
    }
  } catch (err) {
    console.error("Local profile run failed:", err);
    const artifact = await worker.captureFailureArtifacts("local-linkedin-profile");
    if (artifact) console.error("Artifact:", artifact);
    process.exitCode = 1;
  } finally {
    await worker.close();
    await prisma.$disconnect();
  }
}

main();
