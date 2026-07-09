import type { Page } from "playwright";
import { delays, humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

type ConnectLabelResult =
  | { ok: true; label: string }
  | { ok: false; reason: "none" | "ambiguous"; labels: string[] };

/**
 * Resolve the exact aria-label of the Connect control that belongs to THIS
 * profile — without clicking — and tag that exact element so the caller can act
 * on it (not a hidden pre-rendered duplicate).
 *
 * Safety — never invite the wrong person: several "Invite <Name> to connect"
 * controls can be on-screen at once (the right-rail "More profiles for you"
 * cards, "People also viewed", a sticky-header duplicate of the subject's own
 * button). The reliable discriminator is the **exact profile name**, NOT the
 * element tag: the subject's own direct Connect button is often an `<a>` anchor
 * — the same tag the recommendation cards use — so an anchor-exclusion would
 * wrongly skip the real button on Connect-primary profiles. We therefore match
 * `invite <name> to connect` exactly (any tag), preferring the largest visible
 * one when the subject's button is duplicated (top-card vs. condensed sticky
 * header). When the name is unknown we only proceed if every visible Connect
 * control names the same person (i.e. no recommendations to confuse it with) —
 * otherwise we refuse rather than guess.
 */
async function findConnectLabel(page: Page, profileName: string): Promise<ConnectLabelResult> {
  return page.evaluate((name) => {
    const wanted = name ? `invite ${name.toLowerCase()} to connect` : null;
    const labelOf = (el: HTMLElement) => (el.getAttribute("aria-label") || "").trim();
    const area = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return r.width * r.height;
    };
    const candidates = Array.from(document.querySelectorAll<HTMLElement>("[aria-label]")).filter((el) => {
      if (!/^invite .+ to connect$/.test(labelOf(el).toLowerCase())) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const choose = (el: HTMLElement) => {
      for (const prev of Array.from(document.querySelectorAll("[data-vectra-connect]"))) prev.removeAttribute("data-vectra-connect");
      el.setAttribute("data-vectra-connect", "1");
      return { ok: true as const, label: labelOf(el) };
    };
    const pickLargest = (els: HTMLElement[]) => els.slice().sort((a, b) => area(b) - area(a))[0];

    if (wanted) {
      const named = candidates.filter((el) => labelOf(el).toLowerCase() === wanted);
      if (named.length) return choose(pickLargest(named));
      // Name known but its Connect isn't on-screen yet (may be in the More menu).
      return { ok: false, reason: "none", labels: [] };
    }
    // Name unknown — safe only if there's nothing to confuse the subject with.
    if (candidates.length === 0) return { ok: false, reason: "none", labels: [] };
    const distinct = new Set(candidates.map((el) => labelOf(el).toLowerCase()));
    if (distinct.size === 1) return choose(pickLargest(candidates));
    return { ok: false, reason: "ambiguous", labels: [...distinct] };
  }, profileName);
}

/** DOM-dispatch click the profile top-card "More actions" button to open its
 * overflow menu (where Connect hides when the primary CTA is Follow/Message). */
async function openMoreMenu(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll<HTMLElement>("button"));
    // The visible "More actions" button; on initial load (no scroll) only the
    // top-card one is rendered/visible, not the sticky-header duplicate.
    const more = btns.find((b) => {
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

export async function sendConnect(
  page: Page,
  linkedinUrl: string,
  note?: string
): Promise<void> {
  await navigateTo(page, linkedinUrl);
  await delays.betweenActions();

  // A dead/expired session redirects to a login page instead of erroring,
  // which would otherwise surface as a confusing "Connect button not found"
  // — same lesson scrapeSearch.ts already learned.
  const landedUrl = page.url();
  if (/\/(login|uas\/login|authwall|checkpoint)/.test(landedUrl)) {
    throw new Error(
      `LinkedIn redirected to ${landedUrl} instead of the profile page — the session cookies are likely expired or invalid. Re-import fresh cookies for this account.`
    );
  }

  // Intermittently LinkedIn keeps the normal profile URL but renders the
  // logged-out *guest* view (Sign in / Join now / Continue with Google, no
  // authenticated global nav). This is a soft de-auth the URL check above can't
  // see; without this, sendConnect fails later with a misleading "no Connect
  // button" instead of correctly reporting the session as unauthenticated.
  const guestView = await page.evaluate(() => {
    const hasAuthedNav = !!document.querySelector(
      "img.global-nav__me-photo, .global-nav__me, [data-control-name='nav.settings']"
    );
    if (hasAuthedNav) return false;
    const bodyText = document.body?.innerText ?? "";
    const guestMarkers = /(Join now|Sign in with Email|Continue with Google|New to LinkedIn\?|Sign in to)/i;
    return guestMarkers.test(bodyText);
  });
  if (guestView) {
    throw new Error(
      `LinkedIn rendered the logged-out guest view for ${linkedinUrl} (URL did not redirect, but the page is unauthenticated) — the replayed session is not being treated as logged in for this request. Refresh the session/cookies before retrying.`
    );
  }

  // Read the profile owner's name — the exact-name match is the *primary* safety
  // guard against inviting the wrong person, so getting it right matters. The
  // top-card heading isn't reliably an <h1> in LinkedIn's obfuscated markup, so
  // prefer document.title ("<Name> | LinkedIn", sometimes "(N) <Name> | …"),
  // which is stable, and fall back to any non-empty <h1>.
  await page.locator("h1").first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
  const profileName = await page.evaluate(() => {
    const fromTitle = (document.title || "")
      .replace(/^\(\d+\+?\)\s*/, "")
      .split(" | ")[0]
      .trim();
    if (fromTitle && !/^linkedin$/i.test(fromTitle)) return fromTitle;
    for (const el of Array.from(document.querySelectorAll("h1"))) {
      const t = (el.textContent || "").trim();
      if (t) return t;
    }
    return "";
  });

  // "Connect" is either a direct top-level button, or tucked inside the
  // "More" overflow menu — which one LinkedIn shows varies per profile.
  let result = await findConnectLabel(page, profileName);
  if (!result.ok && result.reason === "none") {
    const opened = await openMoreMenu(page);
    if (!opened) throw new Error(`Neither a direct Connect button nor a "More" menu was found on ${linkedinUrl}`);
    await humanDelay(800, 1_500);
    result = await findConnectLabel(page, profileName);
  }
  if (!result.ok) {
    if (result.reason === "ambiguous") {
      throw new Error(
        `Refusing to send: multiple Connect controls are visible on ${linkedinUrl} and the profile name couldn't disambiguate them (${result.labels.join(" | ")}).`
      );
    }
    throw new Error(`Connect control not found on ${linkedinUrl} (already connected, or pending?)`);
  }

  // Activate the marked element by dispatching a full pointer/mouse event
  // sequence on it, re-finding it inside the page each attempt (a plain click,
  // or a focus+Enter, either misses the obfuscated dropdown <div>'s React
  // handler or re-renders/detaches the node between calls). The invite modal is
  // a role=dialog carrying invitation/Send text — a hidden always-present dialog
  // exists on the page, so match on that text, never bare [role=dialog].
  const dialog = page
    .locator("[role='dialog']")
    .filter({ hasText: /add a note|without a note|send (now|invitation)|invitation/i })
    .first();
  const fireOnMarked = () =>
    page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-vectra-connect="1"]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const init = { bubbles: true, cancelable: true, view: window, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 } as MouseEventInit;
      for (const type of ["pointerover", "pointerenter", "pointermove", "pointerdown", "mousedown", "focus", "pointerup", "mouseup", "click"]) {
        const Ctor = type.startsWith("pointer") && "PointerEvent" in window ? (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent : MouseEvent;
        el.dispatchEvent(new Ctor(type, init));
      }
      return true;
    });
  let opened = false;
  for (let attempt = 0; attempt < 3 && !opened; attempt++) {
    await fireOnMarked();
    opened = await dialog.waitFor({ state: "visible", timeout: 4_000 }).then(() => true).catch(() => false);
    if (!opened) {
      // The node may have re-rendered/detached; re-resolve and re-mark it.
      const re = await findConnectLabel(page, profileName);
      if (!re.ok) break;
      await humanDelay(400, 800);
    }
  }
  console.log(`[sendConnect] activated "${result.label}" — invite dialog open: ${opened}`);
  if (!opened) {
    // LinkedIn sometimes rejects the invite outright (a toast, no dialog).
    // Surface the specific reason rather than a generic "dialog never opened" —
    // these are business rules the engine should recognise, not code failures.
    const notice = await page.evaluate(() => {
      const t = document.body?.innerText ?? "";
      if (/Invitation not sent|resend an invitation|weeks? after withdrawing/i.test(t)) return "cooldown";
      if (/weekly invitation limit|reached the weekly|invitations? left this week/i.test(t)) return "weekly_limit";
      return "";
    });
    if (notice === "cooldown") {
      throw new Error(
        `LinkedIn declined the invite to "${result.label}": a request was recently withdrawn and can't be resent for ~3 weeks (LinkedIn re-invite cooldown) — not a code failure.`
      );
    }
    if (notice === "weekly_limit") {
      throw new Error(
        `LinkedIn declined the invite to "${result.label}": the account has hit LinkedIn's weekly invitation limit.`
      );
    }
    throw new Error(`Clicked Connect for "${result.label}" but the invite dialog never opened on ${linkedinUrl}.`);
  }

  if (note) {
    const addNoteBtn = dialog.locator("button:has-text('Add a note')");
    if (await addNoteBtn.count()) {
      await addNoteBtn.click();
      await humanDelay(1_000, 2_000);
      await page.locator("#custom-message").fill(note);
      await humanDelay(1_000, 2_000);
    }
  }

  const sendBtn = dialog
    .locator("button:has-text('Send without a note'), button:has-text('Send'), button[aria-label*='Send' i]")
    .first();
  await sendBtn.waitFor({ state: "visible", timeout: 10_000 });
  await sendBtn.click();
  await humanDelay(2_000, 4_000);
}
