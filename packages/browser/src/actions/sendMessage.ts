import type { Page } from "playwright";
import { delays, humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

export async function sendMessage(
  page: Page,
  linkedinUrl: string,
  messageBody: string
): Promise<void> {
  await navigateTo(page, linkedinUrl);
  await delays.betweenActions();

  // The profile top-card "Message" control is an <a> whose href already points
  // at the composer (/messaging/compose/?recipient=<urn>&interop=msgOverlay).
  // Clicking it to pop the overlay is unreliable under automation — and doesn't
  // work at all under a Sales-Navigator session — so read that href and
  // navigate straight to the composer instead.
  const composeHref = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("main a[href*='/messaging/compose']"));
    const visible = links.find((a) => {
      const r = a.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    return (visible ?? links[0])?.getAttribute("href") ?? null;
  });
  if (composeHref) {
    const full = composeHref.startsWith("http") ? composeHref : `https://www.linkedin.com${composeHref}`;
    await page.goto(full, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await humanDelay(2_000, 4_000);
  } else {
    // Fallback: click a Message control directly (older/standard layout).
    const messageBtn = page.locator("button:has-text('Message'), a:has-text('Message')").first();
    await messageBtn.waitFor({ timeout: 10_000 });
    await messageBtn.click();
    await humanDelay(1_500, 3_000);
  }

  const messageBox = page
    .locator(
      ".msg-form__contenteditable, div[role='textbox'][contenteditable='true'], [aria-label='Write a message…'], [contenteditable='true']"
    )
    .first();
  await messageBox.waitFor({ timeout: 12_000 });
  await messageBox.click();
  await humanDelay(500, 1_000);

  // Type character-by-character for human-like input
  for (const char of messageBody) {
    await messageBox.pressSequentially(char, { delay: 30 + Math.random() * 70 });
  }

  await humanDelay(1_000, 2_000);

  const sendBtn = page
    .locator(
      "button[type='submit'].msg-form__send-btn, button.msg-form__send-button, button:has-text('Send message'), button:has-text('Send')"
    )
    .first();
  await sendBtn.click();
  await humanDelay(2_000, 3_000);
}
