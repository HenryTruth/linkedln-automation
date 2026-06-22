import type { Page } from "playwright";
import { prisma } from "@linkedin-automation/db";
import { humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

interface SearchLead {
  linkedinUrl: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
}

async function extractResultCards(page: Page): Promise<SearchLead[]> {
  return page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll(
        ".reusable-search__result-container, .entity-result"
      )
    );

    return cards
      .map((card) => {
        const anchor = card.querySelector(
          "a[href*='/in/']"
        ) as HTMLAnchorElement | null;

        if (!anchor) return null;

        // Strip query params to get the canonical profile URL
        const linkedinUrl = anchor.href.split("?")[0].replace(/\/$/, "");

        // Name is in a nested span to hide from screen readers on the outer element
        const fullName =
          card
            .querySelector(
              ".entity-result__title-text a span[aria-hidden='true']"
            )
            ?.textContent?.trim() ??
          card.querySelector(".actor-name")?.textContent?.trim() ??
          null;

        const [firstName = null, ...rest] = fullName?.split(" ") ?? [];
        const lastName = rest.join(" ") || null;

        const title =
          card
            .querySelector(".entity-result__primary-subtitle")
            ?.textContent?.trim() ?? null;

        const company =
          card
            .querySelector(".entity-result__secondary-subtitle")
            ?.textContent?.trim() ?? null;

        return { linkedinUrl, firstName, lastName, title, company };
      })
      .filter(
        (l): l is SearchLead =>
          !!l && !!l.linkedinUrl && l.linkedinUrl.includes("/in/")
      );
  });
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
  maxPages = 5
): Promise<{ urls: string[]; pagesScraped: number }> {
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

    const leads = await extractResultCards(page);

    if (leads.length === 0) break; // No results — past the last page

    for (const lead of leads) {
      await prisma.lead.upsert({
        where: {
          userId_linkedinUrl: {
            userId: account.userId,
            linkedinUrl: lead.linkedinUrl,
          },
        },
        create: { ...lead, accountId, userId: account.userId },
        update: { title: lead.title, company: lead.company },
      });
      allUrls.push(lead.linkedinUrl);
    }

    pagesScraped++;

    // Fewer than 10 results usually means the last partial page
    if (leads.length < 10) break;
  }

  return { urls: allUrls, pagesScraped };
}
