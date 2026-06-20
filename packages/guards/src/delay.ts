export function humanDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const delays = {
  betweenActions: () => humanDelay(3_000, 8_000),
  betweenPageLoads: () => humanDelay(5_000, 15_000),
  betweenCampaigns: () => humanDelay(2 * 60_000, 5 * 60_000),
};
