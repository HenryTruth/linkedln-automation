import type { Page } from "playwright";
import { humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

export type LikePostResult = "liked" | "already_liked";

/**
 * Visit a LinkedIn post and like it. Idempotent — if the post is already
 * liked (aria-pressed="true" on the reaction button), this is a no-op that
 * still returns success rather than re-triggering the reaction.
 */
export async function likePost(page: Page, postUrl: string): Promise<LikePostResult> {
  await navigateTo(page, postUrl);
  await humanDelay(2_000, 4_000);

  const likeBtn = page
    .locator(
      "button.react-button__trigger, button[aria-label='Like'], button[aria-label^='React Like'], button[aria-label^='Like']"
    )
    .first();
  await likeBtn.waitFor({ timeout: 10_000 });

  const alreadyLiked =
    (await likeBtn.getAttribute("aria-pressed")) === "true" ||
    (await likeBtn
      .evaluate((el) => el.classList.contains("react-button__trigger--active"))
      .catch(() => false));

  if (alreadyLiked) return "already_liked";

  await likeBtn.click();
  await humanDelay(1_500, 3_000);
  return "liked";
}
