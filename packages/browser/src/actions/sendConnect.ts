import type { Page } from "playwright";
import { prisma, ConnectionStatus } from "@linkedin-automation/db";
import { delays, humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

export async function sendConnect(
  page: Page,
  linkedinUrl: string,
  note?: string
): Promise<void> {
  await navigateTo(page, linkedinUrl);
  await delays.betweenActions();

  // Click "Connect" button on the profile
  const connectBtn = page.locator(
    "button:has-text('Connect'), button[aria-label*='Connect']"
  ).first();
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

  await prisma.lead.updateMany({
    where: { linkedinUrl },
    data: { connectionStatus: ConnectionStatus.PENDING },
  });
}
