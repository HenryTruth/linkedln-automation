import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock handles (available inside vi.mock factories) ─────────────

const mocks = vi.hoisted(() => ({
  campaignLeadFindMany: vi.fn(),
  campaignLeadUpdate: vi.fn(),
  renderTemplate: vi.fn((template: string) => `rendered:${template}`),
  checkDailyCap: vi.fn(),
  workerLaunch: vi.fn().mockResolvedValue(undefined),
  workerGetPage: vi.fn().mockResolvedValue({}),
  workerClose: vi.fn().mockResolvedValue(undefined),
  checkReply: vi.fn().mockResolvedValue(false),
  messageQueueAdd: vi.fn(),
}));

vi.mock("@linkedin-automation/db", () => ({
  prisma: {
    campaignLead: {
      findMany: mocks.campaignLeadFindMany,
      update: mocks.campaignLeadUpdate,
    },
  },
  CampaignType: { MESSAGE: "MESSAGE" },
  CampaignStatus: { ACTIVE: "ACTIVE" },
  AccountStatus: { PAUSED: "PAUSED" },
}));

vi.mock("@linkedin-automation/guards", () => ({
  renderTemplate: mocks.renderTemplate,
  checkDailyCap: mocks.checkDailyCap,
}));

vi.mock("@linkedin-automation/browser", () => ({
  BrowserWorker: function BrowserWorker() {
    return {
      launch: mocks.workerLaunch,
      getPage: mocks.workerGetPage,
      close: mocks.workerClose,
    };
  },
  checkReply: mocks.checkReply,
}));

vi.mock("../queues.js", () => ({
  messageQueue: { add: mocks.messageQueueAdd },
  sequenceDispatchQueue: {},
  connectQueue: {},
  scrapeQueue: {},
  withdrawQueue: {},
  searchScrapeQueue: {},
}));

import { AccountStatus } from "@linkedin-automation/db";
import { renderTemplate } from "@linkedin-automation/guards";
import { sequenceProcessor } from "./sequence.processor.js";

function makeLead(overrides = {}) {
  return {
    id: "cl1",
    stage: 0,
    variantGroup: "A",
    repliedAt: null,
    nextActionAt: new Date(Date.now() - 1000),
    lead: {
      id: "lead1",
      linkedinUrl: "https://linkedin.com/in/alice",
      firstName: "Alice",
      lastName: "Smith",
      company: "Acme",
      title: "CTO",
    },
    campaign: {
      accountId: "acct1",
      account: { status: "ACTIVE" },
      messages: [
        { sequenceOrder: 0, variantGroup: "A", bodyTemplate: "Hi {{firstName}}", delayDays: 3 },
        { sequenceOrder: 1, variantGroup: "A", bodyTemplate: "Follow up {{firstName}}", delayDays: 5 },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.campaignLeadUpdate.mockResolvedValue({} as any);
  mocks.messageQueueAdd.mockResolvedValue({} as any);
});

describe("sequenceProcessor", () => {
  it("dispatches a message job for a due lead", async () => {
    mocks.campaignLeadFindMany.mockResolvedValue([makeLead()] as any);
    mocks.checkDailyCap.mockResolvedValue(undefined);
    mocks.checkReply.mockResolvedValue(false);

    await sequenceProcessor({ data: { _tick: true } } as any);

    expect(mocks.messageQueueAdd).toHaveBeenCalledOnce();
    const [jobName, jobData] = mocks.messageQueueAdd.mock.calls[0];
    expect(jobName).toBe("seq-cl1-step-0");
    expect(jobData.campaignLeadId).toBe("cl1");
    expect(jobData.sequenceStep).toBe(0);
    expect(jobData.accountId).toBe("acct1");
  });

  it("marks repliedAt and skips dispatch when reply detected", async () => {
    mocks.campaignLeadFindMany.mockResolvedValue([makeLead()] as any);
    mocks.checkDailyCap.mockResolvedValue(undefined);
    mocks.checkReply.mockResolvedValue(true);

    await sequenceProcessor({ data: { _tick: true } } as any);

    expect(mocks.messageQueueAdd).not.toHaveBeenCalled();
    expect(mocks.campaignLeadUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cl1" },
        data: expect.objectContaining({ repliedAt: expect.any(Date) }),
      })
    );
  });

  it("skips the lead when daily cap is exceeded", async () => {
    mocks.campaignLeadFindMany.mockResolvedValue([makeLead()] as any);
    mocks.checkDailyCap.mockRejectedValue(new Error("cap exceeded"));

    await sequenceProcessor({ data: { _tick: true } } as any);

    expect(mocks.messageQueueAdd).not.toHaveBeenCalled();
  });

  it("skips paused accounts", async () => {
    const lead = makeLead();
    (lead.campaign as any).account.status = AccountStatus.PAUSED;
    mocks.campaignLeadFindMany.mockResolvedValue([lead] as any);

    await sequenceProcessor({ data: { _tick: true } } as any);

    expect(mocks.messageQueueAdd).not.toHaveBeenCalled();
    expect(mocks.checkDailyCap).not.toHaveBeenCalled();
  });

  it("clears nextActionAt when lead has completed all sequence steps", async () => {
    const lead = makeLead({ stage: 2 }); // beyond the 2-message sequence
    mocks.campaignLeadFindMany.mockResolvedValue([lead] as any);
    mocks.checkDailyCap.mockResolvedValue(undefined);

    await sequenceProcessor({ data: { _tick: true } } as any);

    expect(mocks.messageQueueAdd).not.toHaveBeenCalled();
    expect(mocks.campaignLeadUpdate).toHaveBeenCalledWith({
      where: { id: "cl1" },
      data: { nextActionAt: null },
    });
  });

  it("sets nextActionAt to delayDays of the next step", async () => {
    mocks.campaignLeadFindMany.mockResolvedValue([makeLead()] as any);
    mocks.checkDailyCap.mockResolvedValue(undefined);
    mocks.checkReply.mockResolvedValue(false);

    const before = Date.now();
    await sequenceProcessor({ data: { _tick: true } } as any);
    const after = Date.now();

    const updateCall = mocks.campaignLeadUpdate.mock.calls.find(
      (c: any) => c[0].data.nextActionAt !== null
    );
    expect(updateCall).toBeDefined();
    const nextAt = (updateCall as any)[0].data.nextActionAt as Date;
    const expectedMs = 5 * 24 * 60 * 60 * 1000; // step-1 delayDays=5
    expect(nextAt.getTime()).toBeGreaterThanOrEqual(before + expectedMs);
    expect(nextAt.getTime()).toBeLessThanOrEqual(after + expectedMs);
  });

  it("does nothing when no leads are due", async () => {
    mocks.campaignLeadFindMany.mockResolvedValue([]);

    await sequenceProcessor({ data: { _tick: true } } as any);

    expect(mocks.messageQueueAdd).not.toHaveBeenCalled();
    expect(mocks.campaignLeadUpdate).not.toHaveBeenCalled();
  });

  it("uses the lead's assigned variant group", async () => {
    const lead = makeLead({ variantGroup: "B" });
    (lead.campaign as any).messages.push(
      { sequenceOrder: 0, variantGroup: "B", bodyTemplate: "B-variant {{firstName}}", delayDays: 3 }
    );
    mocks.campaignLeadFindMany.mockResolvedValue([lead] as any);
    mocks.checkDailyCap.mockResolvedValue(undefined);
    mocks.checkReply.mockResolvedValue(false);

    await sequenceProcessor({ data: { _tick: true } } as any);

    expect(renderTemplate).toHaveBeenCalledWith(
      "B-variant {{firstName}}",
      expect.any(Object)
    );
  });
});
