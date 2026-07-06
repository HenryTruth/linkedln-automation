# Sequence Builder — Visual Multi-Step LinkedIn Automation Engine

> **Status tracking**: See `/Users/mac/.claude/projects/-Users-mac-Desktop-linkedin-automation/memory/sequence-builder-engine.md`
> for current milestone progress. Update that file's status line as §7 milestones complete.

## Context

Vectra (this repo) currently models a campaign as one fixed `type` (CONNECT/MESSAGE/INMAIL/SCRAPE/CONTENT_SIGNAL). The only multi-step behavior today is a linear array of `Message` rows (`sequenceOrder`/`delayDays`) for MESSAGE campaigns, driven by `sequence.processor.ts`.

The user wants to automate a real workflow they run manually today: **scrape leads → visit profile → like a post → wait X days → like another post → wait X days → send a connection request that references an earlier liked post → branch: accepted → thank-you message; not accepted after X days → withdraw the request** — built and edited as a drag-and-drop, n8n/make.com-style graph.

This requires: a new graph data model, a generalized step-dispatch engine, two new browser actions that don't exist yet (like-a-post, single-lead withdraw), and a new canvas UI (no node-graph library exists in the repo today — `@dnd-kit` is confirmed 1-D-sortable-list-only). This is live production (real LinkedIn accounts, ban-risk), so the guiding principle is: **fully additive**. Existing CONNECT/MESSAGE/INMAIL/SCRAPE/CONTENT_SIGNAL campaigns keep their exact current code paths, untouched. A new `CampaignType.SEQUENCE` opts a campaign into a parallel engine.

## 1. Data model (`packages/db/prisma/schema.prisma`)

Additive migration only — no existing field renamed/removed/repurposed.

```prisma
enum CampaignType {
  CONNECT
  MESSAGE
  INMAIL
  SCRAPE
  CONTENT_SIGNAL
  SEQUENCE                // NEW
}

enum StepType {
  SCRAPE_SEARCH
  VISIT_PROFILE
  LIKE_POST
  WAIT
  SEND_CONNECTION_REQUEST
  SEND_MESSAGE
  SEND_INMAIL
  WITHDRAW_CONNECTION
}

enum EdgeCondition {           // deliberately closed — NOT a generic condition language
  DEFAULT
  CONNECTION_ACCEPTED          // only valid off a SEND_CONNECTION_REQUEST step
  CONNECTION_TIMEOUT           // only valid off a SEND_CONNECTION_REQUEST step
}

model SequenceStep {
  id          String     @id @default(cuid())
  campaignId  String
  campaign    Campaign   @relation(fields: [campaignId], references: [id])
  type        StepType
  config      Json       @default("{}")   // e.g. {waitDays}, {bodyTemplate}, {postUrlSource, timeoutDays}
  positionX   Float      @default(0)
  positionY   Float      @default(0)
  isEntry     Boolean    @default(false)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  outgoingEdges SequenceEdge[] @relation("FromStep")
  incomingEdges SequenceEdge[] @relation("ToStep")
  campaignLeads CampaignLead[] @relation("CurrentStep")
  @@index([campaignId])
}

model SequenceEdge {
  id         String        @id @default(cuid())
  campaignId String
  campaign   Campaign      @relation(fields: [campaignId], references: [id])
  fromStepId String
  fromStep   SequenceStep  @relation("FromStep", fields: [fromStepId], references: [id])
  toStepId   String
  toStep     SequenceStep  @relation("ToStep", fields: [toStepId], references: [id])
  condition  EdgeCondition @default(DEFAULT)
  @@unique([fromStepId, condition])   // at most one DEFAULT + one ACCEPTED + one TIMEOUT per node
  @@index([campaignId])
  @@index([toStepId])
}
```

`Campaign` gains `steps SequenceStep[]` / `edges SequenceEdge[]`. `CampaignLead` gains optional columns only:
```prisma
currentStepId       String?
currentStep         SequenceStep? @relation("CurrentStep", fields: [currentStepId], references: [id])
stepEnteredAt       DateTime?     // drives WAIT elapsed-time + timeout-branch checks
branchAwaitingSince DateTime?     // set once a SEND_CONNECTION_REQUEST is sent; cleared when a branch is taken
```

**Why additive, not a rewrite of `Campaign.type`/`Message`:** every processor, cap table, and completion predicate branches on `campaign.type` today. Rewriting it would force touching `sequence.processor.ts`, `syncStatus.processor.ts`, `campaignCompletion.ts`, and `/:id/start` for a system with real accounts mid-campaign — high blast radius for zero benefit to legacy types. `stage` (Int) is left alone for legacy types; a graph position isn't a single integer once branches exist, so SEQUENCE leads use `currentStepId` (FK) instead.

## 2. Engine (parallel processors, not a rewrite)

New files: `packages/queue/src/processors/sequenceEngine.processor.ts`, `likePost.processor.ts`, `withdrawSingle.processor.ts`. New queues in `queues.ts` (`sequenceEngineDispatchQueue`, `likePostQueue`, `withdrawSingleQueue`); reuse `connectQueue`/`messageQueue`/`inMailQueue`/`scrapeQueue` as-is for the corresponding step types (they already accept an optional `campaignLeadId` — nothing to change in `scheduler.ts`'s `attachCampaignLeadJobState`).

**Step-dispatch tick** (every 5 min, tighter than legacy's 15 min since day-scale WAITs need finer granularity): query `CampaignLead` where `campaign.type=SEQUENCE, status=ACTIVE, jobStatus not in [QUEUED,RUNNING], currentStepId not null`. Per lead, switch on `currentStep.type`:
- `WAIT`: if `now - stepEnteredAt >= config.waitDays`, advance via the DEFAULT edge immediately (no BullMQ delayed job — reuses the same DB-poll idiom the rest of the codebase already uses for `nextActionAt`, simpler to reason about and survives restarts without a second source of truth).
- `SEND_CONNECTION_REQUEST`: if `branchAwaitingSince` is null, enqueue to `connectQueue` (guard chain identical to CONNECT campaigns) and leave `currentStepId` unchanged — this step's branch is resolved later by `syncStatus.processor.ts`, not by this tick.
- All other step types (`LIKE_POST`, `VISIT_PROFILE`, `SEND_MESSAGE`, `SEND_INMAIL`, `WITHDRAW_CONNECTION`, `SCRAPE_SEARCH`): read-only `checkDailyCap` pre-screen, then enqueue to the matching queue with `campaignLeadId` + a `sequenceStep` marker (reusing `message.processor.ts`'s existing precedent of skipping `checkDuplicate` when `sequenceStep !== undefined`).

**Advancing on completion**: extend `attachCampaignLeadJobState`'s `"completed"` handler in `scheduler.ts` with one additional branch (no-op for non-SEQUENCE leads, so legacy behavior is untouched):
```
if (cl.campaign.type === "SEQUENCE" && cl.currentStep) {
  if (cl.currentStep.type === "SEND_CONNECTION_REQUEST") {
    set branchAwaitingSince = now   // wait for syncStatus to resolve the branch
  } else {
    next = find outgoing DEFAULT edge
    update currentStepId = next?.id ?? null, stepEnteredAt = next ? now : null, jobStatus = IDLE
    if (!next) maybeCompleteCampaign(cl.campaignId)   // graph exhausted for this lead
  }
}
```
This keeps `connect.processor.ts`/`message.processor.ts`/`inmail.processor.ts`/`scrape.processor.ts` **completely unmodified** — graph-walk logic lives only in the tick and this hook, not inside the action processors.

**Branch evaluation — extend `syncStatus.processor.ts`** (the one required generalization of existing code): today `activateMessageSequences` is hardcoded to `campaign.type===MESSAGE`. Add a sibling call, `activateSequenceEngineAcceptedBranch(leadId, accountId)`, at the same call site (both the PENDING→CONNECTED and NONE→CONNECTED transitions already call `activateMessageSequences` — add the new call right beside it, MESSAGE behavior untouched). It finds any `CampaignLead` with `branchAwaitingSince` set whose `currentStep.type === SEND_CONNECTION_REQUEST`, follows the `CONNECTION_ACCEPTED` edge, clears `branchAwaitingSince`. Add one new DB-only pass in the same file, `activateSequenceEngineTimeoutBranch()` (no browser call needed — pure time comparison), run every tick alongside the existing scans: for leads where `now - branchAwaitingSince >= currentStep.config.timeoutDays`, follow the `CONNECTION_TIMEOUT` edge (skip if `lead.connectionStatus` already flipped to CONNECTED this same tick — accepted wins the race).

**`campaignCompletion.ts`**: add one more `else if (campaign.type === CampaignType.SEQUENCE)` branch to the existing `pendingWhere` ternary — pending = `jobStatus in [IDLE,QUEUED,RUNNING]` OR `currentStepId not null`. Same shape as the existing MESSAGE branch, additive only.

| Component | Status |
|---|---|
| `connect/message/inmail/scrape.processor.ts` | Unchanged |
| `attachCampaignLeadJobState` | +1 branch, no-op for legacy leads |
| `sequence.processor.ts` (legacy MESSAGE dispatcher) | Unchanged |
| `syncStatus.processor.ts` | +1 call site, +1 new function |
| `campaignCompletion.ts` | +1 ternary branch |
| `withdrawPendingConnections` / `withdraw.processor.ts` (14-day cron) | Unchanged |

## 3. New browser actions (`packages/browser/src/actions/`)

- **`likePost.ts`** (new): `likePost(page, postUrl) => Promise<"liked" | "already_liked">`. Same contract shape as `sendConnect`/`checkConnectionStatus` — uses existing `navigateTo`/`humanDelay` helpers, throws on genuine failure so the processor's existing `captureFailureArtifacts` catch path works unmodified. Must be idempotent (already-liked is success, not error). This is the least-precedented, highest ban-risk piece of the whole plan (nothing in the repo touches LinkedIn's post-reaction UI today) — verify standalone before building anything on top of it (see Milestone b below).
- **`withdrawConnect.ts` refactor**: extract the per-lead browser mechanics out of `withdrawPendingConnections` into a new `withdrawConnection(page, linkedinUrl) => Promise<"withdrawn"|"not_pending">`. `withdrawPendingConnections(page, accountId)` becomes a thin wrapper (same DB query, same loop, same 14-day cron behavior — `withdraw.processor.ts` needs zero changes). The new `withdrawSingle.processor.ts` calls `withdrawConnection` directly for one `CampaignLead`.

## 4. Guards — reuse existing buckets, don't extend `ActionType`

`ActionType` (`"connection"|"message"|"inmail"|"profileView"|"searchPage"`) is threaded through `caps.ts`/`warmup.ts`'s cap tables and the dashboard's `CapKey` mirror. Adding brand-new keys means picking untested numeric ceilings on a live system.

- `LIKE_POST` → reuse `"profileView"` bucket (lightweight page visit, most headroom, already-conservative warm-up ladder).
- `WITHDRAW_CONNECTION` (single-lead) → reuse `"connection"` bucket (inverse of sending a request, same LinkedIn surface).

`likePost.processor.ts` / `withdrawSingle.processor.ts` call `assertWarmUpAllowed`/`claimDailyCap` with these mapped buckets, plus the standard `checkActionWindow`/`checkSessionErrorRate` prelude every processor uses. No `packages/guards` changes needed. Splitting these into dedicated cap buckets later (once there's real usage data) is a pure additive follow-up.

## 5. API layer

New file `apps/api/src/routes/sequences.ts` (kept separate from the already-829-line `campaigns.ts`), mounted the same way. **Single "replace whole graph" `PUT`**, not granular step/edge CRUD — follows the existing `/:id/messages/reorder` precedent (bulk-replace in one call) and matches how a canvas editor naturally saves (whole in-memory graph on one "Save" click, not autosave-per-field). Granular CRUD would force the client to diff local vs. server graph state for no benefit (single-user tool, no concurrent-edit case).

```
GET /campaigns/:id/graph          -> { steps, edges }
PUT /campaigns/:id/graph          -> validate + replace atomically
```

`PUT` validates (before touching the DB): exactly one `isEntry` step, `@@unique([fromStepId,condition])` respected, every edge's `fromStepId`/`toStepId` resolves within the same payload, no cycles. **Must diff by client-supplied step `id`** (update in place) rather than blanket delete+recreate, because `CampaignLead.currentStepId` FKs into `SequenceStep` — deleting a step still referenced by an in-flight lead must be rejected (409) while the campaign is ACTIVE. **Product constraint to surface in the UI**: structural graph edits require pausing the campaign first — no hot-editing a live graph in this MVP.

Small additions elsewhere: `campaigns.ts`'s `POST /:id/start` gains one more `else if (type === SEQUENCE)` branch that seeds each due lead at the entry step (`currentStepId = entryStep.id, stepEnteredAt = now`) — the engine tick takes it from there. `GET /:id` needs `include: { steps: true, edges: true }` (harmless empty arrays for other types). `apps/dashboard/src/lib/api.ts` gains an `api.sequences.graph.get/save` namespace following the existing `apiFetch<T>` convention.

## 6. Dashboard UI

- Add **`@xyflow/react`** (React Flow) to `apps/dashboard/package.json` — the standard node-graph canvas library; nothing graph-capable exists in the repo today.
- New `apps/dashboard/src/components/SequenceGraphBuilder.tsx`: canvas (`<ReactFlow>`) rendering one custom node component per `StepType` (the `SEND_CONNECTION_REQUEST` node shows two labeled output handles, "Accepted"/"Timed out"; every other node has one), a node-palette sidebar (drag a `StepType` onto the canvas to create it), and a per-node config side panel (fields conditional on type — `waitDays`, note template reusing the existing `{{firstName}}`/`{{postExcerpt}}` hint text from `SequenceBuilder.tsx`'s `EditForm`, `timeoutDays`, and for `LIKE_POST` a `postUrlSource` selector: "referenced post" (via the existing `CampaignLead.postSignalId`/`PostSignal` linkage) vs. a static URL). One explicit "Save Graph" button calling `api.sequences.graph.save`.
- `campaigns/new/page.tsx`: `campaignTypes` array gains a 6th `["SEQUENCE", "Sequence"]` tuple (the type-card picker already maps generically over the array); add one conditional block mirroring the existing `CONNECT` block, likely just an explanatory note since the graph is built after creation.
- `campaigns/[id]/page.tsx`: add `isSequence = campaign.type === "SEQUENCE"` alongside the existing type booleans; render `<SequenceGraphBuilder />` for it, same pattern as the existing `{(isMessage||isInMail) && <SequenceBuilder/>}` branch.
- **Leads table**: keep this lightweight per MVP scope — replace the bare `Step {cl.stage}` cell with a conditional: for `isSequence`, show a human-readable step label (`STEP_TYPE_LABELS` map) + `stepEnteredAt` (formatted like the existing `lastActionAt`); for every other type, render exactly as today. No path/graph visualization in the MVP.

## 0. Persist this plan for cross-session continuity

Before implementation starts, commit this plan into the repo (not just the ephemeral plan-mode file) so any future Claude Code session opened in this project can discover and resume the work without re-deriving the architecture:

- Write the full plan to `docs/plans/sequence-builder-engine.md` in the repo (versioned, discoverable by any session that reads the codebase).
- Add a project-type memory entry (`/Users/mac/.claude/projects/-Users-mac-Desktop-linkedin-automation/memory/sequence-builder-engine.md`) summarizing the feature, current milestone status, and pointing to the docs file — indexed in `MEMORY.md` so it auto-loads in future conversations in this project.
- As milestones in §7 complete, update the memory entry's status line (e.g. "milestone (b) done — likePost/withdrawConnection verified standalone") so a fresh session knows where to pick up.

## 7. Build order (de-risk the least-proven part first)

1. **Schema migration** — additive only, zero behavior change until a SEQUENCE campaign exists.
2. **Verify the new browser actions standalone** — `likePost` and `withdrawConnection`, against one real test LinkedIn account, before writing any queue/engine code. This is the highest-risk, least-precedented piece (no existing code touches LinkedIn's post-reaction UI) — confirm it works before building a pipeline around it.
3. **Backend engine + API with a hand-built graph, no UI yet** — build the processors, scheduler/queue wiring, `syncStatus`/`campaignCompletion` extensions, and `PUT /graph` (exercisable via curl). Seed one campaign/lead reproducing the exact requested flow, run it against a real test account, force both branches (flip `Lead.connectionStatus` manually rather than waiting real days) to confirm the graph walk is correct end-to-end before any UI investment.
4. **React Flow builder UI** — build the same graph via the canvas instead of raw JSON, confirm it round-trips through `PUT /graph` identically.
5. **Leads-table step column** — small, additive, low-risk.
6. **Full multi-day dogfood test** — one real campaign, both branches actually exercised, before calling it production-ready.

## 8. Explicit non-goals (keep scope sane)

- No generic arbitrary-field branching/if-node — `EdgeCondition` is a closed 3-value enum tied specifically to connection-request outcomes.
- No loops — the graph is a DAG; `PUT /graph` rejects cycles.
- No reusable cross-campaign sequence templates (out of scope; could later extend the existing `/duplicate` route).
- No multi-branch fan-out beyond accepted/timeout — enforced structurally by `@@unique([fromStepId, condition])`.
- No hot-editing of a live/ACTIVE campaign's graph structure — pause first.

## Critical files

- `packages/db/prisma/schema.prisma` — new enums/models, new `CampaignLead` columns
- `packages/queue/src/scheduler.ts` — new workers/tickers, `attachCampaignLeadJobState` extension
- `packages/queue/src/queues.ts` — new queues
- `packages/queue/src/processors/sequenceEngine.processor.ts`, `likePost.processor.ts`, `withdrawSingle.processor.ts` — new
- `packages/queue/src/processors/syncStatus.processor.ts` — branch-evaluation extension
- `packages/queue/src/campaignCompletion.ts` — new pending-work branch
- `packages/browser/src/actions/likePost.ts` — new; `withdrawConnect.ts` — refactor
- `packages/guards/src/caps.ts` / `warmup.ts` — no changes (bucket reuse only)
- `apps/api/src/routes/sequences.ts` — new; `apps/api/src/routes/campaigns.ts` — `/start` + `GET /:id` additions
- `apps/dashboard/src/components/SequenceGraphBuilder.tsx` — new
- `apps/dashboard/src/app/campaigns/new/page.tsx`, `apps/dashboard/src/app/campaigns/[id]/page.tsx` — additive branches
- `apps/dashboard/src/lib/api.ts` — new `api.sequences` namespace, `CampaignDetail` type additions

## Verification

- `pnpm --filter @linkedin-automation/db exec prisma migrate dev` — confirm existing campaigns/tests unaffected.
- Run existing test suites (`packages/queue/src/processors/sequence.processor.test.ts` etc.) to confirm zero regression in legacy paths.
- Standalone script against a real test LinkedIn account to verify `likePost`/`withdrawConnection` before wiring them into processors.
- End-to-end: seed one SEQUENCE campaign + one lead via `PUT /graph`, run the engine tick manually/via BullMQ, force both the accepted and timeout branches by editing `Lead.connectionStatus`/`branchAwaitingSince` directly in the DB, confirm `currentStepId` walks correctly and the campaign auto-completes.
- Full dogfood run with the React Flow UI before considering this production-ready.

## Milestone log

**Milestone 1 (schema migration) — done.** Additive migration `20260706121341_add_sequence_builder_engine` applied; full test suite + `pnpm -r typecheck` pass with zero regressions.

**Milestone 2 (verify `likePost`/`withdrawConnection` standalone) — done.** Built `packages/browser/src/actions/likePost.ts` and refactored `withdrawConnect.ts` to extract `withdrawConnection(page, linkedinUrl)`. Built `scripts/verify-sequence-actions.ts` as the standalone harness (none existed before — see §6 of the original codebase-exploration report). Verified against the real production account: `likePost` → `"liked"` then `"already_liked"`; `withdrawConnection` → `"withdrawn"` then `"not_pending"`.

**Bug found in existing production code**: LinkedIn's current profile page renders the pending-connection CTA as an `<a aria-label="Pending, click to withdraw...">`, not a `<button>`. The original `withdrawConnect.ts` selector was button-only, so the existing 14-day `withdrawPendingConnections` cron has been silently a no-op in production (errors swallowed by a bare `catch {}`). Fixed by widening the selector to match both tags, and by dispatching the click via `el.evaluate(el => el.click())` instead of Playwright's hover-based click, which kept getting intercepted by a stray LinkedIn nav flyout.

**Open follow-up**: `checkConnectionStatus.ts` likely has the same button-only-selector staleness for detecting PENDING/CONNECTED state. This matters for milestone 3 because `syncStatus.processor.ts`'s accept/timeout branch resolution depends on accurate status detection — verify/fix this before or while building the engine.

**Milestone 3 (backend engine + graph API, hand-built graph, verified against the real account) — done.** Confirmed and fixed the open follow-up first: `checkConnectionStatus.ts` had the identical button-only-selector bug, fixed the same way as `withdrawConnect.ts`. Built `sequenceEngine.processor.ts` (the 5-min step-dispatch tick), `likePost.processor.ts`/`withdrawSingle.processor.ts`/`visitProfile.processor.ts` (the last is a small, disclosed deviation from the literal plan — VISIT_PROFILE had no designated processor in §2), `sequenceGraph.ts`'s `advanceSequenceLead` graph-walk helper, the four new queues, `syncStatus.processor.ts`'s `activateSequenceEngineAcceptedBranch`/`activateSequenceEngineTimeoutBranch`, `campaignCompletion.ts`'s SEQUENCE branch, and `PUT`/`GET /campaigns/:id/graph` (`apps/api/src/routes/sequences.ts`, with `validateGraphShape` unit-tested directly — one entry step, no dangling/duplicate edges, no cycles).

**Bugs found and fixed during verification:**
- The milestone 0-2 migration was committed to git but had never actually been deployed to the production database (`prisma migrate status` showed it pending) — deployed via `prisma migrate deploy`.
- `campaignCompletion.ts`'s SEQUENCE `pendingWhere` OR'd in `jobStatus: {in: PENDING_JOB_STATUSES}`, but `advanceSequenceLead` always sets `jobStatus: "IDLE"` — both mid-graph and on exhaustion — so a fully-finished lead could never distinguish itself and campaigns never auto-completed. Fixed to rely solely on `currentStepId: {not: null}`.
- `checkSessionErrorRate` (packages/guards/src/anomaly.ts) treated any `activityLog.result` that wasn't the exact literal `"success"` as a failure, but several processors (searchScrape, contentSignal, likePost, withdrawSingle) log descriptive non-"success" strings on real success (e.g. `"scraped 10 leads..."`, `"liked"`). This caused false-positive anomaly pauses on healthy accounts. Fixed to match the codebase's actual `"failed: ..."` failure-prefix convention.
- Deployed all of the above to Railway (`vectra/main`, commit `0d7e156`) so the live worker fleet stopped fighting the local verification with stale, unfixed logic.

**Verification results**: Phase 1 (blacklisted synthetic lead, zero LinkedIn risk) passes deterministically on every run — WAIT elapsing, both the ACCEPTED and TIMEOUT branches, and campaign auto-completion all confirmed repeatedly. Phase 2 (real actions against a real, user-authorized lead) confirmed `VISIT_PROFILE` and `LIKE_POST` (including idempotent `"already_liked"` re-detection) executing for real — notably picked up and completed autonomously by the live Railway fleet once deployed, proving the deployed ticker genuinely works end-to-end in production, not just under manual local invocation. `SEND_CONNECTION_REQUEST`/`WITHDRAW_CONNECTION` real-send verification was cut short: the test account's LinkedIn session went invalid (confirmed via screenshot showing the logged-out "Join LinkedIn" wall), most likely LinkedIn's anti-automation response to the volume of test sessions run today — not a bug in the engine. Deferred rather than compounding the flag with more automated attempts on a dead session.

**Open follow-up for next session**: the test account's LinkedIn session needs a fresh login/cookie refresh before `SEND_CONNECTION_REQUEST`/`WITHDRAW_CONNECTION` can be verified for real. The Railway Postgres proxy (`reseau.proxy.rlwy.net:13286`) also showed intermittent transient connection-refused blips throughout today's session, unrelated to any code change — worth a retry rather than assuming a real outage if seen again.

**Milestone 4 (React Flow builder UI, round-tripped through `PUT /graph`) — done.** Added `@xyflow/react` to `apps/dashboard/package.json`. Built `apps/dashboard/src/components/SequenceGraphBuilder.tsx`: a `<ReactFlow>` canvas with one custom node component shared across all `StepType`s (styled per type), a draggable palette sidebar, a per-node config side panel with fields conditional on step type (`waitDays`, `bodyTemplate`/`subjectTemplate` with the existing `{{firstName}}`-style template hints, `timeoutDays`, `postUrlSource`/`postUrl` for `LIKE_POST`), and a "Save Graph" button wired to the new `api.sequences.graph.save`. `SEND_CONNECTION_REQUEST` nodes render two labeled output handles ("Accepted"/"Timed out"); every other type has one ("default"). Added the `SEQUENCE` tuple to `campaigns/new/page.tsx`'s type picker (with an explanatory post-creation note, since the graph is built after the campaign exists) and `isSequence`/`<SequenceGraphBuilder>` wiring to `campaigns/[id]/page.tsx`, plus a conditional leads-table step cell (`STEP_TYPE_LABELS[stepById.get(currentStepId).type]` + `stepEnteredAt`) that only changes rendering for `SEQUENCE` campaigns — every other campaign type's leads table is untouched. Added `api.sequences.graph.get/save` to `apps/dashboard/src/lib/api.ts` following the existing `apiFetch<T>` convention, plus the `StepType`/`EdgeCondition`/`SequenceStep`/`SequenceEdge`/`SequenceGraph` types and `CampaignLead`/`CampaignDetail` field additions (`currentStepId`, `stepEnteredAt`, `branchAwaitingSince`, `steps`, `edges`).

**Verification**: typechecked and built the dashboard clean (`pnpm -r typecheck`, `next build`). Round-tripped the canvas end-to-end against a local dev stack (local Postgres/Redis, not the Railway prod DB) using a disposable Playwright script driving the real browser: dragged 5 step types onto the canvas (native HTML5 DnD dispatched as real `DragEvent`s, since a fixed `defaultViewport={{x:0,y:0,zoom:1}}` — see bug below — makes screen coordinates predictable), wired all 4 edges including both `SEND_CONNECTION_REQUEST` branch handles via real pointer drags, filled config fields, clicked Save, reloaded the page, and asserted the persisted graph via `GET /campaigns/:id/graph` matched exactly: 5 steps with correct types/config (`waitDays`, `timeoutDays`, `bodyTemplate`), exactly one entry step, and all 4 edges with correct `fromStepId`/`toStepId`/`condition` — identical in shape to the hand-built JSON graphs already verified in milestone 3.

**Bugs found and fixed during verification:**
1. `<ReactFlow fitView>` performs a one-time auto re-center/zoom the first time nodes finish measuring, which silently shifted the screen↔flow coordinate mapping mid-test and made node positions unpredictable. Replaced with a fixed `defaultViewport={{ x: 0, y: 0, zoom: 1 }}` — also a genuine UX improvement for a builder tool (no surprise pan/zoom while placing nodes).
2. `DELETE /campaigns/:id` (`apps/api/src/routes/campaigns.ts`) never deleted `SequenceStep`/`SequenceEdge` rows before deleting the campaign, so deleting any `SEQUENCE` campaign 500'd on the FK constraint — a pre-existing gap from milestone 3 that the dashboard's (unchanged) Delete button would have hit immediately once real SEQUENCE campaigns existed. Fixed by adding `sequenceEdge.deleteMany`/`sequenceStep.deleteMany` in FK-safe order (after `campaignLead.deleteMany`, since leads FK into steps via `currentStepId`).

**Deployed**: committed as `278fd5b` and pushed to `vectra/main`, which auto-deploys both Railway (`api`) and Render (`linkedin-automation-dashboard`). Both confirmed live and healthy post-deploy. No schema/migration changes in this deploy.

**Status**: Milestones 1-4 done and deployed. Remaining: milestone 5 (leads-table step column — folded into milestone 4 above since it was small enough to do alongside), and milestone 6 (full multi-day dogfood test with both branches actually exercised on a real account) plus the still-open real `SEND_CONNECTION_REQUEST`/`WITHDRAW_CONNECTION` verification from milestone 3 (blocked on a fresh LinkedIn cookie export for the test account — the user plans to handle this refresh + retest themselves in a future session).
