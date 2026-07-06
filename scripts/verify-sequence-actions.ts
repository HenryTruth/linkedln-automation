/**
 * Standalone verification harness for the two new SEQUENCE-engine browser
 * actions (likePost, withdrawConnection) against a real LinkedIn account,
 * before any queue/engine code depends on them.
 *
 * The account must already be set up the same way the README's "Real Account
 * Validation Checklist" describes: cookies uploaded via the dashboard's
 * Accounts page, and (unless REQUIRE_PROXY=false) a healthy proxy attached.
 *
 * Usage (run from repo root):
 *   pnpm --filter @linkedin-automation/db exec dotenv -e ../../.env -- \
 *     npx tsx ../../scripts/verify-sequence-actions.ts <accountId> like <postUrl>
 *   pnpm --filter @linkedin-automation/db exec dotenv -e ../../.env -- \
 *     npx tsx ../../scripts/verify-sequence-actions.ts <accountId> withdraw <profileUrl>
 */
import { BrowserWorker, likePost, withdrawConnection } from "@linkedin-automation/browser";

async function main() {
  const [accountId, action, url] = process.argv.slice(2);

  if (!accountId || !action || !url) {
    console.error(
      "Usage: tsx verify-sequence-actions.ts <accountId> <like|withdraw> <url>"
    );
    process.exit(1);
  }

  if (action !== "like" && action !== "withdraw") {
    console.error(`Unknown action "${action}" — expected "like" or "withdraw"`);
    process.exit(1);
  }

  const worker = new BrowserWorker(accountId);
  try {
    console.log(`Launching browser for account ${accountId}...`);
    await worker.launch();
    const page = await worker.getPage();

    console.log(`Running "${action}" against ${url}...`);
    const result =
      action === "like" ? await likePost(page, url) : await withdrawConnection(page, url);

    console.log(`Result: ${result}`);
  } catch (err) {
    console.error("FAILED:", err);
    const artifactPath = await worker.captureFailureArtifacts(`verify-${action}`);
    if (artifactPath) console.error("Failure artifact saved to:", artifactPath);
    process.exitCode = 1;
  } finally {
    await worker.close();
  }
}

main();
