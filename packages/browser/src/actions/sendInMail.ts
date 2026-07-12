import type { Page, Locator } from "playwright";
import { delays, humanDelay } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

export interface SendInMailOptions {
  /**
   * Route through Sales Navigator (`/sales/lead/…`) instead of regular
   * LinkedIn. Required to InMail non-connections who are not Open Profiles —
   * on regular linkedin.com those people only expose a "Connect" button, no
   * InMail. Set from the account's `salesNavigatorEnabled` flag.
   */
  salesNavigator?: boolean;
}

function isSalesNavLeadUrl(url: string): boolean {
  return /linkedin\.com\/sales\/(lead|people)\//.test(url);
}

async function fillFirstAvailable(locators: Locator[], value: string): Promise<boolean> {
  for (const locator of locators) {
    try {
      const field = locator.first();
      await field.waitFor({ timeout: 2_500 });
      // `fill` focuses via JS and sets the value — no pointer click, so a
      // ghost-placeholder overlay (e.g. Sales Nav's "draft with AI") can't
      // intercept it the way `.click()` gets intercepted.
      await field.fill(value);
      return true;
    } catch {
      // Try the next known InMail layout.
    }
  }
  return false;
}

async function typeInto(box: Locator, text: string): Promise<void> {
  // Focus via JS rather than a pointer click: the Sales Nav message textarea sits
  // under a "draft with AI" ghost-placeholder that intercepts pointer events but
  // not keyboard input into the focused element.
  await box.evaluate((el) => (el as HTMLElement).focus());
  await humanDelay(400, 900);
  for (const char of text) {
    await box.pressSequentially(char, { delay: 30 + Math.random() * 70 });
  }
}

/**
 * Guest/logged-out render detector — the same soft de-auth that hits sendConnect
 * strikes Sales Nav too (LinkedIn serves a "session has expired" overlay without
 * redirecting). Fail loudly instead of timing out on a missing button.
 */
async function assertAuthenticated(page: Page): Promise<void> {
  const deauthed = await page.evaluate(() => {
    const text = document.body?.innerText ?? "";
    return (
      /your session has expired|sign in|join now/i.test(text) &&
      !document.querySelector("[data-anchor-send-inmail], .msg-form__contenteditable")
    );
  });
  if (deauthed) {
    throw new Error("Session not authenticated for this request (Sales Nav guest/expired view).");
  }
}

/**
 * Regular-LinkedIn InMail: only works on Open Profiles (they surface a free
 * InMail/Message button on the `/in/` page). Unchanged from the original flow.
 */
async function sendRegularInMail(
  page: Page,
  linkedinUrl: string,
  subject: string,
  messageBody: string
): Promise<void> {
  await navigateTo(page, linkedinUrl);
  await delays.betweenActions();

  const inMailBtn = page
    .locator("button:has-text('InMail'), a:has-text('InMail')")
    .first();
  await inMailBtn.waitFor({ timeout: 10_000 });
  await inMailBtn.click();
  await humanDelay(1_500, 3_000);

  const subjectFilled = await fillFirstAvailable(
    [
      page.locator("input[name='subject']"),
      page.locator("input[aria-label*='Subject']"),
      page.locator("input[placeholder*='Subject']"),
    ],
    subject
  );

  if (!subjectFilled) {
    throw new Error("InMail composer opened, but no subject field was found.");
  }

  const messageBox = page
    .locator(
      ".msg-form__contenteditable, div[role='textbox'], textarea[name='message']"
    )
    .first();
  await messageBox.waitFor({ timeout: 8_000 });
  await typeInto(messageBox, messageBody);

  await humanDelay(1_000, 2_000);

  const sendBtn = page
    .locator("button[type='submit']:has-text('Send'), button:has-text('Send InMail')")
    .first();
  await sendBtn.click();
  await humanDelay(2_000, 3_000);
}

/**
 * Sales-Navigator InMail: the account's Sales Nav lead page (`/sales/lead/…`)
 * exposes a `button[data-anchor-send-inmail]` labelled "Message" that opens the
 * standard LinkedIn messaging overlay (the same "draft with AI" composer as
 * regular messaging). For a non-connection this composer includes a Subject
 * field and consumes an InMail credit; for an existing connection it's a plain
 * message with no subject. We fill the subject only if present, always fill the
 * body, then send.
 *
 * Grounding: confirmed from live read-only probes against the real account
 * (2026-07-12). Entry button `button[data-anchor-send-inmail]` ("Message"). For a
 * NON-connection (real InMail) the composer is a Sales-Nav form with a required
 * Subject `<input aria-label="Subject (required)">` and a `<textarea name="message">`
 * body (NOT the `.msg-form__contenteditable` overlay — that's what a 1st-degree
 * connection gets, no subject). The Send `button[data-sales-action]` is disabled
 * until subject+body are valid, so Playwright's click auto-waits for it to enable
 * — a failed subject/body fill fails loudly instead of sending blank. Consumes an
 * InMail credit. Selectors below prefer stable attributes over the obfuscated
 * per-build class hashes (`_message-field_jrrmou`, etc.).
 *
 * NOT yet verified end-to-end: a real Send click landing (every probe session
 * de-authed at the compose step). Catch a healthy window before trusting on prod.
 */
async function sendSalesNavInMail(
  page: Page,
  salesLeadUrl: string,
  subject: string,
  messageBody: string
): Promise<void> {
  await page.goto(salesLeadUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await humanDelay(4_000, 6_000); // Sales Nav is a heavy SPA — let it hydrate.
  await assertAuthenticated(page);

  const messageBtn = page.locator("button[data-anchor-send-inmail]").first();
  await messageBtn.waitFor({ timeout: 12_000 });
  await messageBtn.click();
  await humanDelay(2_000, 4_000);
  await assertAuthenticated(page);

  // Subject is required for a non-connection InMail, absent for a connection's
  // plain message. Best-effort fill; the Send button's disabled state is the real
  // gate (it stays disabled if the required subject wasn't filled).
  await fillFirstAvailable(
    [
      page.locator("input[aria-label*='Subject']"),
      page.locator("input[placeholder*='Subject']"),
      page.locator("input[name='subject'], input[id*='subject']"),
    ],
    subject
  );

  // Non-connection InMail body is a <textarea name="message">; a connection's
  // message body is the .msg-form__contenteditable overlay — support both.
  const messageBox = page
    .locator(
      "textarea[name='message'], textarea[aria-label*='message'], .msg-form__contenteditable, div[role='textbox'][contenteditable='true']"
    )
    .first();
  await messageBox.waitFor({ timeout: 12_000 });
  // Fill instantly rather than char-by-char: on a flagged Sales-Nav account the
  // session token rotates within seconds and dies at the heavy send call, so
  // minimising in-composer time matters more than human-like keystrokes here.
  // `fill` focuses via JS (bypasses the "draft with AI" ghost overlay) and fires
  // the input event React needs to enable the Send button.
  await messageBox.fill(messageBody);
  await humanDelay(600, 1_200);

  const sendBtn = page
    .locator(
      "button[data-sales-action]:has-text('Send'), button.msg-form__send-button, button[type='submit']:has-text('Send'), button:has-text('Send message')"
    )
    .first();
  await sendBtn.click();

  // Verify the send actually landed. A bare click "succeeds" even when the
  // session expired at that instant (LinkedIn overlays "Your session has
  // expired" and never submits) — so confirm the composer accepted it: the
  // message field should clear/close, and no expired-session overlay should show.
  await humanDelay(1_500, 2_500);
  const sendState = await page.evaluate(() => {
    const text = document.body?.innerText ?? "";
    const expired = /your session has expired|requires a refresh|sign in to sales navigator/i.test(text);
    const box = document.querySelector<HTMLTextAreaElement>(
      "textarea[name='message'], textarea[aria-label*='message']"
    );
    const stillHasDraft = Boolean(box && box.value.trim().length > 0);
    return { expired, stillHasDraft };
  });
  if (sendState.expired) {
    throw new Error("Session expired at the send step — InMail was NOT sent.");
  }
  if (sendState.stillHasDraft) {
    throw new Error("Send clicked but the draft is still in the composer — InMail likely NOT sent.");
  }
}

export async function sendInMail(
  page: Page,
  linkedinUrl: string,
  subject: string,
  messageBody: string,
  options: SendInMailOptions = {}
): Promise<void> {
  if (options.salesNavigator) {
    if (!isSalesNavLeadUrl(linkedinUrl)) {
      // Leads store regular `/in/` URLs; resolving those to a `/sales/lead/…`
      // URL (the "View in Sales Navigator" bridge) is not yet implemented —
      // it needs its own verified probe. Until then, an INMAIL-via-Sales-Nav
      // campaign must be fed `/sales/lead/…` URLs directly.
      throw new Error(
        "Sales Navigator InMail requires a /sales/lead/ URL; the /in/ → /sales/lead bridge is not implemented yet."
      );
    }
    await sendSalesNavInMail(page, linkedinUrl, subject, messageBody);
    return;
  }

  await sendRegularInMail(page, linkedinUrl, subject, messageBody);
}
