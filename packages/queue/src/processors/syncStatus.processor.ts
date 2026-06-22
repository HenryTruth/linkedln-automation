import type { Job } from "bullmq";
import { prisma, ConnectionStatus, AccountStatus } from "@linkedin-automation/db";
import {
  BrowserWorker,
  checkConnectionStatus,
} from "@linkedin-automation/browser";
import { claimDailyCap } from "@linkedin-automation/guards";
import type { SyncStatusJobData } from "../queues.js";

// Only re-check pending connections that have been waiting at least this long.
// Avoids hammering profiles of people who were just sent a request.
const PENDING_CHECK_AFTER_HOURS = 24;

// Max profiles to visit per account per run.
// Each visit consumes one profileView cap unit.
const MAX_PER_ACCOUNT = 15;

export async function syncStatusProcessor(
  _job: Job<SyncStatusJobData>
): Promise<void> {
  const cutoff = new Date(
    Date.now() - PENDING_CHECK_AFTER_HOURS * 60 * 60 * 1000
  );

  // ── 1. PENDING leads that have been waiting > 24h ─────────────────────────
  // Check whether they accepted, declined (NONE), or are still waiting.
  const pendingLeads = await prisma.lead.findMany({
    where: {
      connectionStatus: ConnectionStatus.PENDING,
      updatedAt: { lte: cutoff },
      accountId: { not: null },
      account: { status: AccountStatus.ACTIVE },
    },
    select: {
      id: true,
      linkedinUrl: true,
      connectionStatus: true,
      accountId: true,
    },
    orderBy: { updatedAt: "asc" }, // oldest first — most likely to have resolved
    take: 200,
  });

  // ── 2. NONE leads sitting in active MESSAGE campaigns ─────────────────────
  // These were added before this tool managed them — they may already be
  // first-degree connections and immediately eligible for messaging.
  const noneLeads = await prisma.lead.findMany({
    where: {
      connectionStatus: ConnectionStatus.NONE,
      accountId: { not: null },
      account: { status: AccountStatus.ACTIVE },
      campaigns: {
        some: {
          repliedAt: null,
          nextActionAt: null, // sequence not yet activated
          campaign: { type: "MESSAGE", status: "ACTIVE" },
        },
      },
    },
    select: {
      id: true,
      linkedinUrl: true,
      connectionStatus: true,
      accountId: true,
    },
    take: 200,
  });

  // ── Group by account to reuse browser sessions ────────────────────────────
  type LeadRow = {
    id: string;
    linkedinUrl: string;
    connectionStatus: string;
    accountId: string | null;
  };

  const byAccount = new Map<string, LeadRow[]>();

  for (const lead of [...pendingLeads, ...noneLeads]) {
    if (!lead.accountId) continue;
    const list = byAccount.get(lead.accountId) ?? [];
    // Deduplicate — a lead can appear in both queries
    if (!list.some((l) => l.id === lead.id)) list.push(lead);
    byAccount.set(lead.accountId, list);
  }

  for (const [accountId, leads] of byAccount) {
    const batch = leads.slice(0, MAX_PER_ACCOUNT);
    const worker = new BrowserWorker(accountId);

    try {
      await worker.launch();
      const page = await worker.getPage();

      for (const lead of batch) {
        // Honour the daily profile-view cap — stop if exhausted
        try {
          await claimDailyCap(accountId, "profileView");
        } catch {
          break;
        }

        try {
          const detected = await checkConnectionStatus(page, lead.linkedinUrl);

          if ((detected as string) !== lead.connectionStatus) {
            await prisma.lead.update({
              where: { id: lead.id },
              data: { connectionStatus: detected as ConnectionStatus },
            });

            // Newly accepted → activate any waiting MESSAGE sequences for this lead
            if (
              detected === "CONNECTED" &&
              lead.connectionStatus === ConnectionStatus.PENDING
            ) {
              await activateMessageSequences(lead.id, accountId);
            }

            // Old connection discovered (was NONE, now CONNECTED) → same activation
            if (
              detected === "CONNECTED" &&
              lead.connectionStatus === ConnectionStatus.NONE
            ) {
              await activateMessageSequences(lead.id, accountId);
            }
          }
        } catch {
          // Profile visit failed — skip and retry on next run
        }
      }
    } catch {
      // Browser launch failed (bad cookies, proxy down, etc.) — skip account
    } finally {
      await worker.close();
    }
  }
}

/**
 * Set nextActionAt = now on any MESSAGE campaign memberships that are
 * waiting for this lead to become connected. The sequence dispatcher
 * (running every 15 min) will pick them up and fire the first message.
 */
async function activateMessageSequences(
  leadId: string,
  accountId: string
): Promise<void> {
  await prisma.campaignLead.updateMany({
    where: {
      leadId,
      nextActionAt: null,
      repliedAt: null,
      campaign: {
        type: "MESSAGE",
        status: "ACTIVE",
        accountId,
      },
    },
    data: { nextActionAt: new Date() },
  });
}
