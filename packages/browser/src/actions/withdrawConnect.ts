import type { Page } from "playwright";
import { prisma, ConnectionStatus } from "@linkedin-automation/db";
import { humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

const MAX_WITHDRAWALS_PER_RUN = 20;

export type WithdrawConnectionResult = "withdrawn" | "not_pending";

/**
 * Withdraw a single pending connection request from a profile page.
 * Returns "not_pending" (not an error) if the profile no longer shows a
 * pending request — LinkedIn may have already resolved it independently.
 */
export async function withdrawConnection(
  page: Page,
  linkedinUrl: string
): Promise<WithdrawConnectionResult> {
  await navigateTo(page, linkedinUrl);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await humanDelay(3_000, 6_000);

  // LinkedIn renders the profile top-card's primary CTA as either a <button>
  // or an <a> depending on layout/experiment — match both.
  const pendingBtn = page
    .locator(
      "button:has-text('Pending'), button[aria-label*='Pending'], a:has-text('Pending'), a[aria-label*='Pending']"
    )
    .first();
  const hasPending = await pendingBtn
    .waitFor({ timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (!hasPending) return "not_pending";

  // A page-level hover-triggered flyout (e.g. LinkedIn's nav "For Business"
  // menu) can intercept a synthetic mouse click at this element's coordinates
  // even after scrolling it into view. Dispatch the click via the DOM
  // directly — it still fires the framework's real click handler without
  // going through Playwright's hover/hit-test path.
  await page.keyboard.press("Escape");
  await pendingBtn.scrollIntoViewIfNeeded();
  await humanDelay(500, 1_000);
  await pendingBtn.evaluate((el) => (el as HTMLElement).click());
  await humanDelay(1_000, 2_000);

  const withdrawConfirm = page
    .locator("button:has-text('Withdraw'), a:has-text('Withdraw')")
    .first();
  const hasConfirm = await withdrawConfirm
    .waitFor({ timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  if (!hasConfirm) return "not_pending";

  await withdrawConfirm.click();
  await humanDelay(2_000, 4_000);
  return "withdrawn";
}

export async function withdrawPendingConnections(
  page: Page,
  accountId: string
): Promise<number> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const stalePending = await prisma.lead.findMany({
    where: {
      accountId,
      connectionStatus: ConnectionStatus.PENDING,
      updatedAt: { lt: cutoff },
    },
    take: MAX_WITHDRAWALS_PER_RUN,
  });

  let withdrawn = 0;

  for (const lead of stalePending) {
    try {
      const result = await withdrawConnection(page, lead.linkedinUrl);
      if (result === "withdrawn") {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { connectionStatus: ConnectionStatus.WITHDRAWN },
        });
        withdrawn++;
      }
    } catch {
      // Continue withdrawing others if one fails
    }
  }

  return withdrawn;
}
