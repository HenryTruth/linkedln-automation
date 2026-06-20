import { prisma } from "@linkedin-automation/db";

export class ContentSignalGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentSignalGuardError";
  }
}

/** Guard B — skip if lead was already seen from any keyword in the last 30 days */
export async function checkAuthorDedup(leadId: string): Promise<void> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const existing = await prisma.postSignal.findFirst({
    where: { leadId, scrapedAt: { gte: cutoff } },
  });
  if (existing) {
    throw new ContentSignalGuardError(
      `Lead ${leadId} was already collected from keyword "${existing.keyword}" within the last 30 days`
    );
  }
}

/** Guard C — skip posts older than the campaign's dateRangeDays window */
export function checkPostFreshness(
  publishedAt: Date,
  dateRangeDays: number
): void {
  const cutoff = new Date(Date.now() - dateRangeDays * 24 * 60 * 60 * 1000);
  if (publishedAt < cutoff) {
    throw new ContentSignalGuardError(
      `Post published at ${publishedAt.toISOString()} is outside the ${dateRangeDays}-day window`
    );
  }
}

/** Guard D — connection note must reference post context */
export function validateContentSignalNote(template: string): void {
  const hasPostField =
    template.includes("{{postExcerpt}}") ||
    template.includes("{{postTopic}}") ||
    template.includes("{{postDate}}");
  if (!hasPostField) {
    throw new ContentSignalGuardError(
      "Content signal connection notes must include {{postTopic}}, {{postExcerpt}}, or {{postDate}}"
    );
  }
}

/** Guard E — same keyword cannot be used in more than one active campaign */
export async function checkKeywordUniqueness(
  keyword: string,
  excludeCampaignId?: string
): Promise<void> {
  const existing = await prisma.contentSignalConfig.findFirst({
    where: {
      keyword: { equals: keyword, mode: "insensitive" },
      campaign: { status: "ACTIVE" },
      ...(excludeCampaignId ? { campaignId: { not: excludeCampaignId } } : {}),
    },
  });
  if (existing) {
    throw new ContentSignalGuardError(
      `Keyword "${keyword}" is already used in another active content signal campaign`
    );
  }
}

/** Humanize a date into a relative string for {{postDate}} */
export function humanizePostDate(publishedAt: Date): string {
  const diffMs = Date.now() - publishedAt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "last week";
  if (diffDays < 21) return "two weeks ago";
  if (diffDays < 30) return "three weeks ago";
  return "last month";
}
