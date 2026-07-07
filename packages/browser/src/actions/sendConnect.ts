import type { Page } from "playwright";
import { delays, humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

export async function sendConnect(
  page: Page,
  linkedinUrl: string,
  note?: string
): Promise<void> {
  await navigateTo(page, linkedinUrl);
  await delays.betweenActions();

  // A dead/expired session redirects to a login page instead of erroring,
  // which would otherwise surface as a confusing "Connect button not found"
  // — same lesson scrapeSearch.ts already learned.
  const landedUrl = page.url();
  if (/\/(login|uas\/login|authwall|checkpoint)/.test(landedUrl)) {
    throw new Error(
      `LinkedIn redirected to ${landedUrl} instead of the profile page — the session cookies are likely expired or invalid. Re-import fresh cookies for this account.`
    );
  }

  // "Connect" is either a direct top-level button, or tucked inside the
  // "More" overflow menu — which one LinkedIn shows varies per profile.
  let connectBtn = page
    .locator("button:has-text('Connect'), button[aria-label*='Connect']")
    .first();
  const directlyVisible = await connectBtn.isVisible().catch(() => false);
  if (!directlyVisible) {
    const moreBtn = page
      .locator("button:has-text('More'), button[aria-label='More actions']")
      .first();
    await moreBtn.waitFor({ timeout: 10_000 });
    await moreBtn.click();
    await humanDelay(500, 1_000);
    connectBtn = page
      .locator(
        "div.artdeco-dropdown__item:has-text('Connect'), [role='button']:has-text('Connect'), button:has-text('Connect')"
      )
      .first();
  }
  await connectBtn.waitFor({ timeout: 10_000 });
  await connectBtn.click();
  await humanDelay(1_500, 3_000);

  if (note) {
    // Click "Add a note"
    const addNoteBtn = page.locator("button:has-text('Add a note')");
    const hasNoteBtn = await addNoteBtn.count();
    if (hasNoteBtn > 0) {
      await addNoteBtn.click();
      await humanDelay(1_000, 2_000);
      await page.locator("#custom-message").fill(note);
      await humanDelay(1_000, 2_000);
    }
  }

  // Send
  const sendBtn = page.locator("button:has-text('Send'), button:has-text('Send without a note')").first();
  await sendBtn.click();
  await humanDelay(2_000, 4_000);
}
