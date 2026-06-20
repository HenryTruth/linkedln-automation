# LinkedIn Automation Tool — Build Plan

> **Risk posture:** Every feature in this plan is designed around account safety first.
> Automation is only as good as the account it runs on — losing the account means losing everything.

---

## 1. Goals

Build a personal/SaaS LinkedIn automation tool that can:

- Auto-connect with targeted profiles
- Send personalized message sequences (drip campaigns)
- Scrape and store lead data (name, title, company, URL)
- Track connection status, reply rates, and campaign performance
- Schedule all actions within safe daily limits
- **[Content Signal Targeting]** Find people who posted a keyword/phrase within N days, send them a connection request referencing their post, and store the post context so it can be surfaced in future conversations

---

## 2. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Browser automation | **Playwright** | Best stealth support, async, reliable |
| Stealth layer | **playwright-extra + stealth plugin** | Masks automation fingerprints |
| Backend / API | **Node.js + Express** | Simple, async-friendly |
| Job scheduling | **BullMQ + Redis** | Queue-based, rate-limit-aware |
| Database | **PostgreSQL** | Relational — good for leads, campaigns, sequences |
| ORM | **Prisma** | Type-safe, easy migrations |
| Proxy management | **Residential proxy pool** | Rotates IPs per session |
| Dashboard UI | **Next.js** | Admin panel for campaigns and analytics |
| Deployment | **Railway or Fly.io** | Easy, cheap, containerized |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Next.js Dashboard               │
│   (campaigns, leads, stats, safety settings)    │
└──────────────────────┬──────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────┐
│              Express API Server                  │
│  - Campaign CRUD                                 │
│  - Lead management                               │
│  - Queue job dispatch                            │
└──────────┬───────────────────────┬──────────────┘
           │                       │
┌──────────▼──────────┐ ┌─────────▼──────────────┐
│   BullMQ Job Queue  │ │      PostgreSQL DB       │
│   (Redis-backed)    │ │  leads, campaigns,       │
│                     │ │  messages, sessions,     │
│  - connect jobs     │ │  activity logs           │
│  - message jobs     │ └────────────────────────--┘
│  - scrape jobs      │
└──────────┬──────────┘
           │
┌──────────▼──────────────────────────────────────┐
│           Playwright Worker Pool                 │
│  - One browser session per LinkedIn account      │
│  - Stealth mode always on                        │
│  - Residential proxy per session                 │
│  - Human-like delays on every action             │
└─────────────────────────────────────────────────┘
```

---

## 4. Risk Mitigation Guards

This is the most critical section. Every automation action passes through a layered safety system.

---

### Guard 1 — Daily Action Limits (Hard Caps)

LinkedIn's detection is largely based on volume. These limits are enforced at the queue level — jobs are **rejected, not delayed** if the daily cap is hit.

| Action | Safe Daily Limit | Our Hard Cap |
|---|---|---|
| Connection requests sent | ~20–25 | **15** |
| Messages sent | ~50–80 | **40** |
| Profile views | ~80–100 | **60** |
| Search result pages visited | ~15 | **10** |

Caps are stored in the DB per account per day and checked **before** every job dispatch.

---

### Guard 2 — Human-Like Timing

Every action has randomized delays. No two actions fire at the same interval.

```
Between actions:        random 3–8 seconds
Between page loads:     random 5–15 seconds
Between campaigns:      random 2–5 minutes
Session duration:       60–90 minutes max, then mandatory rest
Rest period:            random 30–90 minutes between sessions
Active hours only:      Actions only fire 8am–7pm in the account's timezone
Weekend throttle:       50% of weekday caps on Sat/Sun
```

Implementation: a `delay(min, max)` utility wraps every Playwright action. The worker never calls any action without going through this.

---

### Guard 3 — Stealth Browser Fingerprinting

Raw Playwright is easy for LinkedIn to detect. These patches are applied on every session launch:

- `playwright-extra` with `stealth` plugin (patches `navigator.webdriver`, canvas fingerprint, WebGL, etc.)
- Consistent `userAgent` per account (stored in DB, never rotated mid-session)
- Consistent `viewport` per account (randomized on account creation, then fixed)
- `Accept-Language`, `timezone`, and `platform` match the proxy country
- No headless mode in production — use **headed browser on a virtual display (Xvfb)**
- Disable automation flags: `--disable-blink-features=AutomationControlled`

---

### Guard 4 — Residential Proxy Per Account

- Each LinkedIn account is permanently bound to **one proxy country/city**
- Proxies rotate per **session** (not per request) — session-sticky rotation
- Provider options: Brightdata, Oxylabs, or Smartproxy (residential, not datacenter)
- If a proxy IP changes mid-session, the session is terminated and restarted after a cooldown
- Proxy health is checked before each session start

---

### Guard 5 — Session Persistence & Cookie Management

- After first manual login, cookies are saved to the DB (encrypted at rest)
- Subsequent sessions load saved cookies — no re-login needed
- If LinkedIn forces a re-login (cookie expiry or checkpoint), the job is **paused and an alert is sent** — never attempt auto-login
- Sessions are stored per account, never shared across accounts

---

### Guard 6 — Checkpoint & CAPTCHA Detection

LinkedIn sometimes shows a CAPTCHA or "verify it's you" screen.

- Before every action, check for checkpoint indicators in the DOM
- If detected: **immediately stop all jobs for that account**, flag the account as `PAUSED`, send a push/email alert
- Human resolves the checkpoint manually
- Account resumes only after human confirms it's clear
- Accounts that hit 2+ checkpoints in 30 days are **rate-limited to 50% of normal caps**

---

### Guard 7 — Warm-Up Protocol for New Accounts

New accounts or freshly connected accounts must be warmed up before automation starts.

```
Week 1:  Manual use only — no automation. Browse, react, post.
Week 2:  5 connection requests/day max, no messaging
Week 3:  10 connections/day, 5 messages/day
Week 4+: Ramp to full caps over 2 more weeks
```

Warm-up state is tracked in the DB. Jobs are rejected if the account hasn't completed the current warm-up phase.

---

### Guard 8 — Connection Request Withdrawal

Pending connection requests that haven't been accepted are a red flag to LinkedIn's algorithm.

- Every 14 days, automatically withdraw connection requests pending longer than 14 days
- Cap: withdraw no more than 20 at a time, with human-like delays
- This keeps the pending queue clean and lowers spam signals

---

### Guard 9 — Message Personalization (Anti-Spam Signal)

Sending identical messages to hundreds of people is a strong spam signal.

- Every message template requires at least **2 dynamic fields** (e.g. `{{firstName}}`, `{{company}}`)
- A/B test multiple message variants — rotate them across sends
- Hard block on sending the same message body to more than 3 people in the same day
- Minimum 3-hour gap between sending to people at the same company

---

### Guard 10 — Activity Log & Anomaly Detection

All automation activity is logged to the DB with timestamps. A background job runs every hour and flags anomalies:

- More than 5 actions in any 10-minute window → pause account, alert
- Same action repeated on the same profile twice → block and log
- Error rate on a session > 20% → pause session, investigate
- IP address mismatch between proxy config and detected IP → kill session immediately

---

## 5. Feature Deep Dive — Content Signal Targeting

> Find people who posted a specific keyword within N days → connect with a note referencing their post → store post context for future conversations.

---

### How It Works (End-to-End Flow)

```
User defines a "Content Signal Campaign":
  keyword: "AI automation"
  date range: last 7 days
  target title filter: "Founder" or "Head of Sales" (optional)
  max leads to collect: 50
          │
          ▼
Playwright navigates to LinkedIn Content Search:
  /search/results/content/?keywords=AI+automation&datePosted=past-week
          │
          ▼
Scraper reads each post result:
  - Author name + profile URL
  - Post excerpt (first 300 chars)
  - Post URL (permalink)
  - Post date
  - Author title + company (from post card)
          │
          ▼
Dedup check: has this person already been contacted or collected?
          │
          ▼
Lead is saved to DB with post_signal attached
          │
          ▼
Connection request job queued:
  Note: "Hi {{firstName}}, I came across your post on {{postTopic}} —
         really found it insightful. Would love to connect!"
          │
          ▼
If accepted → message sequence starts
  Conversation view shows post excerpt alongside lead card
  so the human/AI can reference it naturally
```

---

### What Gets Scraped Per Post

| Field | Where It Comes From | Stored As |
|---|---|---|
| Author first + last name | Post card DOM | `leads.first_name`, `leads.last_name` |
| Author profile URL | Post card link | `leads.linkedin_url` |
| Author title | Post card subtitle | `leads.title` |
| Author company | Post card subtitle | `leads.company` |
| Post text excerpt | Post body (first 300 chars) | `post_signals.excerpt` |
| Post permalink URL | Post timestamp link | `post_signals.post_url` |
| Post published date | Post timestamp | `post_signals.published_at` |
| Search keyword used | Campaign config | `post_signals.keyword` |

---

### Dynamic Template Fields Unlocked

Because the post is stored, message templates get extra variables:

```
{{firstName}}         → "Sarah"
{{postExcerpt}}       → "AI is changing the way we think about..."
{{postTopic}}         → derived from keyword, e.g. "AI automation"
{{postDate}}          → "last Tuesday" (humanized relative date)
{{company}}           → "Acme Corp"
```

Example connection note (300 char limit):
```
Hi {{firstName}}, I came across your post on {{postTopic}} from {{postDate}} — 
great perspective. Would love to connect and follow your content.
```

Example follow-up message after accepting:
```
Hey {{firstName}}, thanks for connecting! Your point about {{postExcerpt}} 
really stood out to me. Are you seeing that trend in your work at {{company}}?
```

---

### Risk Guards Specific to This Feature

**Guard A — Search Session Throttle**
- Max 3 content search pages scraped per session (each page = ~10 posts)
- After scraping, mandatory 15–30 min delay before starting connection jobs
- Never scrape and connect in the same browser action sequence — split into two separate jobs

**Guard B — Author Deduplication**
- Before queuing a connection, check `post_signals` and `leads` tables
- If the person was collected from a different keyword in the last 30 days → skip
- If already connected or pending → skip entirely
- If rejected a previous request → blacklist permanently

**Guard C — Post Freshness Gate**
- Only process posts published within the user-defined window (e.g., 7 days)
- Posts older than 30 days are never used as a signal — stale context feels spammy
- If LinkedIn's date filter returns posts outside the window (it sometimes does), skip them

**Guard D — Connection Note Uniqueness**
- Even with the same template, vary phrasing via A/B variants
- Hard block: the same note text cannot be sent to more than 2 people in a day
- Note must reference a unique aspect of the post — templates with no `{{postExcerpt}}` or `{{postTopic}}` are rejected

**Guard E — Keyword Diversity**
- Recommend running max 2 content signal campaigns simultaneously
- The same keyword cannot be used in more than one active campaign at a time
- Prevents LinkedIn from seeing a dense cluster of activity around the same search

**Guard F — Post URL as Unique Key**
- Each post URL is stored as unique in `post_signals`
- Two leads can't be sourced from the same post (e.g., if one person shares another's post)
- This prevents accidentally targeting the same post twice from different search sessions

---

### Conversation Context Panel (Dashboard UI)

When you open a lead in the dashboard to write or review messages, a sidebar shows:

```
┌──────────────────────────────────────┐
│  SIGNAL CONTEXT                      │
│  ─────────────────────────────────── │
│  Keyword: "AI automation"            │
│  Posted: 5 days ago                  │
│  ─────────────────────────────────── │
│  "AI is fundamentally changing how   │
│   sales teams qualify leads. We've   │
│   seen 3x faster pipeline velocity   │
│   since adopting..."                 │
│                                      │
│  [View original post ↗]              │
└──────────────────────────────────────┘
```

This means you never have to remember why you connected with someone — the post is right there.

---

## 6. Data Model (Core Tables)

```sql
accounts         -- LinkedIn accounts being managed
  id, email, cookies (encrypted), proxy_id, warm_up_phase, status, daily_caps

proxies          -- Proxy pool
  id, host, port, country, city, username, password, last_used, health_status

leads            -- Scraped LinkedIn profiles
  id, linkedin_url, first_name, last_name, title, company, connection_status,
  account_id, blacklisted, blacklist_reason

campaigns        -- Automation campaigns
  id, name, account_id,
  type (connect | message | scrape | content_signal),  -- content_signal = new
  status, daily_limit

content_signal_campaigns  -- Config for keyword-based post targeting
  id, campaign_id, keyword, date_range_days,
  max_leads, title_filter, company_filter,
  last_scraped_at

post_signals     -- Posts captured as lead signals
  id, lead_id, campaign_id,
  post_url UNIQUE,          -- prevents duplicate processing
  excerpt,                  -- first 300 chars of post text
  keyword,                  -- search term that found this post
  published_at,             -- when the post was made
  scraped_at                -- when we collected it

campaign_leads   -- Junction: which leads are in which campaign
  id, campaign_id, lead_id, stage, last_action_at, next_action_at,
  post_signal_id            -- FK to post_signals if sourced from content signal

messages         -- Message templates
  id, campaign_id, sequence_order, body_template, variant_group

activity_log     -- Every automated action taken
  id, account_id, action_type, target_url, result, created_at

checkpoints      -- Detected LinkedIn security checks
  id, account_id, detected_at, resolved_at, resolved_by
```

---

## 6. Feature Build Order

### Phase 1 — Foundation (Week 1–2)
- [x] Repo setup: Node.js + Prisma + PostgreSQL + Redis
- [x] DB schema migrations
- [x] Playwright worker with stealth plugin wired up
- [x] Cookie-based session management (save/load/encrypt)
- [x] Proxy binding per account
- [x] Activity logger
- [x] Daily cap enforcement in BullMQ

### Phase 2 — Core Automation (Week 3–4)
- [ ] Profile scraper (name, title, company, URL from search results)
- [ ] Connection request sender (with personalized note)
- [ ] Connection request withdrawal job
- [ ] Checkpoint/CAPTCHA detector with account pause + alert
- [ ] Warm-up phase enforcement
- [ ] Lead blacklist enforcement (skip blacklisted profiles in all jobs)

### Phase 3 — Messaging & Content Signal (Week 5–7)
- [ ] Message sequence engine (drip campaigns)
- [ ] Template renderer with dynamic fields (including `{{postExcerpt}}`, `{{postTopic}}`, `{{postDate}}`)
- [ ] Reply detection (pause sequence if lead replies)
- [ ] A/B variant rotation
- [ ] Same-company throttle guard
- [ ] **Content Signal Targeting** — keyword post scraper
- [ ] **Content Signal Targeting** — author extraction + dedup + lead creation
- [ ] **Content Signal Targeting** — post_signals DB writes with UNIQUE post_url guard
- [ ] **Content Signal Targeting** — connection note generator referencing post
- [ ] **Content Signal Targeting** — Guards A–F enforcement

### Phase 4 — Dashboard (Week 8–9)
- [ ] Next.js admin panel
- [ ] Campaign create/edit/pause UI (including Content Signal campaign type)
- [ ] Lead list with filters (status, company, campaign, signal keyword)
- [ ] Daily stats: connections sent, messages sent, reply rate
- [ ] Account health panel (caps used, checkpoint history, proxy status)
- [ ] Alert/notification system (email or push)
- [ ] **Conversation context panel** — post signal sidebar on lead detail view
- [ ] "View original post" deep-link from lead card

### Phase 5 — Hardening & Scale (Week 10–11)
- [ ] Anomaly detection background job
- [ ] Multi-account support
- [ ] Proxy health monitoring
- [ ] Audit trail export (CSV)
- [ ] API rate-limit dashboard

---

## 7. Legal & Ethical Boundaries

| What's included | What's excluded |
|---|---|
| Automating your own account | Accessing accounts you don't own |
| Scraping public profile data | Scraping private/hidden data |
| Sending messages to connections | Mass cold messaging non-connections |
| Tracking your own campaign metrics | Selling scraped data to third parties |
| Withdrawing your own pending requests | Faking identities or impersonation |

> **Note:** This tool violates LinkedIn's Terms of Service. Using it risks account suspension.
> The guards above are designed to minimize that risk — they do not eliminate it.
> Do not use this on accounts you cannot afford to lose. Always keep a backup outreach channel.

---

## 8. Environment Variables

```env
DATABASE_URL=
REDIS_URL=
ENCRYPTION_KEY=          # For encrypting stored cookies
PROXY_PROVIDER_API_KEY=
ALERT_EMAIL=
NODE_ENV=production
HEADLESS=false           # Always false in prod — use Xvfb
```

---

## 9. Folder Structure

```
linkedin-automation/
├── apps/
│   ├── api/             # Express REST API
│   └── dashboard/       # Next.js admin panel
├── packages/
│   ├── browser/         # Playwright worker, stealth config, session manager
│   ├── queue/           # BullMQ job definitions and processors
│   ├── db/              # Prisma schema + client
│   └── guards/          # All safety/limit enforcement logic
├── docker-compose.yml   # Postgres + Redis local dev
└── PLAN.md
```

---

*Document version: 1.1 — 2026-06-20 — added Content Signal Targeting feature*
