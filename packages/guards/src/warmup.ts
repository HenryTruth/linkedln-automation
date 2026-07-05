import { WarmUpPhase } from "@linkedin-automation/db";
import { WarmUpError } from "./errors.js";
import type { ActionType } from "./caps.js";

// Max allowed per day per warm-up phase (connections, messages)
const PHASE_CAPS: Record<WarmUpPhase, Partial<Record<ActionType, number>>> = {
  MANUAL: { connection: 0, message: 0, inmail: 0, profileView: 0, searchPage: 0 },
  WEEK2: { connection: 5, message: 0, inmail: 0, profileView: 20, searchPage: 5 },
  WEEK3: { connection: 10, message: 5, inmail: 2, profileView: 40, searchPage: 8 },
  WEEK4: { connection: 12, message: 20, inmail: 5, profileView: 50, searchPage: 9 },
  FULL: { connection: 15, message: 40, inmail: 10, profileView: 60, searchPage: 10 },
};

export function assertWarmUpAllowed(
  accountId: string,
  phase: WarmUpPhase,
  action: ActionType
): void {
  const allowed = PHASE_CAPS[phase][action] ?? 0;
  if (allowed === 0) {
    throw new WarmUpError(accountId, action, phase);
  }
}

export function warmUpCap(phase: WarmUpPhase, action: ActionType): number {
  return PHASE_CAPS[phase][action] ?? 0;
}
