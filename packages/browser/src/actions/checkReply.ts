import type { Page } from "playwright";
import { humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

/**
 * Checks whether a lead has replied in a LinkedIn message thread.
 *
 * Strategy: navigate to the lead's profile, click "Message" to open the
 * existing conversation, then check if the last message bubble is from the
 * lead (left-aligned) rather than from us (right-aligned).
 *
 * Returns true if a reply is detected, false otherwise.
 */
export async function checkReply(
  page: Page,
  linkedinUrl: string
): Promise<boolean> {
  await navigateTo(page, linkedinUrl);
  await humanDelay(2_000, 4_000);

  // Try to open the message thread
  const messageBtn = page
    .locator("button:has-text('Message'), a:has-text('Message')")
    .first();

  try {
    await messageBtn.waitFor({ timeout: 8_000 });
  } catch {
    // No Message button — not connected or profile unavailable
    return false;
  }

  await messageBtn.click();
  await humanDelay(2_000, 3_500);

  // Wait for the message list to render
  const msgList = page.locator(".msg-s-message-list, .msg-s-event-listitem").first();
  try {
    await msgList.waitFor({ timeout: 8_000 });
  } catch {
    return false;
  }

  await humanDelay(500, 1_000);

  // The last message item reveals who spoke last.
  // LinkedIn marks received messages with --left and sent messages with --right.
  const lastMsg = page
    .locator(".msg-s-event-listitem")
    .last();

  try {
    await lastMsg.waitFor({ timeout: 5_000 });
  } catch {
    return false;
  }

  const classList = await lastMsg.evaluate((el) =>
    el.className
  );

  // A reply from the lead lands as a "left" (incoming) event
  return classList.includes("msg-s-event-listitem--left");
}
