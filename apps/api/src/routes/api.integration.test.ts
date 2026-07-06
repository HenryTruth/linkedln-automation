import express, { type Express } from "express";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorMiddleware } from "../middleware/error.js";

const makePrismaMock = () => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  authSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
  },
  account: {
    findMany: vi.fn(),
    findFirstOrThrow: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
  },
  campaign: {
    findMany: vi.fn(),
    findFirstOrThrow: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  campaignLead: {
    upsert: vi.fn(),
    count: vi.fn(),
  },
  lead: {
    findMany: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    findFirstOrThrow: vi.fn(),
    updateMany: vi.fn(),
  },
});

const prisma = makePrismaMock();

const emptyJobCounts = {
  active: 0,
  waiting: 0,
  delayed: 0,
  completed: 0,
  failed: 0,
};

const makeQueueMock = () => ({
  add: vi.fn(),
  getJobs: vi.fn(),
  getJobCounts: vi.fn().mockResolvedValue(emptyJobCounts),
});

const queues = {
  connectQueue: makeQueueMock(),
  messageQueue: makeQueueMock(),
  scrapeQueue: makeQueueMock(),
  searchScrapeQueue: makeQueueMock(),
  withdrawQueue: makeQueueMock(),
  sequenceDispatchQueue: makeQueueMock(),
  contentSignalQueue: makeQueueMock(),
  anomalyCheckQueue: makeQueueMock(),
  syncStatusQueue: makeQueueMock(),
  scheduleWithdrawalForAccount: vi.fn(),
};

vi.mock("@linkedin-automation/db", () => ({
  prisma,
  AccountStatus: {
    ACTIVE: "ACTIVE",
    PAUSED: "PAUSED",
    RESTRICTED: "RESTRICTED",
  },
  CampaignStatus: {
    ACTIVE: "ACTIVE",
    PAUSED: "PAUSED",
    COMPLETED: "COMPLETED",
  },
  CampaignType: {
    CONNECT: "CONNECT",
    MESSAGE: "MESSAGE",
    INMAIL: "INMAIL",
    SCRAPE: "SCRAPE",
    CONTENT_SIGNAL: "CONTENT_SIGNAL",
  },
  LeadSource: {
    MANUAL: "MANUAL",
    CSV: "CSV",
    LINKEDIN_SEARCH: "LINKEDIN_SEARCH",
    SALES_NAVIGATOR: "SALES_NAVIGATOR",
    CONTENT_SIGNAL: "CONTENT_SIGNAL",
  },
  ConnectionStatus: {
    NONE: "NONE",
    PENDING: "PENDING",
    CONNECTED: "CONNECTED",
    WITHDRAWN: "WITHDRAWN",
  },
  WarmUpPhase: {
    MANUAL: "MANUAL",
    WEEK2: "WEEK2",
    WEEK3: "WEEK3",
    WEEK4: "WEEK4",
    FULL: "FULL",
  },
}));

vi.mock("@linkedin-automation/queue", () => ({
  ...queues,
}));

vi.mock("@linkedin-automation/guards", () => {
  class DailyCapExceededError extends Error {}
  class WarmUpError extends Error {}
  class AnomalyError extends Error {}
  class AccountPausedError extends Error {}

  return {
    DailyCapExceededError,
    WarmUpError,
    AnomalyError,
    AccountPausedError,
    HARD_CEILING: { connection: 50, message: 150, profileView: 250, searchPage: 40 },
    SYSTEM_CAPS: { connection: 15, message: 40, profileView: 60, searchPage: 10 },
    encrypt: (value: string) => `encrypted:${value}`,
    renderTemplate: (template: string, data: Record<string, unknown>) =>
      template.replace(/\{\{(\w+)\}\}/g, (_match, key) => String(data[key] ?? "")),
    validateTemplate: vi.fn(),
  };
});

const TEST_USER = {
  id: "user_1",
  email: "owner@example.com",
  plan: "FREE_FOREVER",
};

async function createApp(): Promise<Express> {
  const [
    { authRouter },
    { accountsRouter },
    { campaignsRouter },
    { leadsRouter },
    { jobsRouter },
  ] = await Promise.all([
    import("./auth.js"),
    import("./accounts.js"),
    import("./campaigns.js"),
    import("./leads.js"),
    import("./jobs.js"),
  ]);

  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  app.use((req, _res, next) => {
    req.user = TEST_USER;
    next();
  });
  app.use("/accounts", accountsRouter);
  app.use("/campaigns", campaignsRouter);
  app.use("/leads", leadsRouter);
  app.use("/jobs", jobsRouter);
  app.use(errorMiddleware);
  return app;
}

async function request(
  app: Express,
  path: string,
  init: RequestInit = {}
): Promise<{ status: number; body: any; text: string }> {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = init.method ?? "GET";
  req.url = path;
  req.headers = {
    "content-type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };

  const body = typeof init.body === "string" ? init.body : "";
  if (body) {
    req.headers["content-length"] = Buffer.byteLength(body).toString();
  }

  const res = new ServerResponse(req);
  res.assignSocket(socket);

  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    res.write = ((chunk: unknown, ...args: unknown[]) => {
      if (chunk) chunks.push(Buffer.from(chunk as string | Buffer));
      const callback = args.find((arg) => typeof arg === "function") as
        | (() => void)
        | undefined;
      callback?.();
      return true;
    }) as typeof res.write;

    res.end = ((chunk: unknown, ...args: unknown[]) => {
      if (chunk) chunks.push(Buffer.from(chunk as string | Buffer));
      const callback = args.find((arg) => typeof arg === "function") as
        | (() => void)
        | undefined;
      const text = Buffer.concat(chunks).toString("utf8");
      resolve({
        status: res.statusCode,
        text,
        body: text ? JSON.parse(text) : undefined,
      });
      callback?.();
      return res;
    }) as typeof res.end;

    req.on("error", reject);
    res.on("error", reject);
    app(req, res);
    req.push(body);
    req.push(null);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.user.findUnique.mockReset();
  prisma.user.create.mockReset();
  prisma.authSession.create.mockReset();
  prisma.authSession.findUnique.mockReset();
  prisma.authSession.deleteMany.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("API route integration", () => {
  it("signs up a new user and returns a public user plus session token", async () => {
    const app = await createApp();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(TEST_USER);
    prisma.authSession.create.mockResolvedValue({});

    const res = await request(app, "/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "OWNER@EXAMPLE.COM", password: "secret" }),
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      id: TEST_USER.id,
      email: TEST_USER.email,
      hasAllFeatures: true,
    });
    expect(res.body.token).toEqual(expect.any(String));
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: TEST_USER.email,
        plan: "FREE_FOREVER",
        passwordHash: expect.stringMatching(/^[a-f0-9]+:[a-f0-9]+$/),
      }),
      select: { id: true, email: true, plan: true },
    });
  });

  it("creates an owned account and schedules withdrawal maintenance", async () => {
    const app = await createApp();
    const account = {
      id: "acct_1",
      userId: TEST_USER.id,
      email: "linkedin@example.com",
      timezone: "America/New_York",
    };
    prisma.account.create.mockResolvedValue(account);
    queues.scheduleWithdrawalForAccount.mockResolvedValue(undefined);

    const res = await request(app, "/accounts", {
      method: "POST",
      body: JSON.stringify({ email: account.email }),
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject(account);
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: account.email,
        userId: TEST_USER.id,
        timezone: "America/New_York",
      }),
    });
    expect(queues.scheduleWithdrawalForAccount).toHaveBeenCalledWith(account.id);
  });

  it("rejects session cookie uploads without explicit consent", async () => {
    const app = await createApp();

    const res = await request(app, "/accounts/acct_1/cookies", {
      method: "POST",
      body: JSON.stringify({ cookies: "[]" }),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
    expect(prisma.account.updateMany).not.toHaveBeenCalled();
  });

  it("stores encrypted session cookies with a consent timestamp", async () => {
    const app = await createApp();
    prisma.account.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app, "/accounts/acct_1/cookies", {
      method: "POST",
      body: JSON.stringify({ cookies: "[]", consent: true }),
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(prisma.account.updateMany).toHaveBeenCalledWith({
      where: { id: "acct_1", userId: TEST_USER.id },
      data: {
        cookiesEncrypted: "encrypted:[]",
        cookiesConsentAt: expect.any(Date),
      },
    });
  });

  it("creates a campaign only after checking account ownership", async () => {
    const app = await createApp();
    const campaign = {
      id: "camp_1",
      accountId: "acct_1",
      name: "Founders",
      type: "CONNECT",
      dailyLimit: 10,
    };
    prisma.account.findFirstOrThrow.mockResolvedValue({ id: campaign.accountId });
    prisma.campaign.create.mockResolvedValue(campaign);

    const res = await request(app, "/campaigns", {
      method: "POST",
      body: JSON.stringify({
        name: campaign.name,
        accountId: campaign.accountId,
        type: campaign.type,
      }),
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject(campaign);
    expect(prisma.account.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: campaign.accountId, userId: TEST_USER.id },
      select: { id: true },
    });
  });

  it("imports CSV leads, deduplicates rows, and attaches them to a campaign", async () => {
    const app = await createApp();
    prisma.campaign.findFirstOrThrow.mockResolvedValue({
      id: "camp_1",
      accountId: "acct_1",
    });
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.upsert
      .mockResolvedValueOnce({ id: "lead_1", linkedinUrl: "https://linkedin.com/in/a" })
      .mockResolvedValueOnce({ id: "lead_2", linkedinUrl: "https://linkedin.com/in/b" });
    prisma.campaignLead.upsert.mockResolvedValue({});

    const csvText = [
      "linkedinUrl,firstName,lastName,company,title",
      "https://linkedin.com/in/a,Alice,Ng,Acme,CEO",
      "https://linkedin.com/in/a,Alice,Ng,Acme,CEO",
      "https://linkedin.com/in/b,Ben,Khan,Bravo,VP Sales",
      "not-a-url,Bad,Row,Nope,Nope",
    ].join("\n");

    const res = await request(app, "/leads/import-csv", {
      method: "POST",
      body: JSON.stringify({ csvText, campaignId: "camp_1" }),
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      imported: 2,
      created: 2,
      updated: 0,
      attached: 2,
      skipped: 2,
    });
    expect(prisma.campaignLead.upsert).toHaveBeenCalledTimes(2);
  });

  it("lists queue jobs scoped to the authenticated user's accounts and campaigns", async () => {
    const app = await createApp();
    prisma.account.findMany.mockResolvedValue([{ id: "acct_1" }]);
    prisma.campaign.findMany.mockResolvedValue([{ id: "camp_1" }]);
    queues.connectQueue.getJobs.mockResolvedValue([
      {
        id: "job_1",
        name: "connect",
        attemptsMade: 1,
        failedReason: "boom",
        timestamp: 10,
        processedOn: 20,
        finishedOn: 30,
        data: { accountId: "acct_1", leadId: "lead_1" },
      },
      {
        id: "job_2",
        name: "connect",
        attemptsMade: 0,
        failedReason: null,
        timestamp: 11,
        processedOn: null,
        finishedOn: null,
        data: { accountId: "other_account" },
      },
    ]);

    queues.connectQueue.getJobCounts.mockResolvedValue({
      ...emptyJobCounts,
      failed: 1,
    });

    const res = await request(app, "/jobs?queue=connect&state=failed");

    expect(res.status).toBe(200);
    expect(res.body.counts).toMatchObject({ failed: 1 });
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0]).toMatchObject({
      id: "job_1",
      queue: "connect",
      state: "failed",
      data: { accountId: "acct_1", leadId: "lead_1" },
    });
    expect(queues.connectQueue.getJobs).toHaveBeenCalledWith(["failed"], 0, 49, false);
  });
});
