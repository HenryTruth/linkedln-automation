import type { Page } from "playwright";

// Known LinkedIn checkpoint/CAPTCHA selectors
const CHECKPOINT_SELECTORS = [
  "[data-test-id='challenge-app']",
  ".challenge-dialog",
  "#captcha-internal",
  "[id*='captcha']",
  "form[action*='/checkpoint/']",
  "h1:has-text('Let's do a quick security check')",
  "h1:has-text(\"We'll need to verify\")",
];

export async function detectCheckpoint(page: Page): Promise<boolean> {
  for (const selector of CHECKPOINT_SELECTORS) {
    try {
      const el = await page.$(selector);
      if (el) return true;
    } catch {
      // selector may not be supported — skip
    }
  }

  const url = page.url();
  // A dead/expired session is redirected to a login page rather than
  // erroring — scrapeSearch.ts learned this the hard way before this check
  // covered anything beyond /checkpoint/ and /authwall.
  if (/\/(checkpoint\/|authwall|login|uas\/login)/.test(url)) {
    return true;
  }

  return false;
}
