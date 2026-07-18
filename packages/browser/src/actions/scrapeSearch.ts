import type { Page } from "playwright";
import { prisma, LeadSource } from "@linkedin-automation/db";
import { delays, detectCheckpoint, claimDailyCap } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";
import {
  collectSearchLeads,
  type SearchLead,
  type SearchSource,
} from "./extractSearchLeads.js";

export type { SearchSource } from "./extractSearchLeads.js";

function canonicalLinkedInUrl(href: string, source: SearchSource): string {
  try {
    const url = new URL(href);
    url.search = "";
    url.hash = "";
    const normalized = url.toString().replace(/\/$/, "");
    if (source === "SALES_NAVIGATOR") return normalized;
    return normalized;
  } catch {
    return href.split("?")[0].replace(/\/$/, "");
  }
}

async function extractResultCards(
  page: Page,
  source: SearchSource
): Promise<SearchLead[]> {
  // collectSearchLeads is serialized and executed in the page context, so it
  // lives in its own module where it can also be unit-tested against captured
  // search-page DOM fixtures.
  return page.evaluate(collectSearchLeads, source);
}

function buildPageUrl(baseUrl: string, pageNum: number): string {
  if (pageNum === 1) return baseUrl;
  const url = new URL(baseUrl);
  url.searchParams.set("page", String(pageNum));
  return url.toString();
}

export async function scrapeSearch(
  page: Page,
  searchUrl: string,
  accountId: string,
  maxPages = 5,
  source: SearchSource = "LINKEDIN",
  timezoneOverride?: string,
  leadLimit?: number
): Promise<{ urls: string[]; pagesScraped: number; lastUrl: string }> {
  const allUrls: string[] = [];
  let pagesScraped = 0;
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { userId: true },
  });

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    // Claim cap one page at a time, right before it's actually fetched —
    // claiming the whole maxPages budget upfront meant a session-dead
    // account could burn its entire daily quota on a single failed
    // navigation, with nothing to show for it. Only page 1 fails hard on a
    // cap miss; later pages just stop the loop and return what's collected.
    try {
      await claimDailyCap(accountId, "searchPage", timezoneOverride);
    } catch (err) {
      if (pageNum === 1) throw err;
      break;
    }

    // A real person reads the current page before clicking to the next one —
    // requesting page N+1 the instant page N's extraction finishes is the
    // exact pattern that got this account's session killed mid-pagination.
    if (pageNum > 1) await delays.betweenPageLoads();

    const pageUrl = buildPageUrl(searchUrl, pageNum);
    await navigateTo(page, pageUrl);
    await delays.betweenPageLoads();

    // LinkedIn redirects dead sessions to a login page instead of erroring,
    // which would otherwise look like an empty search result.
    const landedUrl = page.url();
    if (/\/(login|uas\/login|authwall|checkpoint)/.test(landedUrl)) {
      throw new Error(
        `LinkedIn redirected to ${landedUrl} instead of search results — the session cookies are likely expired or invalid. Re-import fresh cookies for this account.`
      );
    }
    if (await detectCheckpoint(page)) {
      throw new Error(
        `LinkedIn showed a security checkpoint while loading search results (${landedUrl}).`
      );
    }

    // Results render client-side well after domcontentloaded — wait for an
    // actual result link before extracting, or page 1 reads as empty.
    const resultsSelector =
      source === "SALES_NAVIGATOR"
        ? "a[href*='/sales/lead/'], .artdeco-list__item a[href*='/in/']"
        : "main a[href*='/in/'], .reusable-search__result-container, div[data-chameleon-result-urn]";
    await page
      .waitForSelector(resultsSelector, { timeout: 20_000 })
      .catch(() => {
        // Genuinely empty result pages exist — extractResultCards below
        // returns [] and the caller records the page with an artifact.
      });

    const leads = await extractResultCards(page, source);

    if (leads.length === 0) break; // No results — past the last page

    for (const lead of leads) {
      await prisma.lead.upsert({
        where: {
          userId_linkedinUrl: {
            userId: account.userId,
            linkedinUrl: canonicalLinkedInUrl(lead.linkedinUrl, source),
          },
        },
        create: {
          ...lead,
          linkedinUrl: canonicalLinkedInUrl(lead.linkedinUrl, source),
          source:
            source === "SALES_NAVIGATOR"
              ? LeadSource.SALES_NAVIGATOR
              : LeadSource.LINKEDIN_SEARCH,
          accountId,
          userId: account.userId,
        },
        update: {
          title: lead.title,
          company: lead.company,
          source:
            source === "SALES_NAVIGATOR"
              ? LeadSource.SALES_NAVIGATOR
              : LeadSource.LINKEDIN_SEARCH,
        },
      });
      allUrls.push(canonicalLinkedInUrl(lead.linkedinUrl, source));
    }

    pagesScraped++;

    // Fewer than 10 results usually means the last partial page
    if (leads.length < 10) break;

    if (leadLimit && allUrls.length >= leadLimit) {
      allUrls.length = leadLimit;
      break;
    }
  }

  return { urls: allUrls, pagesScraped, lastUrl: page.url() };
}
