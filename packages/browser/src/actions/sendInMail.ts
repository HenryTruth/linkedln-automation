import type { Page, Locator } from "playwright";
import { delays, humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

async function fillFirstAvailable(locators: Locator[], value: string): Promise<boolean> {
  for (const locator of locators) {
    try {
      const field = locator.first();
      await field.waitFor({ timeout: 2_500 });
      await field.click();
      await field.fill(value);
      return true;
    } catch {
      // Try the next known InMail layout.
    }
  }
  return false;
}

export async function sendInMail(
  page: Page,
  linkedinUrl: string,
  subject: string,
  messageBody: string
): Promise<void> {
  await navigateTo(page, linkedinUrl);
  await delays.betweenActions();

  const inMailBtn = page
    .locator("button:has-text('InMail'), a:has-text('InMail')")
    .first();
  await inMailBtn.waitFor({ timeout: 10_000 });
  await inMailBtn.click();
  await humanDelay(1_500, 3_000);

  const subjectFilled = await fillFirstAvailable(
    [
      page.locator("input[name='subject']"),
      page.locator("input[aria-label*='Subject']"),
      page.locator("input[placeholder*='Subject']"),
    ],
    subject
  );

  if (!subjectFilled) {
    throw new Error("InMail composer opened, but no subject field was found.");
  }

  const messageBox = page
    .locator(
      ".msg-form__contenteditable, div[role='textbox'], textarea[name='message']"
    )
    .first();
  await messageBox.waitFor({ timeout: 8_000 });
  await messageBox.click();
  await humanDelay(500, 1_000);

  for (const char of messageBody) {
    await messageBox.pressSequentially(char, { delay: 30 + Math.random() * 70 });
  }

  await humanDelay(1_000, 2_000);

  const sendBtn = page
    .locator("button[type='submit']:has-text('Send'), button:has-text('Send InMail')")
    .first();
  await sendBtn.click();
  await humanDelay(2_000, 3_000);
}
