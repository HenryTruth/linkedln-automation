# LinkedIn Automation

A safety-first LinkedIn automation dashboard for managing accounts, proxies,
campaigns, lead scraping, content-signal targeting, message sequences,
checkpoints, activity logs, and queue jobs.

> Important: this project automates interactions with LinkedIn. Use it only with
> accounts you control, respect platform rules, and keep conservative limits.
> The default guardrails are intentionally cautious.

## What Is Included

- Next.js dashboard in `apps/dashboard`
- Express API in `apps/api`
- Prisma/PostgreSQL data layer in `packages/db`
- BullMQ/Redis queues and workers in `packages/queue`
- Playwright browser automation in `packages/browser`
- Safety guards, caps, alerting, template validation, and anomaly checks in
  `packages/guards`

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop or another local Docker runtime
- PostgreSQL and Redis, usually via `docker-compose.yml`

## Local Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create local environment files:

   ```bash
   cp .env.example .env
   cp apps/dashboard/.env.example apps/dashboard/.env.local
   ```

3. Generate a cookie encryption key and paste it into `.env`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Start Postgres and Redis:

   ```bash
   docker compose up -d postgres redis
   ```

5. Generate Prisma client:

   ```bash
   pnpm db:generate
   ```

6. Apply existing migrations:

   ```bash
   pnpm --filter @linkedin-automation/db exec dotenv -e ../../.env -- prisma migrate deploy
   ```

7. Start the API:

   ```bash
   pnpm dev:api
   ```

   In local development, the API starts queue workers unless
   `START_WORKERS=false` is set.

8. Start the dashboard in another terminal:

   ```bash
   pnpm dev:dashboard
   ```

9. Open the dashboard:

   ```text
   http://localhost:3000
   ```

## Useful Commands

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm db:studio
pnpm --filter @linkedin-automation/queue workers
```

## Local Smoke Test

Run this after local setup to make sure the application is wired together.

1. Confirm containers are healthy:

   ```bash
   docker compose ps
   ```

2. Confirm the API health endpoint:

   ```bash
   curl http://localhost:3001/health
   ```

   Expected: `ok: true` with `database` and `redis` checks set to `true`.

3. Create a dashboard user through `http://localhost:3000/signup`.

4. Add a LinkedIn account on the Accounts page.

5. Add a proxy on the Proxies page, then run the proxy health check.

6. Create a campaign and add one test lead.

7. Start the campaign and check the Jobs page for queued jobs.

8. Check Activity and Checkpoints pages after workers run.

## Real Account Validation Checklist

This part cannot be safely faked by unit tests. Use a controlled account and a
low-risk test campaign.

1. Add an account with a stable timezone, user agent, viewport, and proxy.
2. Log in manually to LinkedIn in a normal browser session.
3. Export the account cookies as JSON and upload them from the Accounts page.
4. Verify the worker can load LinkedIn using the saved cookies.
5. Run a proxy health check and confirm the exit IP remains stable.
6. Scrape one known profile.
7. Scrape one LinkedIn search URL with a very small result set.
8. Send one connection request to a profile you control or have permission to
   test against.
9. Send one message only after the lead is connected.
10. Force or simulate a checkpoint and confirm the account pauses, a checkpoint
    is recorded, and alerts fire.
11. Resolve the checkpoint manually, then resume the account from the dashboard.

Keep `dailyLimit` and account caps low during validation.

## Proxy Policy

Browser automation requires a stable residential proxy by default. You can add a
LinkedIn account before assigning a proxy, but workers will block browser
sessions until one is attached. For local-only diagnostics, set
`REQUIRE_PROXY=false`.

Use the proxy location the account normally logs in from. The dashboard warns
when the account timezone and proxy country look mismatched, but the user should
make the final choice because they know the account's normal login history.

Proxy-Cheap imports are supported for purchased Static Residential (ISP)
proxies. Set `PROXY_CHEAP_API_KEY` and `PROXY_CHEAP_API_SECRET`, then use the
Proxies page to load and import active residential IPv4 proxies. The importer
blocks rotating, datacenter, inactive, and IPv6 entries because they do not meet
the session-stability policy for LinkedIn accounts.

For a future managed proxy add-on, do not infer location silently. Ask the user
for the account's normal login country, city or region, and timezone, then
provision a sticky residential proxy in that geography and keep it bound to the
same LinkedIn account. If that location is unavailable, ask the user to approve a
nearby fallback before any automation runs.

## Test Coverage

Current tests cover:

- Template rendering
- Same-company throttling
- Sequence dispatch behavior
- API route contracts for auth, accounts, campaigns, lead CSV import, and job
  scoping

Run all tests:

```bash
pnpm test
```

## Project Structure

```text
apps/api           Express API
apps/dashboard     Next.js dashboard
packages/browser   Playwright worker/session/actions
packages/db        Prisma schema, client, migrations
packages/guards    Safety checks and alerting
packages/queue     BullMQ queues, processors, schedulers
```

## Production Docs

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for deployment topology, secrets,
and release checks.
