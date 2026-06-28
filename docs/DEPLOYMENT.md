# Deployment Guide

This app should run as separate services in production:

- Dashboard: Next.js web service, currently configured for Render
- API: Express service, currently configured for Railway
- Worker: BullMQ worker service
- PostgreSQL: managed database
- Redis: managed queue backend

The API can start workers when `START_WORKERS=true`, but a separate worker
service is safer for production because queue load and browser automation can
be scaled independently.

## Required Environment Variables

Set these on the relevant services.

### API and Worker

```text
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
ENCRYPTION_KEY=64-character-hex-string
NODE_ENV=production
HEADLESS=false
ALLOWED_ORIGINS=https://your-dashboard.example.com
START_WORKERS=false
BROWSER_ARTIFACT_DIR=/tmp/linkedin-automation-artifacts
```

For the worker service:

```text
START_WORKERS=true
```

Or run the dedicated command:

```bash
pnpm --filter @linkedin-automation/queue workers
```

### Dashboard

```text
NEXT_PUBLIC_API_URL=https://your-api.example.com
```

`NEXT_PUBLIC_API_URL` is compiled into the browser bundle during `next build`.
If the API URL changes, update the Render environment variable and redeploy the
dashboard.

### Alerts

Use either webhook alerts:

```text
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Or email alerts:

```text
RESEND_API_KEY=re_...
ALERT_EMAIL_TO=ops@example.com
ALERT_EMAIL_FROM=alerts@your-domain.example
```

## Secrets Checklist

- `ENCRYPTION_KEY` is a 32-byte hex string and never changes after launch.
- `DATABASE_URL` uses TLS when required by the database provider.
- `REDIS_URL` points to a private or password-protected Redis instance.
- `ALLOWED_ORIGINS` is not `*` in production.
- Alert tokens and email API keys are stored only in the deployment secret
  manager.
- Proxy usernames and passwords are stored only through the app settings/forms
  and never committed.
- Browser traces/screenshots are treated as sensitive data because they can
  include LinkedIn session context.

## Database Release Steps

1. Back up the production database.
2. Build and typecheck the release:

   ```bash
   pnpm typecheck
   pnpm test
   pnpm build
   ```

3. Apply migrations:

   ```bash
   pnpm --filter @linkedin-automation/db exec dotenv -e ../../.env -- prisma migrate deploy
   ```

4. Start or roll the API service.
5. Start or roll the worker service.
6. Check `/health` on the API.
7. Check the Jobs page for failed/retried jobs.

## Render Dashboard Deployment

The root `render.yaml` deploys only the dashboard as a Render Node web service.
The API and worker can remain on Railway. It uses Render's free web-service
plan by default; upgrade the service plan later if cold starts become annoying.

1. Push the repository to GitHub.
2. In Render, create a new Blueprint from the repository.
3. Render will read `render.yaml` and create
   `linkedin-automation-dashboard`.
4. Set the required environment variable:

   ```text
   NEXT_PUBLIC_API_URL=https://your-api.up.railway.app
   ```

5. Deploy the service.
6. Copy the Render dashboard URL and add it to the Railway API service:

   ```text
   ALLOWED_ORIGINS=https://your-dashboard.onrender.com
   ```

7. Redeploy the Railway API after changing `ALLOWED_ORIGINS`.
8. Open the Render dashboard URL and sign up or log in.

If you use a custom domain on Render, set `ALLOWED_ORIGINS` to that custom
domain instead of the default `onrender.com` URL.

## Browser Runtime Notes

Production browser automation should run headed with a virtual display.

- Keep `HEADLESS=false`.
- Use Xvfb or a platform-provided virtual display.
- Keep one stable proxy profile per LinkedIn account.
- Persist browser artifacts somewhere operators can access during incidents.
- Never auto-login with a password. Resolve logins and checkpoints manually.

## Production Smoke Test

After every deploy:

1. Open dashboard and log in.
2. Check API `/health`.
3. Confirm Postgres and Redis are healthy.
4. Create or inspect a test account.
5. Run a proxy health check.
6. Queue one low-risk scrape job.
7. Confirm the worker picks up the job.
8. Confirm activity logs or job failure details appear in the dashboard.
9. Confirm alerts work from Settings.

## Operational Runbook

### Queue Failures

1. Open the Jobs page and filter to `failed`.
2. Inspect `failedReason` and job data.
3. Check worker logs for matching timestamps.
4. If the failure includes checkpoint or proxy mismatch, leave the account
   paused until a human verifies LinkedIn manually.

### Checkpoints

1. Do not retry automation immediately.
2. Manually open LinkedIn for the affected account.
3. Resolve the security prompt.
4. Mark the checkpoint resolved in the dashboard.
5. Resume the account only after the account can browse normally.

### Proxy Mismatch

1. Pause the account.
2. Confirm the provider is using sticky sessions.
3. Confirm the configured country/city matches the account history.
4. Run the proxy health check.
5. Resume only after the exit IP is stable.

## Pre-Launch Checklist

- README local setup has been tested on a clean machine.
- `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- Database migrations have been applied in a staging environment.
- API, dashboard, and worker are deployed as separate services.
- `ALLOWED_ORIGINS` is locked to the dashboard origin.
- Alerts are configured and tested.
- Browser traces/screenshots have retention and access controls.
- A real-account validation has passed with conservative caps.
- A rollback plan exists for API, dashboard, worker, and DB migration changes.
