import type { Page } from "playwright";
import { humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

export type DetectedConnectionStatus = "NONE" | "PENDING" | "CONNECTED";

interface TopCardState {
  pending: boolean;
  connectAvailable: boolean;
  message: boolean;
}

/**
 * Read what the profile top-card / open More-menu currently offers. `name` (the
 * profile owner's name, lowercased) scopes the Connect detection to THIS
 * profile so the right-rail "More profiles for you" recommendation cards — which
 * render their own "Invite <OtherName> to connect" *anchors* — can never be
 * mistaken for the subject's own Connect option.
 */
function readTopCard(page: Page, name: string): Promise<TopCardState> {
  return page.evaluate((nameL) => {
    let pending = false;
    let connectAvailable = false;
    let message = false;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[aria-label], button, a"));
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const label = (el.getAttribute("aria-label") || "").trim().toLowerCase();
      const text = (el.textContent || "").trim().toLowerCase();

      // Pending request — top-card "Pending" CTA (button or anchor) or the
      // "Withdraw invitation" item inside the More menu.
      if (/^pending\b/.test(text) || label.startsWith("pending") || /withdraw/.test(label) || text === "withdraw") {
        pending = true;
      }
      // A Connect option for THIS profile means it is NOT connected. Exclude
      // anchors (recommendation cards) and require the name to match when known.
      if (el.tagName !== "A" && /^invite .+ to connect$/.test(label)) {
        if (!nameL || label === `invite ${nameL} to connect`) connectAvailable = true;
      }
      // Message control — ambiguous on its own (shown on 2nd-degree too), only
      // decisive once we know no Connect option exists.
      if (el.tagName !== "A" && (/^message\b/.test(text) || label.startsWith("message"))) {
        message = true;
      }
    }
    return { pending, connectAvailable, message };
  }, name);
}

/** DOM-dispatch click the top-card "More actions" button to reveal overflow
 * items (Connect / Withdraw hide there when the primary CTA is Follow/Message). */
function openMoreMenu(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const more = Array.from(document.querySelectorAll<HTMLElement>("button")).find((b) => {
      const label = (b.getAttribute("aria-label") || b.textContent || "").trim().toLowerCase();
      if (!/^more( actions)?$/.test(label)) return false;
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!more) return false;
    more.click();
    return true;
  });
}

/**
 * Visit a LinkedIn profile and determine the current connection status.
 *
 * Priority (the presence of a Connect option is the reliable signal, not the
 * Message button — LinkedIn shows Message on 2nd-degree, not-connected profiles
 * too, so a Message-first check would wrongly report CONNECTED and prematurely
 * fire the SEQUENCE accept-branch):
 *   1. a pending request (top-card "Pending" or More-menu "Withdraw") → PENDING
 *   2. a Connect option for this profile (direct or in More)          → NONE
 *   3. otherwise a Message control with no Connect option             → CONNECTED
 *   4. nothing recognised                                             → NONE (safe default)
 *
 * Throws on a dead/guest session so the caller skips rather than recording a
 * bogus NONE (an unauthenticated render shows none of these controls).
 */
export async function checkConnectionStatus(
  page: Page,
  profileUrl: string
): Promise<DetectedConnectionStatus> {
  await navigateTo(page, profileUrl);
  await humanDelay(2_000, 4_000);

  const landedUrl = page.url();
  if (/\/(login|uas\/login|authwall|checkpoint)/.test(landedUrl)) {
    throw new Error(
      `LinkedIn redirected to ${landedUrl} instead of the profile page — session likely expired.`
    );
  }
  // Soft de-auth: normal URL but logged-out guest render (no authed nav).
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
      `LinkedIn rendered the logged-out guest view for ${profileUrl} — session not authenticated for this request.`
    );
  }

  const name = (
    await page.evaluate(() => {
      for (const el of Array.from(document.querySelectorAll("h1"))) {
        const t = (el.textContent || "").trim();
        if (t) return t;
      }
      return "";
    })
  ).toLowerCase();

  // Top-card, before opening any menu.
  let s = await readTopCard(page, name);
  if (s.pending) return "PENDING";
  if (s.connectAvailable) return "NONE";

  // Connect/Withdraw may be tucked in the More overflow menu (Follow-primary
  // layouts). Open it and re-read before trusting the Message signal.
  const messageOnTopCard = s.message;
  if (await openMoreMenu(page)) {
    await humanDelay(800, 1_500);
    s = await readTopCard(page, name);
    await page.keyboard.press("Escape").catch(() => {});
    if (s.pending) return "PENDING";
    if (s.connectAvailable) return "NONE";
  }

  if (messageOnTopCard || s.message) return "CONNECTED";
  return "NONE";
}
