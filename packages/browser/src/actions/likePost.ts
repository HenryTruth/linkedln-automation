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

  // A dead/expired session redirects to a login page; report it clearly instead
  // of failing later with a confusing "reaction button not found" locator
  // timeout (see sendConnect.ts / checkConnectionStatus.ts).
  const landedUrl = page.url();
  if (/\/(login|uas\/login|authwall|checkpoint)/.test(landedUrl)) {
    throw new Error(
      `LinkedIn redirected to ${landedUrl} instead of the post — the session cookies are likely expired or invalid.`
    );
  }
  // Soft de-auth: normal post URL but logged-out guest render (no reaction bar,
  // just Sign in / Join now) — otherwise this surfaces as a 10s locator timeout.
  const guestView = await page.evaluate(() => {
    const authed = !!document.querySelector(
      "img.global-nav__me-photo, .global-nav__me, [data-control-name='nav.settings']"
    );
    if (authed) return false;
    return /(Join now|Sign in with Email|Continue with Google|New to LinkedIn\?|Sign in to)/i.test(
      document.body?.innerText ?? ""
    );
  });
  if (guestView) {
    throw new Error(
      `LinkedIn rendered the logged-out guest view for ${postUrl} — the session is not authenticated for this request.`
    );
  }

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
