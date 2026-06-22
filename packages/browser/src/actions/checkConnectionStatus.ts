import type { Page } from "playwright";
import { humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

export type DetectedConnectionStatus = "NONE" | "PENDING" | "CONNECTED";

/**
 * Visit a LinkedIn profile and determine the current connection status by
 * reading which action button LinkedIn renders.
 *
 *   "Message"  button visible → first-degree connection  (CONNECTED)
 *   "Pending"  button visible → request sent, not yet accepted (PENDING)
 *   "Connect"  button visible → no relationship           (NONE)
 *
 * Returns NONE as the safe default if the page state is unrecognised.
 */
export async function checkConnectionStatus(
  page: Page,
  profileUrl: string
): Promise<DetectedConnectionStatus> {
  await navigateTo(page, profileUrl);
  await humanDelay(2_000, 4_000);

  // "Message" → already a first-degree connection
  const messageVisible = await page
    .locator("button:has-text('Message'), button[aria-label*='Message']")
    .first()
    .isVisible()
    .catch(() => false);
  if (messageVisible) return "CONNECTED";

  // "Pending" → connection request sent but not yet accepted
  const pendingVisible = await page
    .locator("button:has-text('Pending'), button[aria-label*='Pending']")
    .first()
    .isVisible()
    .catch(() => false);
  if (pendingVisible) return "PENDING";

  // "Withdraw" sometimes appears inside the More dropdown instead of as a top button
  // (LinkedIn shows this on some profile layouts)
  try {
    const moreBtn = page
      .locator("button[aria-label*='More actions']")
      .first();
    if (await moreBtn.isVisible()) {
      await moreBtn.click();
      await humanDelay(500, 1_000);
      const withdrawVisible = await page
        .locator("span:has-text('Withdraw'), li-icon[type='withdraw']")
        .first()
        .isVisible()
        .catch(() => false);
      await page.keyboard.press("Escape");
      if (withdrawVisible) return "PENDING";
    }
  } catch {
    // Ignore — "More" button not present or click failed
  }

  return "NONE";
}
