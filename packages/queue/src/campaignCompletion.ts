import { prisma, CampaignStatus, CampaignType } from "@linkedin-automation/db";

// A lead still owes work if its job hasn't been dispatched yet (IDLE) or is
// in flight. SENT / SKIPPED / FAILED are terminal.
const PENDING_JOB_STATUSES = ["IDLE", "QUEUED", "RUNNING"] as const;

/**
 * Marks a campaign COMPLETED once none of its leads have outstanding work.
 *
 * - SCRAPE / CONNECT / INMAIL: every lead's one-shot job has settled.
 * - MESSAGE: additionally, every unreplied lead has no future sequence step
 *   scheduled (nextActionAt cleared after the final step).
 * - CONTENT_SIGNAL: never auto-completes — it keeps discovering new leads.
 *
 * Returns true if the campaign was transitioned to COMPLETED.
 */
export async function maybeCompleteCampaign(campaignId: string): Promise<boolean> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, type: true, status: true },
  });
  if (!campaign || campaign.status !== CampaignStatus.ACTIVE) return false;
  if (campaign.type === CampaignType.CONTENT_SIGNAL) return false;

  const total = await prisma.campaignLead.count({ where: { campaignId } });
  if (total === 0) return false;

  const pendingWhere =
    campaign.type === CampaignType.MESSAGE
      ? {
          campaignId,
          OR: [
            { jobStatus: { in: [...PENDING_JOB_STATUSES] } },
            { repliedAt: null, nextActionAt: { not: null } },
          ],
        }
      : { campaignId, jobStatus: { in: [...PENDING_JOB_STATUSES] } };

  const pending = await prisma.campaignLead.count({ where: pendingWhere });
  if (pending > 0) return false;

  // Guard on status so a concurrent pause/restart isn't clobbered.
  const updated = await prisma.campaign.updateMany({
    where: { id: campaignId, status: CampaignStatus.ACTIVE },
    data: { status: CampaignStatus.COMPLETED },
  });
  return updated.count > 0;
}

/** Completion check keyed by campaignLead id — for BullMQ worker events. */
export async function maybeCompleteCampaignForLead(
  campaignLeadId: string
): Promise<void> {
  const campaignLead = await prisma.campaignLead.findUnique({
    where: { id: campaignLeadId },
    select: { campaignId: true },
  });
  if (!campaignLead) return;
  await maybeCompleteCampaign(campaignLead.campaignId);
}
