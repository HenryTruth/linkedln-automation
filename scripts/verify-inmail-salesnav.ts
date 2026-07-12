/**
 * Live verification of the Sales-Navigator InMail send path against the real
 * test account. Drives the actual production `sendInMail(..., { salesNavigator:
 * true })` through a real BrowserWorker (proxy + cookie replay), then restores
 * the account to its exact original state.
 *
 * This SENDS A REAL INMAIL — outward-facing, consumes an InMail credit, cannot
 * be un-sent. Only run with an explicit subject + body the user has approved,
 * against a lead the user has authorized.
 *
 * Safety:
 *  - Captures {status, userAgent, salesNavigatorEnabled, dailyCaps} BEFORE any
 *    write and restores those exact values in `finally` (success or failure).
 *  - Temporarily sets status=ACTIVE (BrowserWorker refuses PAUSED),
 *    salesNavigatorEnabled=true (inmail path requires it), and a macOS UA to
 *    match the host. All reverted at the end.
 *  - Saves the provided cookie export to the account so BrowserWorker loads it,
 *    then leaves the stored session as-is (a dead session can't be worse than
 *    the stale one already there; worker.close only persists if still authed).
 *
 * Usage (rebuild browser dist first — tsx loads dist, not source):
 *   pnpm --filter @linkedin-automation/browser build
 *   DATABASE_URL=... ENCRYPTION_KEY=... REDIS_URL=... HEADLESS=false REQUIRE_PROXY=true \
 *     npx tsx scripts/verify-inmail-salesnav.ts <accountId> <salesLeadUrl> <cookiesFile> <subject> <body>
 */
import { readFile } from "node:fs/promises";
import { prisma } from "@linkedin-automation/db";
import { BrowserWorker, saveCookies, sendInMail } from "@linkedin-automation/browser";
import type { Cookie } from "playwright";

const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function convertRawExport(raw: Array<Record<string, unknown>>): Cookie[] {
  return raw.map((c) => {
    const cookie: Record<string, unknown> = {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path ?? "/",
      httpOnly: Boolean(c.httpOnly),
      secure: Boolean(c.secure),
    };
    if (!c.session && typeof c.expirationDate === "number") cookie.expires = c.expirationDate;
    const s = String(c.sameSite ?? "").toLowerCase().replace(/[_\s-]/g, "");
    if (s === "strict") cookie.sameSite = "Strict";
    else if (s === "lax") cookie.sameSite = "Lax";
    else if (s === "none" || s === "norestriction") cookie.sameSite = "None";
    return cookie as unknown as Cookie;
  });
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.log(`  (db attempt ${i + 1} failed, retrying in 3s)`);
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
  throw lastErr;
}

async function main() {
  const [accountId, salesLeadUrl, cookiesFile, subject, body] = process.argv.slice(2);
  if (!accountId || !salesLeadUrl || !cookiesFile || !subject || !body) {
    console.error(
      "Usage: tsx verify-inmail-salesnav.ts <accountId> <salesLeadUrl> <cookiesFile> <subject> <body>"
    );
    process.exit(1);
  }
  if (!/\/sales\/(lead|people)\//.test(salesLeadUrl)) {
    console.error("Refusing: salesLeadUrl must be a /sales/lead/ URL.");
    process.exit(1);
  }

  const original = await withRetry(() =>
    prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { status: true, userAgent: true, salesNavigatorEnabled: true, dailyCaps: true },
    })
  );
  console.log("Captured original state:", JSON.stringify(original));

  const raw = JSON.parse(await readFile(cookiesFile, "utf8"));
  const jar = convertRawExport(Array.isArray(raw) ? raw : raw.cookies);
  console.log(`Loaded ${jar.length} cookies; li_at prefix ${jar.find((c) => c.name === "li_at")?.value.slice(0, 6)}`);

  console.log(`\nSubject: ${subject}`);
  console.log(`Body:\n${body}\n`);
  console.log(`Recipient lead: ${salesLeadUrl}`);
  console.log("=== SENDING REAL INMAIL in 3s ===");
  await new Promise((r) => setTimeout(r, 3_000));

  const worker = new BrowserWorker(accountId);
  try {
    await withRetry(() => saveCookies(accountId, jar));
    await withRetry(() =>
      prisma.account.update({
        where: { id: accountId },
        data: { status: "ACTIVE", salesNavigatorEnabled: true, userAgent: MAC_UA },
      })
    );

    await worker.launch();
    const page = await worker.getPage();
    await sendInMail(page, salesLeadUrl, subject, body, { salesNavigator: true });
    console.log("\n✅ sendInMail returned without error — InMail send attempted.");
  } catch (err) {
    console.error("\n❌ FAILED:", err);
    const artifact = await worker.captureFailureArtifacts("verify-inmail-salesnav");
    if (artifact) console.error("Artifact:", artifact);
    process.exitCode = 1;
  } finally {
    await worker.close();
    // Restore the exact original account state, no matter what happened.
    await withRetry(() =>
      prisma.account.update({
        where: { id: accountId },
        data: {
          status: original.status,
          userAgent: original.userAgent,
          salesNavigatorEnabled: original.salesNavigatorEnabled,
          dailyCaps: original.dailyCaps as object,
        },
      })
    );
    console.log("Restored original account state.");
    await prisma.$disconnect();
  }
}

main();
