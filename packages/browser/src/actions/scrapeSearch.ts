import type { Page } from "playwright";
import { prisma, LeadSource } from "@linkedin-automation/db";
import { humanDelay, detectCheckpoint } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

interface SearchLead {
  linkedinUrl: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
}

export type SearchSource = "LINKEDIN" | "SALES_NAVIGATOR";

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
  return page.evaluate((searchSource) => {
    let cards = Array.from(
      document.querySelectorAll(
        searchSource === "SALES_NAVIGATOR"
          ? "li, .artdeco-list__item"
          : ".reusable-search__result-container, .entity-result, div[data-chameleon-result-urn]"
      )
    );

    // LinkedIn periodically ships search results with obfuscated class names.
    // Fall back to finding profile links inside the main results area and
    // treating each enclosing list item as a result card.
    if (cards.length === 0 && searchSource === "LINKEDIN") {
      const root = document.querySelector("main") ?? document;
      const items = new Set<Element>();
      for (const a of Array.from(root.querySelectorAll("a[href*='/in/']"))) {
        const item = a.closest("li");
        if (item) items.add(item);
      }
      cards = Array.from(items);
    }

    return cards
      .map((card) => {
        const anchor = card.querySelector(
          searchSource === "SALES_NAVIGATOR"
            ? "a[href*='/sales/lead/'], a[href*='/in/']"
            : "a[href*='/in/']"
        ) as HTMLAnchorElement | null;

        if (!anchor) return null;

        const href = anchor.href;
        const linkedinUrl = (() => {
          try {
            const url = new URL(href);
            url.search = "";
            url.hash = "";
            return url.toString().replace(/\/$/, "");
          } catch {
            return href.split("?")[0].replace(/\/$/, "");
          }
        })();

        const fullName =
          card
            .querySelector(
              ".entity-result__title-text a span[aria-hidden='true']"
            )
            ?.textContent?.trim() ??
          card
            .querySelector("[data-anonymize='person-name']")
            ?.textContent?.trim() ??
          anchor.querySelector("span[aria-hidden='true']")?.textContent?.trim() ??
          anchor.textContent?.trim().replace(/\s+/g, " ") ??
          card.querySelector(".actor-name")?.textContent?.trim() ??
          null;

        const [firstName = null, ...rest] = fullName?.split(" ") ?? [];
        const lastName = rest.join(" ") || null;

        const title =
          card
            .querySelector(".entity-result__primary-subtitle")
            ?.textContent?.trim() ??
          card.querySelector("[data-anonymize='title']")?.textContent?.trim() ??
          card.querySelector("div.t-14.t-black.t-normal")?.textContent?.trim() ??
          null;

        const company =
          card
            .querySelector(".entity-result__secondary-subtitle")
            ?.textContent?.trim() ??
          card.querySelector("[data-anonymize='company-name']")?.textContent?.trim() ??
          null;

        return { linkedinUrl, firstName, lastName, title, company };
      })
      .filter(
        (l): l is SearchLead =>
          !!l &&
          !!l.linkedinUrl &&
          (l.linkedinUrl.includes("/in/") || l.linkedinUrl.includes("/sales/lead/"))
      );
  }, source);
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
  source: SearchSource = "LINKEDIN"
): Promise<{ urls: string[]; pagesScraped: number; lastUrl: string }> {
  const allUrls: string[] = [];
  let pagesScraped = 0;
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { userId: true },
  });

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const pageUrl = buildPageUrl(searchUrl, pageNum);
    await navigateTo(page, pageUrl);
    await humanDelay(3_000, 6_000);

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
  }

  return { urls: allUrls, pagesScraped, lastUrl: page.url() };
}
