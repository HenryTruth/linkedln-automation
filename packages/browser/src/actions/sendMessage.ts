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

  const messageBtn = page.locator("button:has-text('Message'), a:has-text('Message')").first();
  await messageBtn.waitFor({ timeout: 10_000 });
  await messageBtn.click();
  await humanDelay(1_500, 3_000);

  const messageBox = page.locator(".msg-form__contenteditable, div[role='textbox']").first();
  await messageBox.waitFor({ timeout: 8_000 });
  await messageBox.click();
  await humanDelay(500, 1_000);

  // Type character-by-character for human-like input
  for (const char of messageBody) {
    await messageBox.pressSequentially(char, { delay: 30 + Math.random() * 70 });
  }

  await humanDelay(1_000, 2_000);

  const sendBtn = page.locator("button[type='submit'].msg-form__send-btn, button:has-text('Send message')").first();
  await sendBtn.click();
  await humanDelay(2_000, 3_000);
}
