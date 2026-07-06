/**
 * End-to-end verification harness for milestone 3 of the SEQUENCE engine
 * (docs/plans/sequence-builder-engine.md §7.3) — run against the real
 * production account before any dashboard/canvas work starts.
 *
 * Two phases:
 *
 *  Phase 1 — branch/completion logic, zero LinkedIn risk. Two throwaway
 *  campaigns against a BLACKLISTED synthetic lead (every processor's
 *  blacklist guard fires before any browser is ever touched, so
 *  SEND_CONNECTION_REQUEST / SEND_MESSAGE / WITHDRAW_CONNECTION dispatch
 *  through the real processors here but always safely no-op). Exercises:
 *  WAIT elapsing, dispatch of every step type, the ACCEPTED branch, the
 *  TIMEOUT branch, and campaignCompletion's SEQUENCE branch.
 *
 *  Phase 2 — real browser actions against a real lead the operator supplied
 *  (VISIT_PROFILE, LIKE_POST, SEND_CONNECTION_REQUEST, WITHDRAW_CONNECTION).
 *  Does NOT exercise the ACCEPTED branch for real (that would require a real
 *  stranger to actually accept, or faking acceptance and then sending them
 *  an unsolicited "thanks for connecting" message they never agreed to) —
 *  that branch is already covered by Phase 1. Phase 2 forces the TIMEOUT
 *  branch instead, which only ever retracts our own just-sent request.
 *
 * Usage (run from repo root):
 *   DATABASE_URL="<DATABASE_PUBLIC_URL>" ENCRYPTION_KEY="<key>" \
 *   HEADLESS=false REQUIRE_PROXY=true \
 *   npx tsx scripts/verify-sequence-engine.ts <accountId> <leadProfileUrl> <postUrl>
 */
import {
  prisma,
  CampaignType,
  CampaignStatus,
  StepType,
  EdgeCondition,
  LeadSource,
} from "@linkedin-automation/db";
import {
  sequenceEngineProcessor,
  connectProcessor,
  messageProcessor,
  likePostProcessor,
  withdrawSingleProcessor,
  visitProfileProcessor,
  advanceSequenceLead,
  activateSequenceEngineAcceptedBranch,
  activateSequenceEngineTimeoutBranch,
  connectQueue,
  messageQueue,
  likePostQueue,
  withdrawSingleQueue,
  visitProfileQueue,
} from "@linkedin-automation/queue";
import type { Job } from "bullmq";

function log(msg: string): void {
  console.log(`[verify] ${msg}`);
}

async function tick(): Promise<void> {
  await sequenceEngineProcessor({ data: { _tick: true } } as Job<{ _tick: true }>);
}

/** Fetch a queued job by its deterministic id, remove it from Redis (so no
 * other consumer — including the live production fleet, for shared queues
 * like "connect" — can double-process it), then hand the captured data to
 * the real processor function directly. */
async function drainAndProcess<T extends Record<string, unknown>>(
  queue: { getJob: (id: string) => Promise<{ data: T; remove: () => Promise<void> } | undefined> },
  jobId: string,
  processor: (job: Job<T>) => Promise<void>
): Promise<void> {
  const job = await queue.getJob(jobId);
  if (!job) throw new Error(`Expected job ${jobId} to be queued but it wasn't found`);
  const data = job.data;
  await job.remove();
  await processor({ id: jobId, data } as unknown as Job<T>);
}

async function fetchLead(campaignLeadId: string) {
  return prisma.campaignLead.findUniqueOrThrow({
    where: { id: campaignLeadId },
    select: {
      id: true,
      currentStepId: true,
      currentStep: { select: { type: true } },
      branchAwaitingSince: true,
      jobStatus: true,
      lastJobError: true,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 1 — branch/completion logic against a blacklisted synthetic lead
// ─────────────────────────────────────────────────────────────────────────

async function runPhase1(accountId: string, userId: string): Promise<void> {
  log("=== PHASE 1: branch + completion logic (blacklisted synthetic lead, zero LinkedIn risk) ===");

  const lead = await prisma.lead.upsert({
    where: {
      userId_linkedinUrl: {
        userId,
        linkedinUrl: "https://www.linkedin.com/in/sequence-engine-synthetic-test/",
      },
    },
    create: {
      userId,
      accountId,
      linkedinUrl: "https://www.linkedin.com/in/sequence-engine-synthetic-test/",
      firstName: "Synthetic",
      lastName: "TestLead",
      source: LeadSource.MANUAL,
      blacklisted: true,
      blacklistReason: "sequence-engine verification fixture — never a real dispatch target",
    },
    update: { blacklisted: true },
  });
  log(`Synthetic lead ready: ${lead.id} (blacklisted=${lead.blacklisted})`);

  // ── Campaign A: force the ACCEPTED branch ──────────────────────────────
  const campaignA = await prisma.campaign.create({
    data: { name: "[verify] SEQ accepted-branch", accountId, type: CampaignType.SEQUENCE },
  });
  const entryA = await prisma.sequenceStep.create({
    data: { campaignId: campaignA.id, type: StepType.WAIT, config: { waitDays: 0 }, isEntry: true },
  });
  const connectA = await prisma.sequenceStep.create({
    data: { campaignId: campaignA.id, type: StepType.SEND_CONNECTION_REQUEST, config: { timeoutDays: 999 } },
  });
  const thankyouA = await prisma.sequenceStep.create({
    data: {
      campaignId: campaignA.id,
      type: StepType.SEND_MESSAGE,
      config: { bodyTemplate: "Thanks for connecting, {{firstName}}!" },
    },
  });
  await prisma.sequenceEdge.createMany({
    data: [
      { campaignId: campaignA.id, fromStepId: entryA.id, toStepId: connectA.id, condition: EdgeCondition.DEFAULT },
      {
        campaignId: campaignA.id,
        fromStepId: connectA.id,
        toStepId: thankyouA.id,
        condition: EdgeCondition.CONNECTION_ACCEPTED,
      },
    ],
  });
  const clA = await prisma.campaignLead.create({
    data: { campaignId: campaignA.id, leadId: lead.id, currentStepId: entryA.id, stepEnteredAt: new Date() },
  });
  log(`Campaign A (accepted-branch) seeded: campaign=${campaignA.id} campaignLead=${clA.id}`);

  await tick(); // WAIT elapses (waitDays: 0) -> advances to connectA
  let state = await fetchLead(clA.id);
  if (state.currentStepId !== connectA.id) {
    throw new Error(`Expected WAIT to advance to connectA, got currentStepId=${state.currentStepId}`);
  }
  log("WAIT step elapsed and advanced to SEND_CONNECTION_REQUEST as expected.");

  await tick(); // dispatches SEND_CONNECTION_REQUEST
  const connectJobIdA = `sequence-${clA.id}-step-${connectA.id}-connect`;
  await drainAndProcess(connectQueue, connectJobIdA, connectProcessor);
  await advanceSequenceLead(clA.id); // mimics the "completed" hook
  state = await fetchLead(clA.id);
  if (!state.branchAwaitingSince || state.currentStepId !== connectA.id) {
    throw new Error("Expected SEND_CONNECTION_REQUEST completion to set branchAwaitingSince and hold currentStepId");
  }
  log("SEND_CONNECTION_REQUEST dispatched through connectProcessor (blacklist-guarded no-op) and branchAwaitingSince set.");

  await activateSequenceEngineAcceptedBranch(lead.id, accountId);
  state = await fetchLead(clA.id);
  if (state.currentStepId !== thankyouA.id || state.branchAwaitingSince) {
    throw new Error(`Expected ACCEPTED branch to move to thankyouA, got ${JSON.stringify(state)}`);
  }
  log("activateSequenceEngineAcceptedBranch correctly followed the CONNECTION_ACCEPTED edge to SEND_MESSAGE.");

  await tick(); // dispatches SEND_MESSAGE
  const messageJobIdA = `sequence-${clA.id}-step-${thankyouA.id}-message`;
  await drainAndProcess(messageQueue, messageJobIdA, messageProcessor);
  await advanceSequenceLead(clA.id);
  state = await fetchLead(clA.id);
  const campaignAAfter = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignA.id } });
  if (state.currentStepId !== null || campaignAAfter.status !== CampaignStatus.COMPLETED) {
    throw new Error(
      `Expected graph exhaustion to clear currentStepId and complete campaign A, got ${JSON.stringify(state)} status=${campaignAAfter.status}`
    );
  }
  log("SEND_MESSAGE dispatched (blacklist-guarded no-op), graph exhausted, campaign A auto-completed. ✔");

  // ── Campaign B: force the TIMEOUT branch ───────────────────────────────
  const campaignB = await prisma.campaign.create({
    data: { name: "[verify] SEQ timeout-branch", accountId, type: CampaignType.SEQUENCE },
  });
  const entryB = await prisma.sequenceStep.create({
    data: { campaignId: campaignB.id, type: StepType.WAIT, config: { waitDays: 0 }, isEntry: true },
  });
  const connectB = await prisma.sequenceStep.create({
    data: { campaignId: campaignB.id, type: StepType.SEND_CONNECTION_REQUEST, config: { timeoutDays: 0 } },
  });
  const withdrawB = await prisma.sequenceStep.create({
    data: { campaignId: campaignB.id, type: StepType.WITHDRAW_CONNECTION, config: {} },
  });
  await prisma.sequenceEdge.createMany({
    data: [
      { campaignId: campaignB.id, fromStepId: entryB.id, toStepId: connectB.id, condition: EdgeCondition.DEFAULT },
      {
        campaignId: campaignB.id,
        fromStepId: connectB.id,
        toStepId: withdrawB.id,
        condition: EdgeCondition.CONNECTION_TIMEOUT,
      },
    ],
  });
  const clB = await prisma.campaignLead.create({
    data: { campaignId: campaignB.id, leadId: lead.id, currentStepId: entryB.id, stepEnteredAt: new Date() },
  });
  log(`Campaign B (timeout-branch) seeded: campaign=${campaignB.id} campaignLead=${clB.id}`);

  await tick(); // WAIT elapses
  await tick(); // dispatches SEND_CONNECTION_REQUEST
  const connectJobIdB = `sequence-${clB.id}-step-${connectB.id}-connect`;
  await drainAndProcess(connectQueue, connectJobIdB, connectProcessor);
  await advanceSequenceLead(clB.id);

  await activateSequenceEngineTimeoutBranch(); // timeoutDays: 0 -> always "elapsed"
  state = await fetchLead(clB.id);
  if (state.currentStepId !== withdrawB.id || state.branchAwaitingSince) {
    throw new Error(`Expected TIMEOUT branch to move to withdrawB, got ${JSON.stringify(state)}`);
  }
  log("activateSequenceEngineTimeoutBranch correctly followed the CONNECTION_TIMEOUT edge to WITHDRAW_CONNECTION.");

  await tick(); // dispatches WITHDRAW_CONNECTION
  const withdrawJobIdB = `sequence-${clB.id}-step-${withdrawB.id}-withdraw`;
  await drainAndProcess(withdrawSingleQueue, withdrawJobIdB, withdrawSingleProcessor);
  await advanceSequenceLead(clB.id);
  state = await fetchLead(clB.id);
  const campaignBAfter = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignB.id } });
  if (state.currentStepId !== null || campaignBAfter.status !== CampaignStatus.COMPLETED) {
    throw new Error(
      `Expected graph exhaustion to clear currentStepId and complete campaign B, got ${JSON.stringify(state)} status=${campaignBAfter.status}`
    );
  }
  log("WITHDRAW_CONNECTION dispatched (blacklist-guarded no-op), graph exhausted, campaign B auto-completed. ✔");

  // Cleanup — this is throwaway fixture data, not a real business lead/campaign.
  for (const campaignId of [campaignA.id, campaignB.id]) {
    await prisma.campaignLead.deleteMany({ where: { campaignId } });
    await prisma.sequenceEdge.deleteMany({ where: { campaignId } });
    await prisma.sequenceStep.deleteMany({ where: { campaignId } });
    await prisma.campaign.delete({ where: { id: campaignId } });
  }
  await prisma.lead.delete({ where: { id: lead.id } });
  log("Phase 1 fixtures cleaned up.\n");
}

// ─────────────────────────────────────────────────────────────────────────
// Phase 2 — real browser actions against a real lead, real post
// ─────────────────────────────────────────────────────────────────────────

async function runPhase2(
  accountId: string,
  userId: string,
  leadProfileUrl: string,
  postUrl: string
): Promise<void> {
  log("=== PHASE 2: real browser actions against the real production account ===");

  const lead = await prisma.lead.upsert({
    where: { userId_linkedinUrl: { userId, linkedinUrl: leadProfileUrl } },
    create: {
      userId,
      accountId,
      linkedinUrl: leadProfileUrl,
      firstName: "Blessing",
      source: LeadSource.MANUAL,
    },
    update: {},
  });
  log(`Real lead ready: ${lead.id} (${leadProfileUrl})`);

  const campaign = await prisma.campaign.create({
    data: { name: "[verify] SEQ engine E2E (real)", accountId, type: CampaignType.SEQUENCE },
  });

  const entry = await prisma.sequenceStep.create({
    data: { campaignId: campaign.id, type: StepType.VISIT_PROFILE, config: {}, isEntry: true },
  });
  const like = await prisma.sequenceStep.create({
    data: { campaignId: campaign.id, type: StepType.LIKE_POST, config: { postUrlSource: "referenced" } },
  });
  const wait = await prisma.sequenceStep.create({
    data: { campaignId: campaign.id, type: StepType.WAIT, config: { waitDays: 0 } },
  });
  const connect = await prisma.sequenceStep.create({
    data: {
      campaignId: campaign.id,
      type: StepType.SEND_CONNECTION_REQUEST,
      config: {
        bodyTemplate: "Hi {{firstName}}, enjoyed your post about {{postExcerpt}} — would love to connect!",
        timeoutDays: 0,
      },
    },
  });
  const withdraw = await prisma.sequenceStep.create({
    data: { campaignId: campaign.id, type: StepType.WITHDRAW_CONNECTION, config: {} },
  });
  await prisma.sequenceEdge.createMany({
    data: [
      { campaignId: campaign.id, fromStepId: entry.id, toStepId: like.id, condition: EdgeCondition.DEFAULT },
      { campaignId: campaign.id, fromStepId: like.id, toStepId: wait.id, condition: EdgeCondition.DEFAULT },
      { campaignId: campaign.id, fromStepId: wait.id, toStepId: connect.id, condition: EdgeCondition.DEFAULT },
      {
        campaignId: campaign.id,
        fromStepId: connect.id,
        toStepId: withdraw.id,
        condition: EdgeCondition.CONNECTION_TIMEOUT,
      },
    ],
  });

  const postSignal = await prisma.postSignal.create({
    data: {
      leadId: lead.id,
      campaignId: campaign.id,
      postUrl,
      excerpt: "your recent post",
      keyword: "sequence-engine-verification",
      publishedAt: new Date(),
    },
  });

  const cl = await prisma.campaignLead.create({
    data: {
      campaignId: campaign.id,
      leadId: lead.id,
      postSignalId: postSignal.id,
      currentStepId: entry.id,
      stepEnteredAt: new Date(),
    },
  });
  log(`Campaign seeded: campaign=${campaign.id} campaignLead=${cl.id} postSignal=${postSignal.id}`);

  // 1. VISIT_PROFILE — real profile visit.
  await tick();
  await drainAndProcess(
    visitProfileQueue,
    `sequence-${cl.id}-step-${entry.id}-visit`,
    visitProfileProcessor
  );
  await advanceSequenceLead(cl.id);
  let state = await fetchLead(cl.id);
  log(`VISIT_PROFILE done. currentStep=${state.currentStep?.type} jobStatus=${state.jobStatus}`);
  if (state.currentStepId !== like.id) throw new Error("Expected to advance to LIKE_POST after VISIT_PROFILE");

  // 2. LIKE_POST — real like, resolved via the referenced PostSignal.
  await tick();
  await drainAndProcess(likePostQueue, `sequence-${cl.id}-step-${like.id}-like`, likePostProcessor);
  await advanceSequenceLead(cl.id);
  state = await fetchLead(cl.id);
  log(`LIKE_POST done. currentStep=${state.currentStep?.type} jobStatus=${state.jobStatus}`);
  if (state.currentStepId !== wait.id) throw new Error("Expected to advance to WAIT after LIKE_POST");

  // 3. WAIT (waitDays: 0) — elapses immediately, advances inline.
  await tick();
  state = await fetchLead(cl.id);
  log(`WAIT done. currentStep=${state.currentStep?.type}`);
  if (state.currentStepId !== connect.id) throw new Error("Expected to advance to SEND_CONNECTION_REQUEST after WAIT");

  // 4. SEND_CONNECTION_REQUEST — REAL send. Drain immediately to keep this
  // off the shared "connect" queue before Railway's live worker can grab it.
  await tick();
  await drainAndProcess(connectQueue, `sequence-${cl.id}-step-${connect.id}-connect`, connectProcessor);
  await advanceSequenceLead(cl.id);
  state = await fetchLead(cl.id);
  const leadAfterConnect = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  log(
    `SEND_CONNECTION_REQUEST done. jobStatus=${state.jobStatus} lead.connectionStatus=${leadAfterConnect.connectionStatus} branchAwaitingSince=${state.branchAwaitingSince}`
  );
  if (!state.branchAwaitingSince) throw new Error("Expected branchAwaitingSince to be set after real connect send");

  // 5. Force the TIMEOUT branch (timeoutDays: 0) — never touches the browser.
  await activateSequenceEngineTimeoutBranch();
  state = await fetchLead(cl.id);
  log(`Timeout branch resolved. currentStep=${state.currentStep?.type}`);
  if (state.currentStepId !== withdraw.id) throw new Error("Expected TIMEOUT branch to move to WITHDRAW_CONNECTION");

  // 6. WITHDRAW_CONNECTION — REAL withdraw of the request just sent.
  await tick();
  await drainAndProcess(
    withdrawSingleQueue,
    `sequence-${cl.id}-step-${withdraw.id}-withdraw`,
    withdrawSingleProcessor
  );
  await advanceSequenceLead(cl.id);
  state = await fetchLead(cl.id);
  const leadAfterWithdraw = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  const campaignAfter = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
  log(
    `WITHDRAW_CONNECTION done. jobStatus=${state.jobStatus} lead.connectionStatus=${leadAfterWithdraw.connectionStatus} campaign.status=${campaignAfter.status}`
  );
  if (state.currentStepId !== null || campaignAfter.status !== CampaignStatus.COMPLETED) {
    throw new Error("Expected graph exhaustion to clear currentStepId and auto-complete the campaign");
  }
  log("Phase 2 complete — full real graph walk verified end to end. ✔\n");

  // Cleanup DB fixtures (the real LinkedIn-side actions already happened and
  // are not undone by this — the withdraw step above already retracted the
  // real connection request).
  await prisma.campaignLead.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.postSignal.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.sequenceEdge.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.sequenceStep.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.campaign.delete({ where: { id: campaign.id } });
  await prisma.lead.delete({ where: { id: lead.id } });
  log("Phase 2 fixtures cleaned up.");
}

async function main(): Promise<void> {
  const [accountId, leadProfileUrl, postUrl] = process.argv.slice(2);
  if (!accountId || !leadProfileUrl || !postUrl) {
    console.error("Usage: tsx verify-sequence-engine.ts <accountId> <leadProfileUrl> <postUrl>");
    process.exit(1);
  }

  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { userId: true },
  });

  try {
    await runPhase1(accountId, account.userId);
    await runPhase2(accountId, account.userId, leadProfileUrl, postUrl);
    log("ALL PHASES PASSED.");
  } catch (err) {
    console.error("FAILED:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
