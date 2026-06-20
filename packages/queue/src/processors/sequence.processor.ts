import type { Job } from "bullmq";
import { prisma, CampaignType, CampaignStatus, AccountStatus } from "@linkedin-automation/db";
import { renderTemplate, checkDailyCap } from "@linkedin-automation/guards";
import { BrowserWorker, checkReply } from "@linkedin-automation/browser";
import { messageQueue } from "../queues.js";
import type { SequenceDispatchJobData } from "../queues.js";

const REPLY_CHECK_CONCURRENCY = 1; // one browser session at a time for reply checks

export async function sequenceProcessor(
  _job: Job<SequenceDispatchJobData>
): Promise<void> {
  // Find all campaign leads due for their next sequence message
  const dueLeads = await prisma.campaignLead.findMany({
    where: {
      repliedAt: null,
      nextActionAt: { lte: new Date() },
      campaign: {
        type: CampaignType.MESSAGE,
        status: CampaignStatus.ACTIVE,
      },
    },
    include: {
      lead: true,
      campaign: {
        include: {
          messages: { orderBy: { sequenceOrder: "asc" } },
          account: { select: { status: true } },
        },
      },
    },
    orderBy: { nextActionAt: "asc" },
    take: 100, // process at most 100 per tick to keep runtime bounded
  });

  for (const cl of dueLeads) {
    const { campaign, lead } = cl;

    // Skip paused accounts
    if (campaign.account.status === AccountStatus.PAUSED) continue;

    // Check daily cap before doing anything expensive
    try {
      await checkDailyCap(campaign.accountId, "message");
    } catch {
      // Cap hit for this account — skip all remaining leads for it
      continue;
    }

    const messages = campaign.messages;
    if (messages.length === 0) continue;

    // Pick the message for this lead's current stage
    const nextMessage = messages.find((m) => m.sequenceOrder === cl.stage);

    if (!nextMessage) {
      // Lead has completed the sequence — clear nextActionAt
      await prisma.campaignLead.update({
        where: { id: cl.id },
        data: { nextActionAt: null },
      });
      continue;
    }

    // Pick the correct variant (A/B) for this lead, falling back to "A"
    const variantMessage =
      messages.find(
        (m) =>
          m.sequenceOrder === cl.stage && m.variantGroup === cl.variantGroup
      ) ?? nextMessage;

    // Check if the lead has replied since the last send (Playwright-based)
    const replied = await checkReplyForLead(campaign.accountId, lead.linkedinUrl);
    if (replied) {
      await prisma.campaignLead.update({
        where: { id: cl.id },
        data: { repliedAt: new Date() },
      });
      continue;
    }

    // Render the template with lead data
    const messageBody = renderTemplate(variantMessage.bodyTemplate, {
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      title: lead.title,
    });

    // Compute when the NEXT message after this one should fire
    const nextStageMessage = messages.find(
      (m) => m.sequenceOrder === cl.stage + 1
    );
    const nextActionAt = nextStageMessage
      ? new Date(Date.now() + nextStageMessage.delayDays * 24 * 60 * 60 * 1000)
      : null;

    // Dispatch to the message queue
    await messageQueue.add(
      `seq-${cl.id}-step-${cl.stage}`,
      {
        accountId: campaign.accountId,
        leadId: lead.id,
        linkedinUrl: lead.linkedinUrl,
        messageBody,
        campaignLeadId: cl.id,
        sequenceStep: cl.stage,
        company: lead.company,
      },
      {
        jobId: `seq-${cl.id}-step-${cl.stage}`,
        removeOnComplete: 100,
        removeOnFail: 200,
      }
    );

    // Update nextActionAt so this lead won't fire again until the next window
    await prisma.campaignLead.update({
      where: { id: cl.id },
      data: { nextActionAt },
    });
  }
}

// Isolated so the concurrency note above is explicit
async function checkReplyForLead(
  accountId: string,
  linkedinUrl: string
): Promise<boolean> {
  const worker = new BrowserWorker(accountId);
  try {
    await worker.launch();
    const page = await worker.getPage();
    return await checkReply(page, linkedinUrl);
  } catch {
    return false; // treat errors as "no reply" to avoid dropping leads
  } finally {
    await worker.close();
  }
}
