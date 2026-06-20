import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module before importing the module under test
vi.mock("@linkedin-automation/db", () => ({
  prisma: {
    activityLog: { findMany: vi.fn() },
    lead: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@linkedin-automation/db";
import {
  checkSameCompanyThrottle,
  SameCompanyThrottleError,
} from "./sameCompanyThrottle.js";

const mockActivityLog = vi.mocked(prisma.activityLog.findMany);
const mockLeadFindFirst = vi.mocked(prisma.lead.findFirst);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkSameCompanyThrottle", () => {
  it("passes when no recent messages exist", async () => {
    mockActivityLog.mockResolvedValue([]);
    await expect(
      checkSameCompanyThrottle("acct1", "Acme Corp")
    ).resolves.toBeUndefined();
    expect(mockLeadFindFirst).not.toHaveBeenCalled();
  });

  it("passes when recent messages are to leads at a different company", async () => {
    mockActivityLog.mockResolvedValue([{ targetUrl: "https://linkedin.com/in/other" }] as any);
    mockLeadFindFirst.mockResolvedValue(null);
    await expect(
      checkSameCompanyThrottle("acct1", "Acme Corp")
    ).resolves.toBeUndefined();
  });

  it("throws SameCompanyThrottleError when recent message targeted the same company", async () => {
    mockActivityLog.mockResolvedValue([
      { targetUrl: "https://linkedin.com/in/alice" },
    ] as any);
    mockLeadFindFirst.mockResolvedValue({
      id: "lead1",
      linkedinUrl: "https://linkedin.com/in/alice",
      company: "Acme Corp",
    } as any);

    await expect(
      checkSameCompanyThrottle("acct1", "Acme Corp")
    ).rejects.toThrow(SameCompanyThrottleError);
  });

  it("skips the check entirely when company is null", async () => {
    await expect(
      checkSameCompanyThrottle("acct1", null)
    ).resolves.toBeUndefined();
    expect(mockActivityLog).not.toHaveBeenCalled();
  });

  it("skips the check when company is undefined", async () => {
    await expect(
      checkSameCompanyThrottle("acct1", undefined)
    ).resolves.toBeUndefined();
    expect(mockActivityLog).not.toHaveBeenCalled();
  });

  it("passes when activity log has records but all targetUrls are null", async () => {
    mockActivityLog.mockResolvedValue([{ targetUrl: null }] as any);
    // No URLs to query leads by — should exit without calling findFirst
    await expect(
      checkSameCompanyThrottle("acct1", "Acme Corp")
    ).resolves.toBeUndefined();
    expect(mockLeadFindFirst).not.toHaveBeenCalled();
  });
});
