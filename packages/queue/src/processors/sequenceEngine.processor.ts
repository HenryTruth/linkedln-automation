import type { Job } from "bullmq";
import {
  prisma,
  AccountStatus,
  CampaignType,
  CampaignStatus,
  StepType,
} from "@linkedin-automation/db";
import { checkDailyCap, renderTemplate, humanizePostDate } from "@linkedin-automation/guards";
import {
  connectQueue,
  messageQueue,
  inMailQueue,
  scrapeQueue,
  likePostQueue,
  withdrawSingleQueue,
  visitProfileQueue,
} from "../queues.js";
import type { SequenceEngineTickJobData } from "../queues.js";
import { advanceSequenceLead } from "../sequenceGraph.js";

type DueLead = Awaited<ReturnType<typeof fetchDueLeads>>[number];

async function fetchDueLeads() {
  return prisma.campaignLead.findMany({
    where: {
      jobStatus: { notIn: ["QUEUED", "RUNNING"] },
      currentStepId: { not: null },
      branchAwaitingSince: null,
      campaign: { type: CampaignType.SEQUENCE, status: CampaignStatus.ACTIVE },
    },
    include: {
      lead: true,
      postSignal: true,
      campaign: {
        select: {
          id: true,
          accountId: true,
          account: { select: { status: true } },
        },
      },
      currentStep: true,
    },
    take: 200,
  });
}

function templateFieldsFor(cl: DueLead) {
  return {
    firstName: cl.lead.firstName,
    lastName: cl.lead.lastName,
    company: cl.lead.company,
    title: cl.lead.title,
    postExcerpt: cl.postSignal?.excerpt ?? null,
    postTopic: cl.postSignal?.keyword ?? null,
    postDate: cl.postSignal ? humanizePostDate(cl.postSignal.publishedAt) : null,
  };
}

function resolvePostUrl(cl: DueLead): string | null {
  const config = (cl.currentStep?.config ?? {}) as {
    postUrlSource?: "referenced" | "static";
    postUrl?: string;
  };
  if (config.postUrlSource === "static") return config.postUrl ?? null;
  return cl.postSignal?.postUrl ?? null; // "referenced" is the default
}

export async function sequenceEngineProcessor(
  _job: Job<SequenceEngineTickJobData>
): Promise<void> {
  const dueLeads = await fetchDueLeads();

  for (const cl of dueLeads) {
    if (cl.campaign.account.status === AccountStatus.PAUSED) continue;
    const step = cl.currentStep;
    if (!step) continue;
    const config = (step.config ?? {}) as Record<string, unknown>;
    const accountId = cl.campaign.accountId;

    switch (step.type) {
      case StepType.WAIT: {
        if (!cl.stepEnteredAt) continue;
        const waitDays = typeof config.waitDays === "number" ? config.waitDays : 0;
        const elapsedMs = Date.now() - cl.stepEnteredAt.getTime();
        if (elapsedMs < waitDays * 24 * 60 * 60 * 1000) continue;
        await advanceSequenceLead(cl.id);
        break;
      }

      case StepType.SEND_CONNECTION_REQUEST: {
        try {
          await checkDailyCap(accountId, "connection");
        } catch {
          continue;
        }
        const bodyTemplate = config.bodyTemplate as string | undefined;
        const note = bodyTemplate
          ? renderTemplate(bodyTemplate, templateFieldsFor(cl))
          : undefined;
        const jobId = `sequence-${cl.id}-step-${step.id}-connect`;
        await connectQueue.add(
          "connect",
          {
            accountId,
            leadId: cl.leadId,
            linkedinUrl: cl.lead.linkedinUrl,
            note,
            campaignLeadId: cl.id,
          },
          { jobId }
        );
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { jobStatus: "QUEUED", queuedJobId: jobId, lastJobError: null },
        });
        break;
      }

      case StepType.SEND_MESSAGE: {
        const bodyTemplate = config.bodyTemplate as string | undefined;
        if (!bodyTemplate) continue;
        try {
          await checkDailyCap(accountId, "message");
        } catch {
          continue;
        }
        const messageBody = renderTemplate(bodyTemplate, templateFieldsFor(cl));
        const jobId = `sequence-${cl.id}-step-${step.id}-message`;
        await messageQueue.add(
          "message",
          {
            accountId,
            leadId: cl.leadId,
            linkedinUrl: cl.lead.linkedinUrl,
            messageBody,
            campaignLeadId: cl.id,
            // Non-undefined — signals an engine-managed dispatch so
            // message.processor.ts skips its single-shot duplicate guard
            // (a graph can legitimately message the same lead more than once).
            sequenceStep: 0,
            company: cl.lead.company,
          },
          { jobId }
        );
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { jobStatus: "QUEUED", queuedJobId: jobId, lastJobError: null },
        });
        break;
      }

      case StepType.SEND_INMAIL: {
        const bodyTemplate = config.bodyTemplate as string | undefined;
        if (!bodyTemplate) continue;
        try {
          await checkDailyCap(accountId, "inmail");
        } catch {
          continue;
        }
        const fields = templateFieldsFor(cl);
        const messageBody = renderTemplate(bodyTemplate, fields);
        const subjectTemplate = (config.subjectTemplate as string | undefined) ?? "Hi {{firstName}}";
        const subject = renderTemplate(subjectTemplate, fields).trim() || "Quick question";
        const jobId = `sequence-${cl.id}-step-${step.id}-inmail`;
        await inMailQueue.add(
          "inmail",
          {
            accountId,
            leadId: cl.leadId,
            linkedinUrl: cl.lead.linkedinUrl,
            subject,
            messageBody,
            campaignLeadId: cl.id,
            company: cl.lead.company,
          },
          { jobId }
        );
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { jobStatus: "QUEUED", queuedJobId: jobId, lastJobError: null },
        });
        break;
      }

      case StepType.SCRAPE_SEARCH: {
        try {
          await checkDailyCap(accountId, "profileView");
        } catch {
          continue;
        }
        const jobId = `sequence-${cl.id}-step-${step.id}-scrape`;
        await scrapeQueue.add(
          "scrape",
          {
            accountId,
            linkedinUrl: cl.lead.linkedinUrl,
            campaignId: cl.campaignId,
            campaignLeadId: cl.id,
          },
          { jobId }
        );
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { jobStatus: "QUEUED", queuedJobId: jobId, lastJobError: null },
        });
        break;
      }

      case StepType.LIKE_POST: {
        const postUrl = resolvePostUrl(cl);
        if (!postUrl) {
          await prisma.campaignLead.update({
            where: { id: cl.id },
            data: { jobStatus: "FAILED", lastJobError: "LIKE_POST step has no resolvable post URL" },
          });
          continue;
        }
        try {
          await checkDailyCap(accountId, "profileView");
        } catch {
          continue;
        }
        const jobId = `sequence-${cl.id}-step-${step.id}-like`;
        await likePostQueue.add(
          "likePost",
          { accountId, leadId: cl.leadId, campaignLeadId: cl.id, postUrl },
          { jobId }
        );
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { jobStatus: "QUEUED", queuedJobId: jobId, lastJobError: null },
        });
        break;
      }

      case StepType.VISIT_PROFILE: {
        try {
          await checkDailyCap(accountId, "profileView");
        } catch {
          continue;
        }
        const jobId = `sequence-${cl.id}-step-${step.id}-visit`;
        await visitProfileQueue.add(
          "visitProfile",
          {
            accountId,
            leadId: cl.leadId,
            campaignLeadId: cl.id,
            linkedinUrl: cl.lead.linkedinUrl,
          },
          { jobId }
        );
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { jobStatus: "QUEUED", queuedJobId: jobId, lastJobError: null },
        });
        break;
      }

      case StepType.WITHDRAW_CONNECTION: {
        try {
          await checkDailyCap(accountId, "connection");
        } catch {
          continue;
        }
        const jobId = `sequence-${cl.id}-step-${step.id}-withdraw`;
        await withdrawSingleQueue.add(
          "withdrawSingle",
          {
            accountId,
            leadId: cl.leadId,
            campaignLeadId: cl.id,
            linkedinUrl: cl.lead.linkedinUrl,
          },
          { jobId }
        );
        await prisma.campaignLead.update({
          where: { id: cl.id },
          data: { jobStatus: "QUEUED", queuedJobId: jobId, lastJobError: null },
        });
        break;
      }
    }
  }
}
