import type { Page } from "playwright";
import { humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

/**
 * Visit a lead's profile page with a human-like dwell time. Used by the
 * SEQUENCE engine's VISIT_PROFILE step, which exists purely to leave a
 * "viewed your profile" signal before a later LIKE_POST/connect step.
 */
export async function visitProfile(page: Page, profileUrl: string): Promise<void> {
  await navigateTo(page, profileUrl);
  await humanDelay(3_000, 6_000);
}
