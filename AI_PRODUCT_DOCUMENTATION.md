# AI Product Documentation: Vectra Control Outreach

## 1. Product Summary

Vectra Control Outreach is a safety-first LinkedIn automation platform for managing outreach operations across LinkedIn accounts, proxies, leads, campaigns, browser sessions, queue jobs, checkpoints, and activity logs.

The product is designed for operators who need controlled LinkedIn prospecting workflows without blindly maximizing volume. Its core promise is not "send as much as possible"; it is "run LinkedIn outreach with account protection, visibility, and conservative guardrails."

The application supports:

- LinkedIn account management
- Residential proxy management and health checks
- Saved LinkedIn cookie sessions
- Lead import, scraping, and qualification
- Connection request campaigns
- Follow-up message campaigns
- Sales Navigator InMail campaigns
- Scrape-only campaigns
- Content Signal campaigns based on recent LinkedIn posts
- Visual multi-step sequence campaigns
- LinkedIn post drafting, scheduling, and publishing records
- Queue/job monitoring
- Rate-limit monitoring
- Checkpoint detection and manual resolution
- Webhook alert settings
- Activity/audit logging

Important safety note: this product automates LinkedIn interactions. It should only be used with accounts the operator controls, with conservative limits, stable proxies, and respect for platform rules.

## 2. Product Name and Positioning

The repository is named `linkedin-automation`, but the product-facing name in the user manual and dashboard copy is `Vectra Control Outreach`.

Positioning:

Vectra is a LinkedIn outreach cockpit for safer account-based automation. It combines campaign execution, lead sourcing, proxy discipline, queue visibility, and risk controls in one dashboard.

Primary user:

- A growth, sales, recruiting, or agency operator running controlled LinkedIn outreach.

Secondary user:

- A technical operator or developer maintaining the automation stack, worker processes, proxies, cookies, and deployment.

## 3. Core Concepts

### User

A dashboard user owns their own accounts, proxies, leads, posts, campaigns, sessions, and data. API routes are protected by authentication, and most records are scoped by `userId`.

### LinkedIn Account

An account represents one LinkedIn identity. It stores:

- LinkedIn email
- status: `ACTIVE`, `PAUSED`, or `RESTRICTED`
- warm-up phase: `MANUAL`, `WEEK2`, `WEEK3`, `WEEK4`, or `FULL`
- timezone and active-hour schedule
- daily and monthly cap state
- maximum daily cap overrides
- Sales Navigator / InMail settings
- assigned proxy
- encrypted LinkedIn session cookies
- browser profile health state
- checkpoints and activity logs

Automation requires a stable session and should use a healthy residential proxy.

### Proxy

A proxy is a residential or static ISP proxy profile assigned to LinkedIn accounts. The product expects account/proxy geography to match the account's normal login pattern.

Proxy fields include:

- host
- port
- country
- city
- username/password
- username template for sticky sessions
- rotation mode: `STATIC` or `STICKY_SESSION`
- health status: `HEALTHY`, `DEGRADED`, or `DEAD`
- current session ID and exit IP

Proxy-Cheap import support exists for active static residential IPv4 proxies. The importer rejects rotating, datacenter, inactive, and IPv6 proxies.

### Lead

A lead is a LinkedIn or Sales Navigator profile stored in the system.

Lead sources:

- `MANUAL`
- `CSV`
- `LINKEDIN_SEARCH`
- `SALES_NAVIGATOR`
- `CONTENT_SIGNAL`

Lead fields include:

- LinkedIn URL
- first name
- last name
- title
- company
- connection status: `NONE`, `PENDING`, `CONNECTED`, `WITHDRAWN`
- blacklist flag and reason
- optional account assignment

### Campaign

A campaign defines what should happen to a set of leads under one LinkedIn account.

Campaign types:

- `CONNECT`: send LinkedIn connection requests.
- `MESSAGE`: send follow-up messages to already-connected leads.
- `INMAIL`: send Sales Navigator InMail messages.
- `SCRAPE`: scrape LinkedIn or Sales Navigator profiles/search results without outreach.
- `CONTENT_SIGNAL`: discover people who posted about a topic and store their post context.
- `SEQUENCE`: run a visual, multi-step graph workflow.

Campaign fields include:

- name
- account
- type
- status: `ACTIVE`, `PAUSED`, or `COMPLETED`
- daily limit
- optional target timezone
- optional connection note template
- attached leads
- message templates
- content signal config
- sequence graph steps and edges

### Campaign Lead

`CampaignLead` is the join record between a campaign and a lead. It tracks execution state:

- stage
- variant group
- last action time
- next action time
- reply time
- job status: `IDLE`, `QUEUED`, `RUNNING`, `SENT`, `SKIPPED`, `FAILED`
- last job error
- queued job ID
- associated post signal
- current sequence step, for graph campaigns
- branch waiting timestamp, for sequence accepted/timeout branching

### Message

Message records are linear templates for legacy `MESSAGE` and `INMAIL` workflows.

They include:

- sequence order
- subject template, optional
- body template
- variant group
- delay in days

### Sequence Graph

Sequence campaigns use graph-based steps and edges instead of a fixed campaign type.

Supported step types:

- `SCRAPE_SEARCH`: currently used as "Refresh Profile Data" for the lead's own profile in a sequence context.
- `VISIT_PROFILE`
- `LIKE_POST`
- `WAIT`
- `SEND_CONNECTION_REQUEST`
- `SEND_MESSAGE`
- `SEND_INMAIL`
- `WITHDRAW_CONNECTION`

Supported edge conditions:

- `DEFAULT`
- `CONNECTION_ACCEPTED`
- `CONNECTION_TIMEOUT`

The graph is intentionally constrained:

- exactly one entry step
- no cycles
- no arbitrary branching language
- one edge per condition from each step
- connection request branching only supports accepted vs timed out
- graph structure should be edited while the campaign is paused

## 4. Main User Workflows

### First-Time Setup

1. Sign up or log in.
2. Add a residential proxy.
3. Run a proxy health check.
4. Add a LinkedIn account.
5. Match the account timezone to normal login geography.
6. Assign the proxy.
7. Save LinkedIn cookies exported from a browser.
8. Confirm account/session health.
9. Add or import leads.
10. Create a campaign.
11. Start with low daily limits.
12. Monitor jobs, activity, rate limits, and checkpoints.

### Lead Management

Operators can:

- add a single lead manually
- import CSV leads
- export leads
- attach saved leads to campaigns
- collect leads from LinkedIn search URLs
- collect leads from Sales Navigator search/list URLs
- blacklist leads
- view individual lead details

CSV import accepts LinkedIn URL aliases such as:

- `url`
- `linkedinUrl`
- `linkedin_url`
- `linkedin url`
- `profile url`
- `profileUrl`

Optional CSV columns:

- `firstName`
- `lastName`
- `company`
- `title`

### Connection Campaign

Purpose: send connection requests to unconnected LinkedIn profiles.

Connection notes can use variables:

- `{{firstName}}`
- `{{lastName}}`
- `{{company}}`
- `{{title}}`

LinkedIn connection notes are limited to 300 characters.

### Message Campaign

Purpose: send follow-up messages to first-degree LinkedIn connections.

Important rule: direct messages require the lead to be connected. Unconnected leads should be skipped or treated as mismatched.

Message campaigns use a linear message sequence with delays.

### InMail Campaign

Purpose: send Sales Navigator InMail.

Requirements:

- the account must have real Sales Navigator access
- `salesNavigatorEnabled` must be enabled in Vectra
- the account must have available InMail allowance
- lead URLs should usually be Sales Navigator lead URLs or profiles where InMail is available

InMail is distinct from normal direct messages and connection requests.

### Scrape Campaign

Purpose: collect profile or search result data without sending outreach.

Supported sources:

- LinkedIn people search URLs
- Sales Navigator people search/list URLs
- individual profile URLs

Sales Navigator scraping is blocked unless the account has Sales Navigator enabled.

### Content Signal Campaign

Purpose: find people who recently posted about a keyword/topic.

Config fields:

- keyword
- date range in days
- max leads
- title filter
- company filter
- location filter
- connection note template
- pagination controls
- auto-continue controls

The system stores matching post context as `PostSignal` records:

- post URL
- excerpt
- keyword
- published date
- associated lead and campaign

This enables personalized outreach that references a recent post.

### Sequence Campaign

Purpose: run a visual multi-step workflow, similar to an automation canvas.

Example workflow:

1. Visit profile.
2. Like a post.
3. Wait several days.
4. Send a connection request.
5. If accepted, send a thank-you message.
6. If not accepted after a timeout, withdraw the request.

Sequence execution is handled by a separate queue engine and graph walker. It reuses existing action processors where possible.

## 5. Safety and Guardrails

Safety is central to the product. The system should preserve these rules unless explicitly changing the risk model.

### Daily Caps

Default system caps:

- connections: 15/day
- messages: 40/day
- InMails: 10/day
- profile views: 60/day
- search pages: 10/day

Hard ceilings:

- connections: 50/day
- messages: 150/day
- InMails: 50/day
- profile views: 250/day
- search pages: 40/day

Per-account overrides are clamped to hard ceilings.

### Warm-Up Phases

Warm-up caps:

- `MANUAL`: no automation
- `WEEK2`: 5 connections, 0 messages, 0 InMails, 20 profile views, 5 search pages
- `WEEK3`: 10 connections, 5 messages, 2 InMails, 40 profile views, 15 search pages
- `WEEK4`: 12 connections, 20 messages, 5 InMails, 50 profile views, 25 search pages
- `FULL`: 15 connections, 40 messages, 10 InMails, 60 profile views, 40 search pages

### Active Hours

Actions are restricted to 8am-7pm in the account or campaign target timezone.

Weekend volume is reduced to 50% of normal.

### Checkpoint Penalty

Accounts with 2 or more checkpoints in the last 30 days run at 50% of normal caps.

### Proxy Requirement

Browser automation requires a stable residential proxy by default. A worker should block browser jobs if the account has no proxy unless explicitly configured for local diagnostics.

### Session Policy

Vectra uses saved cookies. It does not automate LinkedIn login.

If LinkedIn redirects to checkpoint, authwall, login, or similar pages, the account is treated as needing human attention.

### Checkpoint Handling

When a checkpoint is detected:

- the account is paused or restricted
- a checkpoint record is created
- automation for that account should stop
- the operator must resolve LinkedIn manually
- the checkpoint can then be marked resolved in the dashboard

### Message Safety

The guards package includes:

- template rendering validation
- body hash deduplication
- same-company throttling
- anomaly checks
- daily cap checks
- warm-up checks
- active-hour checks

Known deduplication intent:

- avoid sending the same body too many times in one day
- avoid rapid messaging to people at the same company

## 6. System Architecture

This is a TypeScript pnpm monorepo.

Top-level structure:

- `apps/dashboard`: Next.js dashboard UI
- `apps/api`: Express API
- `packages/db`: Prisma/PostgreSQL schema, client, and migrations
- `packages/queue`: BullMQ/Redis queues, workers, processors, schedulers
- `packages/browser`: Playwright browser session and LinkedIn actions
- `packages/guards`: safety checks, caps, warm-up, anomaly, alerting, templates
- `docs`: deployment and implementation notes
- `scripts`: local verification scripts

### Frontend

Dashboard stack:

- Next.js 14
- React 18
- Tailwind CSS
- React Flow via `@xyflow/react` for sequence graph editing
- `sonner` for notifications

Main dashboard pages:

- `/`: marketing/product landing page
- `/dashboard`: operating overview
- `/accounts`
- `/proxies`
- `/leads`
- `/leads/[id]`
- `/campaigns`
- `/campaigns/new`
- `/campaigns/[id]`
- `/posts`
- `/jobs`
- `/activity`
- `/rate-limits`
- `/checkpoints`
- `/settings`
- `/login`
- `/signup`

### API

API stack:

- Express
- TypeScript ESM
- Zod validation
- Prisma client
- Bearer token auth
- global JSON body limit of 5 MB
- configurable CORS via `ALLOWED_ORIGINS`
- API rate limiting middleware

Important route groups:

- `/auth`: signup, login, me, logout
- `/accounts`: account CRUD, pause/resume, cookies, warm-up, caps
- `/accounts/:id/browser-session/*`: manual browser session controls and search qualification
- `/proxies`: proxy CRUD, Proxy-Cheap import, health check
- `/leads`: lead CRUD/import/export/search collection/blacklist
- `/campaigns`: campaign CRUD, duplicate, start, stats, leads, messages, search jobs
- `/campaigns/:id/graph`: sequence graph get/save
- `/content-signal`: content signal config, run, jobs, signals, cursor reset
- `/posts`: LinkedIn post draft/generate/schedule/publish/delete records
- `/jobs`: queue job listing and failed-job clearing
- `/activity`: activity listing and CSV export
- `/checkpoints`: list and resolve checkpoints
- `/stats`: dashboard metrics
- `/settings`: alert settings and test alert

### Database

Database stack:

- PostgreSQL
- Prisma ORM

Core models:

- `User`
- `AuthSession`
- `Account`
- `Proxy`
- `Lead`
- `Campaign`
- `CampaignLead`
- `Message`
- `SequenceStep`
- `SequenceEdge`
- `ActivityLog`
- `Checkpoint`
- `ContentSignalConfig`
- `PostSignal`
- `SystemSetting`
- `LinkedInPost`
- `PostMedia`

### Queue and Workers

Queue stack:

- Redis
- BullMQ

Queues:

- `connect`
- `message`
- `inMail`
- `scrape`
- `withdraw`
- `searchScrape`
- `sequenceDispatch`
- `sequenceEngineDispatch`
- `likePost`
- `withdrawSingle`
- `visitProfile`
- `contentSignal`
- `anomalyCheck`
- `syncStatus`
- `sessionHealthCheck`

Workers can run inside the API process in local development unless `START_WORKERS=false` is set. In production, worker startup should be configured deliberately.

Schedulers/tickers include:

- withdrawal jobs
- legacy message sequence ticker
- anomaly ticker
- sync status ticker
- sequence engine ticker
- session health check ticker

### Browser Automation

Browser stack:

- Playwright
- LinkedIn browser sessions loaded from encrypted cookies
- proxy-aware browser contexts
- human-like delays
- checkpoint detection

Browser actions include:

- navigate
- scrape profile
- scrape search
- extract search leads
- scrape content search
- send connection request
- send message
- send InMail
- like post
- visit profile
- check connection status
- check reply
- withdraw connection

## 7. Authentication and Security Model

Users authenticate with email and password.

The API issues auth sessions and the dashboard stores the token in local storage under:

```text
linkedin_auto_token
```

Authenticated dashboard requests send:

```text
Authorization: Bearer <token>
```

LinkedIn cookies are stored encrypted. The environment requires a cookie encryption key.

Sensitive values include:

- database URL
- Redis URL
- cookie encryption key
- proxy passwords
- Proxy-Cheap API credentials
- alert webhook URLs

## 8. Deployment and Runtime

Local prerequisites:

- Node.js 20+
- pnpm 9+
- Docker runtime
- PostgreSQL
- Redis

Typical local flow:

```bash
pnpm install
cp .env.example .env
cp apps/dashboard/.env.example apps/dashboard/.env.local
docker compose up -d postgres redis
pnpm db:generate
pnpm --filter @linkedin-automation/db exec dotenv -e ../../.env -- prisma migrate deploy
pnpm dev:api
pnpm dev:dashboard
```

Local dashboard:

```text
http://localhost:3000
```

Local API:

```text
http://localhost:3001
```

Useful commands:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm db:studio
pnpm --filter @linkedin-automation/queue workers
```

Production docs live in:

```text
docs/DEPLOYMENT.md
```

## 9. Product Surface Details

### Dashboard Overview

The dashboard shows:

- active accounts
- total leads
- reply rate
- open checkpoints
- today's connections
- today's messages and InMails
- recent activity
- safety status

### Accounts Page

Operators can:

- add/edit/delete accounts
- assign proxies
- save cookies
- pause/resume automation
- advance/downgrade warm-up
- edit daily limits
- inspect browser profile/session health
- run manual browser session workflows

### Proxies Page

Operators can:

- add/edit/delete proxies
- health check proxies
- import Proxy-Cheap proxies
- inspect exit IP and health

### Leads Page

Operators can:

- add a lead
- import CSV
- export CSV
- run search URL scraping
- inspect search jobs
- blacklist/unblacklist leads
- open lead details

### Campaigns Page

Operators can:

- create campaigns
- duplicate campaigns
- edit campaign settings
- start/pause campaigns
- delete campaigns
- add leads
- attach saved leads
- import campaign leads
- copy leads between campaigns
- configure messages
- configure content signal
- configure sequence graphs
- inspect campaign stats
- inspect campaign jobs and lead status

### Sequence Builder

The sequence graph builder lets users place nodes, configure step fields, connect edges, and save the entire graph. It uses React Flow.

The graph is saved via:

```text
GET /campaigns/:id/graph
PUT /campaigns/:id/graph
```

The API validates graph shape before saving.

### Jobs Page

Operators can inspect queues by:

- state
- queue name
- failure details
- retry/attempt data

Failed jobs can be cleared after review.

### Activity Page

Operators can inspect and export automated activity logs.

Activity action types include:

- connect
- message
- scrape
- search_scrape
- content_signal
- withdraw
- checkpoint_detected

### Rate Limits Page

Operators can view daily cap usage by account. Caps reset at midnight in the account or target timezone.

### Checkpoints Page

Operators can resolve checkpoint records after manually handling LinkedIn verification.

### Settings Page

Operators can configure alert delivery, including webhook-style integrations.

### Posts Page

The product includes a LinkedIn post composer/publishing record feature. Post statuses include:

- `DRAFT`
- `APPROVED`
- `SCHEDULED`
- `PUBLISHING`
- `PUBLISHED`
- `FAILED`

Supported media types:

- `IMAGE`
- `VIDEO`
- `DOCUMENT`
- `ARTICLE`

## 10. Known Behavioral Constraints

The following constraints are intentional product behavior:

- Do not automate LinkedIn login.
- Do not run browser jobs without a stable session.
- Do not run browser jobs without a proxy unless local diagnostics explicitly disable that requirement.
- Do not run actions outside active hours.
- Do not bypass warm-up caps.
- Do not let campaign limits override account-level caps.
- Do not treat Sales Navigator as available unless the account has real access and `salesNavigatorEnabled` is set.
- Do not use normal direct messages for unconnected leads.
- Do not hot-edit active sequence campaign graph structure.
- Do not add arbitrary looping or general conditional logic to the sequence graph without redesigning safety checks.
- Do not silently infer proxy location for managed proxy provisioning.

## 11. Current Implementation Notes

The sequence campaign engine has been implemented additively alongside legacy campaign types.

Sequence-related files include:

- `apps/api/src/routes/sequences.ts`
- `apps/dashboard/src/components/SequenceGraphBuilder.tsx`
- `packages/queue/src/processors/sequenceEngine.processor.ts`
- `packages/queue/src/processors/likePost.processor.ts`
- `packages/queue/src/processors/withdrawSingle.processor.ts`
- `packages/queue/src/processors/visitProfile.processor.ts`
- `packages/queue/src/sequenceGraph.ts`
- `packages/browser/src/actions/likePost.ts`
- `packages/browser/src/actions/withdrawConnect.ts`

The planning history for this feature is in:

```text
docs/plans/sequence-builder-engine.md
```

Important nuance: in a sequence context, `SCRAPE_SEARCH` has been relabeled in the UI as "Refresh Profile Data" because it refreshes the current lead profile rather than discovering new leads mid-graph.

## 12. Recommended AI Instructions When Working on This Product

If another AI is asked to modify this product, it should follow these principles:

1. Preserve safety-first behavior.
2. Read the Prisma schema before changing data flow.
3. Check API route ownership and user scoping before adding endpoints.
4. Reuse existing queue processors and guards where possible.
5. Avoid rewriting legacy campaign paths when adding new campaign behavior.
6. Keep LinkedIn automation conservative and observable.
7. Surface guard skips and worker failures visibly in job or campaign lead state.
8. Do not remove checkpoint pauses or proxy/session requirements.
9. Treat browser selectors as fragile and verify with real screenshots or fixtures.
10. Run typecheck and relevant tests after changes.

## 13. Glossary

Account: One LinkedIn identity controlled by the operator.

Proxy: Residential/static proxy profile used for browser sessions.

Lead: A LinkedIn profile stored for outreach or scraping.

Campaign: A configured workflow attached to an account and leads.

CampaignLead: Per-lead execution state inside a campaign.

Content Signal: A workflow that finds leads from recent posts matching a keyword.

PostSignal: Saved post context associated with a lead.

Checkpoint: A LinkedIn security or login challenge requiring human action.

Warm-Up: Account ramp phase that limits action volume.

Cap: Daily/monthly limit bucket for an account action type.

Sequence: A visual graph campaign made of steps and conditional edges.

Worker: Background process that executes BullMQ jobs.

Ticker: Scheduled process that periodically scans the database and queues due work.

## 14. One-Paragraph Brief for an AI

Vectra Control Outreach is a TypeScript monorepo for safety-first LinkedIn outreach automation. It has a Next.js dashboard, Express API, Prisma/PostgreSQL database, BullMQ/Redis workers, Playwright browser automation, and shared guard packages. Users manage LinkedIn accounts, residential proxies, saved cookie sessions, leads, campaigns, sequence graphs, content-signal scraping, post records, jobs, rate limits, checkpoints, and alerts. The system must protect accounts through warm-up phases, hard daily caps, active-hour scheduling, checkpoint pauses, stable proxy requirements, session validation, message deduplication, anomaly detection, and visible job/activity logs. Any AI modifying the product should preserve those constraints and prefer additive changes that reuse existing route, queue, guard, and browser-action patterns.
