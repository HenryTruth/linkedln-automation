import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@linkedin-automation/db", () => ({
  prisma: {
    account: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    checkpoint: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@linkedin-automation/db";
import { checkDailyCap, dayKeyForTimezone, remainingDailyCap } from "./caps.js";

const mockFindAccount = vi.mocked(prisma.account.findUniqueOrThrow);
const mockCheckpointCount = vi.mocked(prisma.checkpoint.count);

describe("daily cap timezone handling", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockCheckpointCount.mockResolvedValue(0);
  });

  it("formats the day in the requested timezone instead of UTC", () => {
    const date = new Date("2026-01-01T02:00:00.000Z");

    expect(dayKeyForTimezone("UTC", date)).toBe("2026-01-01");
    expect(dayKeyForTimezone("America/New_York", date)).toBe("2025-12-31");
  });

  it("checks usage against the campaign timezone day key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T23:30:00.000Z")); // Jan 2, 08:30 in Tokyo
    mockFindAccount.mockResolvedValue({
      dailyCaps: {
        "2026-01-01": { connection: 15 },
        "2026-01-02": { connection: 14 },
      },
      maxDailyCaps: {},
      warmUpPhase: "FULL",
      timezone: "America/New_York",
    } as any);

    await expect(
      checkDailyCap("acct_1", "connection", "Asia/Tokyo")
    ).resolves.toBeUndefined();
  });

  it("applies weekend throttling using the campaign timezone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-03T23:30:00.000Z")); // Sat, 08:30 in Tokyo; Fri in Los Angeles
    mockFindAccount.mockResolvedValue({
      dailyCaps: {
        "2026-07-04": { connection: 7 },
      },
      maxDailyCaps: {},
      warmUpPhase: "FULL",
      timezone: "America/Los_Angeles",
    } as any);

    await expect(
      checkDailyCap("acct_1", "connection", "Asia/Tokyo")
    ).rejects.toThrow("Daily cap exceeded");
  });

  it("lets full warm-up accounts use the configured search-page cap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T10:00:00.000Z"));
    mockFindAccount.mockResolvedValue({
      dailyCaps: {
        "2026-07-21": { searchPage: 5 },
      },
      maxDailyCaps: { searchPage: 40 },
      warmUpPhase: "FULL",
      timezone: "UTC",
    } as any);

    await expect(remainingDailyCap("acct_1", "searchPage", "UTC")).resolves.toBe(35);
  });

  it("still halves search-page capacity for accounts with repeated checkpoints", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T10:00:00.000Z"));
    mockCheckpointCount.mockResolvedValue(2);
    mockFindAccount.mockResolvedValue({
      dailyCaps: {
        "2026-07-21": { searchPage: 5 },
      },
      maxDailyCaps: { searchPage: 40 },
      warmUpPhase: "FULL",
      timezone: "UTC",
    } as any);

    await expect(remainingDailyCap("acct_1", "searchPage", "UTC")).resolves.toBe(15);
  });
});
