import { prisma, CampaignType, StepType, EdgeCondition } from "@linkedin-automation/db";
import { maybeCompleteCampaign } from "./campaignCompletion.js";

/**
 * Advance a SEQUENCE campaign lead past its current step once that step's
 * action has finished (a BullMQ job completed, or a WAIT step's timer elapsed).
 * No-op for non-SEQUENCE leads so this is safe to call from the shared
 * `attachCampaignLeadJobState` completion hook used by every queue.
 *
 * SEND_CONNECTION_REQUEST is special-cased: its outcome (accepted/timed out)
 * isn't known yet when the send itself completes, so we only mark
 * branchAwaitingSince here — syncStatus.processor.ts resolves the actual
 * branch later.
 */
export async function advanceSequenceLead(campaignLeadId: string): Promise<void> {
  const cl = await prisma.campaignLead.findUnique({
    where: { id: campaignLeadId },
    select: {
      id: true,
      campaignId: true,
      campaign: { select: { type: true } },
      currentStep: { select: { id: true, type: true } },
    },
  });
  if (!cl || cl.campaign.type !== CampaignType.SEQUENCE || !cl.currentStep) return;

  if (cl.currentStep.type === StepType.SEND_CONNECTION_REQUEST) {
    await prisma.campaignLead.update({
      where: { id: cl.id },
      data: { branchAwaitingSince: new Date() },
    });
    return;
  }

  const edge = await prisma.sequenceEdge.findUnique({
    where: {
      fromStepId_condition: {
        fromStepId: cl.currentStep.id,
        condition: EdgeCondition.DEFAULT,
      },
    },
  });

  await prisma.campaignLead.update({
    where: { id: cl.id },
    data: {
      currentStepId: edge?.toStepId ?? null,
      stepEnteredAt: edge ? new Date() : null,
      jobStatus: "IDLE",
    },
  });

  if (!edge) {
    await maybeCompleteCampaign(cl.campaignId).catch(() => {});
  }
}
