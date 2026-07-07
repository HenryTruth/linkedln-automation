import type { Page } from "playwright";
import { delays, humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

type ConnectLabelResult =
  | { ok: true; label: string }
  | { ok: false; reason: "none" | "ambiguous"; labels: string[] };

/**
 * Resolve the exact aria-label of the Connect control that belongs to THIS
 * profile — without clicking. The caller then clicks it by that unique label
 * with a real Playwright click so LinkedIn's (React-delegated) menuitem handler
 * actually fires; a programmatic `el.click()` on the obfuscated dropdown <div>
 * bubbles but does not reliably trigger it.
 *
 * Safety — never invite the wrong person: the right-rail "More profiles for you"
 * cards each render their own visible "Invite <OtherName> to connect" control,
 * and the profile's own Connect item is portalled *outside* <main> when it
 * lives in the More menu, so neither a plain text match nor a `main`-scoped
 * selector can distinguish the intended person. Two discriminators are used
 * together: (1) the right-rail recommendation controls are always `<a>` anchors
 * whereas the profile's own Connect is a `<button>`/`<div role=button>` — so
 * anchors are excluded; (2) if the profile name is known, only the control whose
 * aria-label names *this* profile is eligible. If more than one non-anchor
 * "Invite … to connect" control is visible and we can't disambiguate by name,
 * we refuse rather than guess.
 */
async function findConnectLabel(page: Page, profileName: string): Promise<ConnectLabelResult> {
  return page.evaluate((name) => {
    const wanted = name ? `invite ${name.toLowerCase()} to connect` : null;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[aria-label]"));
    const candidates = nodes.filter((el) => {
      const label = (el.getAttribute("aria-label") || "").trim().toLowerCase();
      if (!/^invite .+ to connect$/.test(label)) return false;
      if (el.tagName === "A") return false; // right-rail recommendations are anchors
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const labelOf = (el: HTMLElement) => (el.getAttribute("aria-label") || "").trim();
    const choose = (el: HTMLElement) => {
      // Tag the exact element so the caller acts on *this* one, not a hidden
      // pre-rendered duplicate that a `[aria-label=…]` selector's .first() might
      // resolve to instead.
      for (const prev of Array.from(document.querySelectorAll("[data-vectra-connect]"))) prev.removeAttribute("data-vectra-connect");
      el.setAttribute("data-vectra-connect", "1");
      return { ok: true as const, label: labelOf(el) };
    };
    if (wanted) {
      const named = candidates.find((el) => labelOf(el).toLowerCase() === wanted);
      if (named) return choose(named);
    }
    if (candidates.length === 1) return choose(candidates[0]);
    if (candidates.length === 0) return { ok: false, reason: "none", labels: [] };
    return { ok: false, reason: "ambiguous", labels: candidates.map(labelOf) };
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

  // Best-effort read of the profile owner's name to tighten the Connect match
  // (the anchor-exclusion in clickConnectFor is the primary safety guard; the
  // name is an extra disambiguator when several profiles are on-screen). The
  // name lives in a top-card heading that hydrates after domcontentloaded and
  // isn't always an <h1>, so this is opportunistic, not required.
  await page.locator("h1").first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => {});
  const profileName = await page.evaluate(() => {
    for (const sel of ["h1", "main h1", "h1 span", "section h1"]) {
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const t = (el.textContent || "").trim();
        if (t) return t;
      }
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
