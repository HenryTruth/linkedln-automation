import type { Page } from "playwright";
import { prisma } from "@linkedin-automation/db";
import {
  humanDelay,
  checkAuthorDedup,
  checkPostFreshness,
  humanizePostDate,
  ContentSignalGuardError,
} from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

// Guard A: max 3 content search pages per session
const MAX_PAGES_PER_SESSION = 3;

interface PostCard {
  authorUrl: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
  postUrl: string;
  excerpt: string;
  publishedAt: Date;
}

async function extractPostCards(page: Page, keyword: string): Promise<PostCard[]> {
  const raw = await page.evaluate(() => {
    const feed = Array.from(
      document.querySelectorAll(
        ".feed-shared-update-v2, .occludable-update, [data-urn]"
      )
    );

    return feed.map((card) => {
      // Author profile link
      const authorAnchor = card.querySelector(
        "a[href*='/in/']"
      ) as HTMLAnchorElement | null;
      const authorUrl = authorAnchor?.href?.split("?")[0].replace(/\/$/, "") ?? "";

      // Author name
      const fullName =
        card.querySelector(".update-components-actor__name span[aria-hidden='true']")
          ?.textContent?.trim() ??
        card.querySelector(".feed-shared-actor__name")?.textContent?.trim() ??
        null;
      const [firstName = null, ...rest] = fullName?.split(" ") ?? [];
      const lastName = rest.join(" ") || null;

      // Title and company from actor description
      const description =
        card.querySelector(".update-components-actor__description")
          ?.textContent?.trim() ??
        card.querySelector(".feed-shared-actor__description")?.textContent?.trim() ??
        "";
      const [title = null, company = null] = description.split(" at ").map((s: string) => s.trim() || null);

      // Post body — take first 300 chars
      const bodyEl =
        card.querySelector(".feed-shared-update-v2__description") ??
        card.querySelector(".feed-shared-text") ??
        card.querySelector(".update-components-text");
      const excerpt = (bodyEl?.textContent?.trim() ?? "").slice(0, 300);

      // Permalink — timestamp link
      const permalinkAnchor = card.querySelector(
        "a[href*='/activity/'], a[href*='/posts/']"
      ) as HTMLAnchorElement | null;
      const postUrl = permalinkAnchor?.href?.split("?")[0] ?? "";

      // Published date — from time element or aria-label
      const timeEl = card.querySelector("time, .feed-shared-actor__sub-description");
      const dateText = timeEl?.getAttribute("datetime") ?? timeEl?.textContent?.trim() ?? "";

      return { authorUrl, firstName, lastName, title, company, excerpt, postUrl, dateText };
    });
  });

  const now = Date.now();
  const results: PostCard[] = [];

  for (const r of raw) {
    if (!r.authorUrl.includes("/in/") || !r.postUrl || !r.excerpt) continue;

    // Parse date — LinkedIn shows relative strings like "3d", "1w", "2h"
    let publishedAt = new Date(r.dateText);
    if (isNaN(publishedAt.getTime())) {
      // Parse relative format
      const relMatch = r.dateText.match(/^(\d+)\s*(s|m|h|d|w|mo)$/i);
      if (relMatch) {
        const n = parseInt(relMatch[1]);
        const unit = relMatch[2].toLowerCase();
        const ms: Record<string, number> = {
          s: 1000, m: 60_000, h: 3_600_000,
          d: 86_400_000, w: 604_800_000, mo: 2_592_000_000,
        };
        publishedAt = new Date(now - n * (ms[unit] ?? 86_400_000));
      } else {
        // Default to now if unparseable — Guard C will pass
        publishedAt = new Date();
      }
    }

    results.push({
      authorUrl: r.authorUrl,
      firstName: r.firstName,
      lastName: r.lastName,
      title: r.title,
      company: r.company,
      postUrl: r.postUrl,
      excerpt: r.excerpt,
      publishedAt,
    });
  }

  return results;
}

function buildContentSearchUrl(keyword: string, page = 1, geoUrn?: string | null): string {
  const base = "https://www.linkedin.com/search/results/content/";
  const params = new URLSearchParams({
    keywords: keyword,
    datePosted: "past-week",
    ...(geoUrn ? { geoUrn: JSON.stringify([geoUrn]) } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  });
  return `${base}?${params}`;
}

export interface CollectedLead {
  leadId: string;
  linkedinUrl: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  postSignalId: string;
  postExcerpt: string;
  postTopic: string;
  postDate: string;
}

export async function scrapeContentSearch(
  page: Page,
  accountId: string,
  campaignId: string,
  keyword: string,
  dateRangeDays: number,
  maxLeads: number,
  titleFilter?: string | null,
  companyFilter?: string | null,
  locationFilter?: string | null
): Promise<{ collected: number; skipped: number; newLeads: CollectedLead[] }> {
  let collected = 0;
  let skipped = 0;
  const newLeads: CollectedLead[] = [];
  const seenPostUrls = new Set<string>();
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { userId: true },
  });

  // Guard A: max 3 pages per session
  const pagesToScrape = Math.min(MAX_PAGES_PER_SESSION, Math.ceil(maxLeads / 10));

  for (let pageNum = 1; pageNum <= pagesToScrape && collected < maxLeads; pageNum++) {
    const url = buildContentSearchUrl(keyword, pageNum, locationFilter);
    await navigateTo(page, url);
    await humanDelay(4_000, 8_000);

    const cards = await extractPostCards(page, keyword);
    if (cards.length === 0) break;

    for (const card of cards) {
      if (collected >= maxLeads) break;

      // Guard F — post URL unique key
      if (seenPostUrls.has(card.postUrl)) { skipped++; continue; }
      seenPostUrls.add(card.postUrl);

      // Check if post_url already stored
      const existingSignal = await prisma.postSignal.findUnique({
        where: { postUrl: card.postUrl },
      });
      if (existingSignal) { skipped++; continue; }

      // Guard C — post freshness
      try {
        checkPostFreshness(card.publishedAt, dateRangeDays);
      } catch (e) {
        if (e instanceof ContentSignalGuardError) { skipped++; continue; }
        throw e;
      }

      // Optional title/company filter
      if (titleFilter && !card.title?.toLowerCase().includes(titleFilter.toLowerCase())) {
        skipped++; continue;
      }
      if (companyFilter && !card.company?.toLowerCase().includes(companyFilter.toLowerCase())) {
        skipped++; continue;
      }

      // Upsert lead
      const lead = await prisma.lead.upsert({
        where: {
          userId_linkedinUrl: {
            userId: account.userId,
            linkedinUrl: card.authorUrl,
          },
        },
        create: {
          linkedinUrl: card.authorUrl,
          userId: account.userId,
          firstName: card.firstName,
          lastName: card.lastName,
          title: card.title,
          company: card.company,
          accountId,
        },
        update: {
          firstName: card.firstName ?? undefined,
          lastName: card.lastName ?? undefined,
          title: card.title ?? undefined,
          company: card.company ?? undefined,
        },
      });

      // Guard B — 30-day dedup per author
      try {
        await checkAuthorDedup(lead.id);
      } catch (e) {
        if (e instanceof ContentSignalGuardError) { skipped++; continue; }
        throw e;
      }

      if (lead.blacklisted) { skipped++; continue; }

      // Save post signal (Guard F ensures postUrl is unique)
      const postSignal = await prisma.postSignal.create({
        data: {
          leadId: lead.id,
          campaignId,
          postUrl: card.postUrl,
          excerpt: card.excerpt,
          keyword,
          publishedAt: card.publishedAt,
        },
      });

      // Add lead to campaign with post signal linked
      await prisma.campaignLead.upsert({
        where: { campaignId_leadId: { campaignId, leadId: lead.id } },
        create: { campaignId, leadId: lead.id, postSignalId: postSignal.id },
        update: {},
      });

      newLeads.push({
        leadId: lead.id,
        linkedinUrl: lead.linkedinUrl,
        firstName: lead.firstName ?? null,
        lastName: lead.lastName ?? null,
        company: lead.company ?? null,
        postSignalId: postSignal.id,
        postExcerpt: card.excerpt,
        postTopic: keyword,
        postDate: humanizePostDate(card.publishedAt),
      });

      collected++;
      await humanDelay(500, 1_500);
    }

    // Guard A: mandatory delay between pages
    if (pageNum < pagesToScrape) {
      await humanDelay(8_000, 15_000);
    }
  }

  // Update lastScrapedAt on config
  await prisma.contentSignalConfig.updateMany({
    where: { campaignId },
    data: { lastScrapedAt: new Date() },
  });

  return { collected, skipped, newLeads };
}
