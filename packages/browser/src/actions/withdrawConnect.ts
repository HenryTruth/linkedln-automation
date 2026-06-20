import type { Page } from "playwright";
import { prisma, ConnectionStatus } from "@linkedin-automation/db";
import { humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

const MAX_WITHDRAWALS_PER_RUN = 20;

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
      await navigateTo(page, lead.linkedinUrl);
      await humanDelay(3_000, 6_000);

      // Pending invitations show a "Withdraw" or "Pending" button
      const pendingBtn = page.locator(
        "button:has-text('Pending'), button[aria-label*='Pending']"
      ).first();
      const hasPending = await pendingBtn.count();

      if (hasPending > 0) {
        await pendingBtn.click();
        await humanDelay(1_000, 2_000);

        const withdrawConfirm = page.locator("button:has-text('Withdraw')").first();
        const hasConfirm = await withdrawConfirm.count();
        if (hasConfirm > 0) {
          await withdrawConfirm.click();
          await humanDelay(2_000, 4_000);

          await prisma.lead.update({
            where: { id: lead.id },
            data: { connectionStatus: ConnectionStatus.WITHDRAWN },
          });
          withdrawn++;
        }
      }
    } catch {
      // Continue withdrawing others if one fails
    }
  }

  return withdrawn;
}
