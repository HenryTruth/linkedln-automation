import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  campaignFindUnique: vi.fn(),
  campaignUpdateMany: vi.fn(),
  campaignLeadCount: vi.fn(),
  campaignLeadFindUnique: vi.fn(),
}));

vi.mock("@linkedin-automation/db", () => ({
  prisma: {
    campaign: {
      findUnique: mocks.campaignFindUnique,
      updateMany: mocks.campaignUpdateMany,
    },
    campaignLead: {
      count: mocks.campaignLeadCount,
      findUnique: mocks.campaignLeadFindUnique,
    },
  },
  CampaignStatus: { ACTIVE: "ACTIVE", PAUSED: "PAUSED", COMPLETED: "COMPLETED" },
  CampaignType: {
    CONNECT: "CONNECT",
    MESSAGE: "MESSAGE",
    INMAIL: "INMAIL",
    SCRAPE: "SCRAPE",
    CONTENT_SIGNAL: "CONTENT_SIGNAL",
  },
}));

import { maybeCompleteCampaign } from "./campaignCompletion.js";

beforeEach(() => {
  mocks.campaignFindUnique.mockReset();
  mocks.campaignUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.campaignLeadCount.mockReset();
});

describe("maybeCompleteCampaign", () => {
  it("completes a scrape campaign once every lead job has settled", async () => {
    mocks.campaignFindUnique.mockResolvedValue({
      id: "camp_1",
      type: "SCRAPE",
      status: "ACTIVE",
    });
    mocks.campaignLeadCount
      .mockResolvedValueOnce(10) // total leads
      .mockResolvedValueOnce(0); // pending leads

    await expect(maybeCompleteCampaign("camp_1")).resolves.toBe(true);
    expect(mocks.campaignUpdateMany).toHaveBeenCalledWith({
      where: { id: "camp_1", status: "ACTIVE" },
      data: { status: "COMPLETED" },
    });
  });

  it("leaves the campaign active while any lead is idle, queued, or running", async () => {
    mocks.campaignFindUnique.mockResolvedValue({
      id: "camp_1",
      type: "SCRAPE",
      status: "ACTIVE",
    });
    mocks.campaignLeadCount
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3);

    await expect(maybeCompleteCampaign("camp_1")).resolves.toBe(false);
    expect(mocks.campaignUpdateMany).not.toHaveBeenCalled();
  });

  it("never completes a campaign that has no leads yet", async () => {
    mocks.campaignFindUnique.mockResolvedValue({
      id: "camp_1",
      type: "CONNECT",
      status: "ACTIVE",
    });
    mocks.campaignLeadCount.mockResolvedValueOnce(0);

    await expect(maybeCompleteCampaign("camp_1")).resolves.toBe(false);
    expect(mocks.campaignUpdateMany).not.toHaveBeenCalled();
  });

  it("treats a scheduled next sequence step as pending work for message campaigns", async () => {
    mocks.campaignFindUnique.mockResolvedValue({
      id: "camp_1",
      type: "MESSAGE",
      status: "ACTIVE",
    });
    mocks.campaignLeadCount
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(0);

    await expect(maybeCompleteCampaign("camp_1")).resolves.toBe(true);

    const pendingWhere = mocks.campaignLeadCount.mock.calls[1][0].where;
    expect(pendingWhere.OR).toEqual([
      { jobStatus: { in: ["IDLE", "QUEUED", "RUNNING"] } },
      { repliedAt: null, nextActionAt: { not: null } },
    ]);
  });

  it("never auto-completes content-signal campaigns", async () => {
    mocks.campaignFindUnique.mockResolvedValue({
      id: "camp_1",
      type: "CONTENT_SIGNAL",
      status: "ACTIVE",
    });

    await expect(maybeCompleteCampaign("camp_1")).resolves.toBe(false);
    expect(mocks.campaignLeadCount).not.toHaveBeenCalled();
  });

  it("ignores paused and already-completed campaigns", async () => {
    mocks.campaignFindUnique.mockResolvedValue({
      id: "camp_1",
      type: "SCRAPE",
      status: "PAUSED",
    });

    await expect(maybeCompleteCampaign("camp_1")).resolves.toBe(false);
    expect(mocks.campaignLeadCount).not.toHaveBeenCalled();
    expect(mocks.campaignUpdateMany).not.toHaveBeenCalled();
  });
});
