// Shared between campaigns.ts's campaign-scoped search-URL scraping and
// leads.ts's campaign-less version — both queue the same searchScrape job
// against an account and need the same readiness/qualification checks.

export const SEARCH_QUALIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const REQUIRE_SEARCH_QUALIFICATION =
  process.env.LINKEDIN_REQUIRE_SEARCH_QUALIFICATION !== "false";

export function isSalesNavigatorUrl(value: string): boolean {
  const url = new URL(value);
  return (
    url.hostname.endsWith("linkedin.com") &&
    (url.pathname.startsWith("/sales/search/people") ||
      url.pathname.startsWith("/sales/lists/people") ||
      url.pathname.startsWith("/sales/lead/"))
  );
}

export type ScrapeReadyAccount = {
  id: string;
  status: string;
  cookiesEncrypted: string | null;
  browserProfileStatus?: string | null;
  proxyId: string | null;
  salesNavigatorEnabled?: boolean;
};

export function assertAccountReadyForScraping(account: ScrapeReadyAccount): string | null {
  if (account.status !== "ACTIVE") {
    return "Account is paused or restricted. Resume the account before scraping.";
  }
  if (!account.proxyId) {
    return "Proxy required. Assign a matching residential proxy to this account before scraping.";
  }
  if (!account.cookiesEncrypted && account.browserProfileStatus !== "AUTHENTICATED") {
    return "LinkedIn session required. Connect the hosted browser profile or refresh this account's LinkedIn session before scraping.";
  }
  return null;
}

export function normalizeSearchUrlForQualification(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.searchParams.delete("page");
  url.searchParams.sort();
  return url.toString();
}
