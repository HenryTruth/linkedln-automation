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
  if (url.includes("/checkpoint/") || url.includes("/authwall")) {
    return true;
  }

  return false;
}
