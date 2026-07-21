import type { Job } from "bullmq";
import { prisma, AccountStatus } from "@linkedin-automation/db";
import {
  claimDailyCap,
  assertWarmUpAllowed,
  checkActionWindow,
} from "@linkedin-automation/guards";
import {
  BrowserProfileInUseError,
  BrowserWorker,
  navigateTo,
} from "@linkedin-automation/browser";
import type { SessionHealthCheckJobData } from "../queues.js";

function userFacingHealthCheckResult(err: unknown): string {
  if (err instanceof BrowserProfileInUseError) {
    return "skipped: browser profile is busy; Vectra will retry automatically";
  }

  const message = err instanceof Error ? err.message : String(err);
  if (
    /launchPersistentContext|profile appears to be in use|profile is already in use|Opening in existing browser session|process_singleton/i.test(
      message
    )
  ) {
    return "skipped: browser profile is busy; Vectra will retry automatically";
  }

  if (/checkpoint|authwall/i.test(message)) {
    return "failed: LinkedIn needs account verification";
  }

  if (/login|session/i.test(message)) {
    return "failed: LinkedIn session needs attention";
  }

  return "failed: session check could not complete; Vectra will retry automatically";
}

/**
 * Proactively visits LinkedIn for every ACTIVE account with a session, once
 * per tick. There's no lead or campaign involved — the point is purely to
 * give BrowserWorker.getPage()'s existing detectCheckpoint() check a chance
 * to catch a dead/expired session (and auto-pause + alert via
 * handleCheckpoint()) before some real outreach job stumbles into it hours
 * or days later.
 */
export async function sessionHealthCheckProcessor(
  _job: Job<SessionHealthCheckJobData>
): Promise<void> {
  const accounts = await prisma.account.findMany({
    where: { status: AccountStatus.ACTIVE, cookiesEncrypted: { not: null } },
    select: { id: true, warmUpPhase: true },
  });

  for (const { id: accountId, warmUpPhase } of accounts) {
    try {
      assertWarmUpAllowed(accountId, warmUpPhase, "profileView");
      await claimDailyCap(accountId, "profileView");
      await checkActionWindow(accountId);
    } catch {
      continue; // not this account's turn this tick — try again next tick
    }

    const worker = new BrowserWorker(accountId);
    try {
      await worker.launch();
      await worker.getPage(); // fresh page, pre-navigation — trivially passes
      const page = await worker.getPage();
      await navigateTo(page, "https://www.linkedin.com/feed/");
      // Re-fetching re-runs detectCheckpoint() against the page now that it
      // has actually landed somewhere — if the session is dead this throws,
      // and handleCheckpoint() (inside getPage()) has already paused the
      // account and called sendAlert() before we get here.
      await worker.getPage();

      await prisma.activityLog.create({
        data: { accountId, actionType: "sessionHealthCheck", result: "success" },
      });
    } catch (err) {
      console.warn("Session health check failed", {
        accountId,
        error: err instanceof Error ? err.message : err,
      });
      await prisma.activityLog
        .create({
          data: {
            accountId,
            actionType: "sessionHealthCheck",
            result: userFacingHealthCheckResult(err),
          },
        })
        .catch(() => {});
    } finally {
      await worker.close();
    }
  }
}
