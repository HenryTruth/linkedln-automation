const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const TOKEN_KEY = "linkedin_auto_token";

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Proxy {
  id: string;
  host: string;
  port: number;
  country: string;
  city?: string | null;
  username: string;
  usernameTemplate?: string | null;
  healthStatus: "HEALTHY" | "DEGRADED" | "DEAD";
  rotationMode: "STATIC" | "STICKY_SESSION";
  currentSessionId?: string | null;
  currentExitIp?: string | null;
  lastSessionStartedAt?: string | null;
}

export interface ProxyCheapRemoteProxy {
  id: string;
  status: string;
  networkType: string | null;
  countryCode: string | null;
  host: string;
  httpPort: number | null;
  httpsPort: number | null;
  socks5Port: number | null;
  proxyType: string | null;
  username: string | null;
  publicIp: string | null;
  expiresAt: string | null;
  ispName: string | null;
  importable: boolean;
  importBlockReason: string | null;
}

export interface ProxyCheapImportResult {
  imported: Proxy[];
  skipped: Array<{ id: string; reason: string }>;
}

export type CapKey = "connection" | "message" | "inmail" | "profileView" | "searchPage";

export const SYSTEM_CAPS: Record<CapKey, number> = {
  connection: 15,
  message: 40,
  inmail: 10,
  profileView: 60,
  searchPage: 10,
};

export const HARD_CEILING: Record<CapKey, number> = {
  connection: 50,
  message: 150,
  inmail: 50,
  profileView: 250,
  searchPage: 40,
};

export const CAP_LABELS: Record<CapKey, string> = {
  connection: "Connections",
  message: "Messages",
  inmail: "InMails",
  profileView: "Profile Views",
  searchPage: "Search Pages",
};

export interface Account {
  id: string;
  email: string;
  status: "ACTIVE" | "PAUSED" | "RESTRICTED";
  warmUpPhase: "MANUAL" | "WEEK2" | "WEEK3" | "WEEK4" | "FULL";
  dailyCaps: Record<string, Record<string, number>>;
  monthlyCaps: Record<string, number>;
  maxDailyCaps: Record<CapKey, number>;
  salesNavigatorEnabled: boolean;
  inMailMonthlyLimit: number;
  hasSession: boolean;
  sessionStatus: "ACTIVE" | "MISSING";
  cookiesConsentAt?: string | null;
  timezone: string;
  proxy?: Proxy | null;
  createdAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  accountId: string;
  type: "CONNECT" | "MESSAGE" | "INMAIL" | "SCRAPE" | "CONTENT_SIGNAL" | "SEQUENCE";
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  dailyLimit: number;
  connectionNoteTemplate?: string | null;
  targetTimezone?: string | null;
  _count?: { leads: number };
  createdAt: string;
}

export interface Lead {
  id: string;
  linkedinUrl: string;
  firstName?: string | null;
  lastName?: string | null;
  title?: string | null;
  company?: string | null;
  source: "MANUAL" | "CSV" | "LINKEDIN_SEARCH" | "SALES_NAVIGATOR" | "CONTENT_SIGNAL";
  connectionStatus: "NONE" | "PENDING" | "CONNECTED" | "WITHDRAWN";
  blacklisted: boolean;
  blacklistReason?: string | null;
  accountId?: string | null;
  createdAt: string;
}

export type CampaignLeadJobStatus = "IDLE" | "QUEUED" | "RUNNING" | "SENT" | "SKIPPED" | "FAILED";

export interface CampaignLead {
  id: string;
  campaignId: string;
  leadId: string;
  stage: number;
  variantGroup: string;
  lastActionAt?: string | null;
  nextActionAt?: string | null;
  repliedAt?: string | null;
  jobStatus: CampaignLeadJobStatus;
  lastJobError?: string | null;
  postSignalId?: string | null;
  postSignal?: PostSignal | null;
  currentStepId?: string | null;
  stepEnteredAt?: string | null;
  branchAwaitingSince?: string | null;
  lead: Lead;
}

export type StepType =
  | "SCRAPE_SEARCH"
  | "VISIT_PROFILE"
  | "LIKE_POST"
  | "WAIT"
  | "SEND_CONNECTION_REQUEST"
  | "SEND_MESSAGE"
  | "SEND_INMAIL"
  | "WITHDRAW_CONNECTION";

export type EdgeCondition = "DEFAULT" | "CONNECTION_ACCEPTED" | "CONNECTION_TIMEOUT";

export interface SequenceStep {
  id: string;
  campaignId: string;
  type: StepType;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
  isEntry: boolean;
}

export interface SequenceEdge {
  id?: string;
  campaignId?: string;
  fromStepId: string;
  toStepId: string;
  condition: EdgeCondition;
}

export interface SequenceGraph {
  steps: SequenceStep[];
  edges: SequenceEdge[];
}

export interface Message {
  id: string;
  campaignId: string;
  sequenceOrder: number;
  subjectTemplate?: string | null;
  bodyTemplate: string;
  variantGroup: string;
  delayDays: number;
}

export interface CampaignDetail extends Campaign {
  leads: CampaignLead[];
  messages: Message[];
  contentSignalConfig?: ContentSignalConfig | null;
  steps?: SequenceStep[];
  edges?: SequenceEdge[];
}

export interface Checkpoint {
  id: string;
  accountId: string;
  detectedAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  account?: { email: string };
}

export interface ActivityLog {
  id: string;
  accountId: string;
  actionType: string;
  targetUrl?: string | null;
  result?: string | null;
  createdAt: string;
}

export interface ContentSignalConfig {
  id: string;
  campaignId: string;
  keyword: string;
  dateRangeDays: number;
  maxLeads: number;
  titleFilter?: string | null;
  companyFilter?: string | null;
  locationFilter?: string | null;
  connectionNoteTemplate?: string | null;
  lastScrapedAt?: string | null;
}

export interface PostSignal {
  id: string;
  leadId: string;
  campaignId: string;
  postUrl: string;
  excerpt: string;
  keyword: string;
  publishedAt: string;
  scrapedAt: string;
  lead: Lead;
}

export interface SearchScrapeCampaignJob {
  id?: string;
  name: string;
  state: "waiting" | "active" | "delayed" | "completed" | "failed" | string;
  attemptsMade: number;
  failedReason?: string | null;
  timestamp: number;
  processedOn?: number | null;
  finishedOn?: number | null;
  data: {
    accountId?: string;
    campaignId?: string;
    searchUrl?: string;
    source?: "LINKEDIN" | "SALES_NAVIGATOR";
    maxPages?: number;
  };
  returnvalue?: {
    scraped?: number;
    pagesScraped?: number;
    lastUrl?: string;
  } | null;
}

export interface Stats {
  connectsSentToday: number;
  messagesSentToday: number;
  inMailsSentToday: number;
  totalLeads: number;
  connectedLeads: number;
  replyRate: number;
  activeAccounts: number;
  openCheckpoints: number;
}

export interface LeadsPage {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
}

export interface LeadCsvImportResult {
  imported: number;
  created: number;
  updated: number;
  attached: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

export interface ActivityPage {
  logs: ActivityLog[];
  total: number;
  page: number;
  limit: number;
}

export interface CampaignStats {
  totalLeads: number;
  connected: number;
  pending: number;
  replied: number;
  acceptanceRate: number;
  replyRate: number;
}

export interface AppSettings {
  alert_webhook_url: string | null;
  alert_email_to: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  plan: "FREE_FOREVER" | string;
  hasAllFeatures: boolean;
}

export type JobState = "failed" | "waiting" | "active" | "delayed" | "completed";

export interface QueueJob {
  id?: string;
  queue: string;
  name: string;
  state: JobState;
  attemptsMade: number;
  failedReason: string | null;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  data: Record<string, unknown>;
}

export interface JobsPage {
  jobs: QueueJob[];
  state: JobState;
  queue: string;
  limit: number;
  counts: Record<JobState, number>;
}

// ─── API functions ─────────────────────────────────────────────────────────────

export const api = {
  auth: {
    signup: (data: { email: string; password: string }) =>
      apiFetch<{ user: AuthUser; token: string; expiresAt: string }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    login: (data: { email: string; password: string }) =>
      apiFetch<{ user: AuthUser; token: string; expiresAt: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    me: () => apiFetch<{ user: AuthUser; expiresAt: string }>("/auth/me"),
    logout: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),
  },

  stats: {
    get: () => apiFetch<Stats>("/stats"),
  },

  accounts: {
    list: () => apiFetch<Account[]>("/accounts"),
    create: (data: {
      email: string;
      timezone?: string;
      proxyId?: string;
      salesNavigatorEnabled?: boolean;
      inMailMonthlyLimit?: number;
    }) =>
      apiFetch<Account>("/accounts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    pause: (id: string) =>
      apiFetch<Account>(`/accounts/${id}/pause`, { method: "POST" }),
    resume: (id: string) =>
      apiFetch<Account>(`/accounts/${id}/resume`, { method: "POST" }),
    uploadCookies: (id: string, cookies: string, consent: boolean) =>
      apiFetch<{ ok: boolean }>(`/accounts/${id}/cookies`, {
        method: "POST",
        body: JSON.stringify({ cookies, consent }),
      }),
    advanceWarmup: (id: string) =>
      apiFetch<Account>(`/accounts/${id}/advance-warmup`, { method: "POST" }),
    downgradeWarmup: (id: string) =>
      apiFetch<Account>(`/accounts/${id}/downgrade-warmup`, { method: "POST" }),
    updateCaps: (id: string, caps: Partial<Record<CapKey, number>>) =>
      apiFetch<Account>(`/accounts/${id}/caps`, {
        method: "PUT",
        body: JSON.stringify(caps),
      }),
    update: (id: string, data: {
      email?: string;
      timezone?: string;
      proxyId?: string | null;
      salesNavigatorEnabled?: boolean;
      inMailMonthlyLimit?: number;
    }) =>
      apiFetch<Account>(`/accounts/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },

  proxies: {
    list: () => apiFetch<Proxy[]>("/proxies"),
    listProxyCheap: () =>
      apiFetch<{ proxies: ProxyCheapRemoteProxy[] }>("/proxies/proxy-cheap/remote"),
    importProxyCheap: (proxyIds?: string[]) =>
      apiFetch<ProxyCheapImportResult>("/proxies/proxy-cheap/import", {
        method: "POST",
        body: JSON.stringify({ proxyIds }),
      }),
    create: (data: {
      host: string;
      port: number;
      country: string;
      city?: string;
      username: string;
      usernameTemplate?: string;
      password: string;
      rotationMode?: "STATIC" | "STICKY_SESSION";
    }) =>
      apiFetch<Proxy>("/proxies", { method: "POST", body: JSON.stringify(data) }),
    check: (id: string) =>
      apiFetch<{
        reachable: boolean;
        healthStatus: string;
        exitIp: string | null;
        sessionId?: string | null;
        proxy: Proxy;
      }>(
        `/proxies/${id}/check`,
        { method: "POST" }
      ),
    delete: (id: string) => apiFetch<void>(`/proxies/${id}`, { method: "DELETE" }),
  },

  campaigns: {
    list: () => apiFetch<Campaign[]>("/campaigns"),
    get: (id: string) => apiFetch<CampaignDetail>(`/campaigns/${id}`),
    create: (data: {
      name: string;
      accountId: string;
      type: string;
      dailyLimit?: number;
      connectionNoteTemplate?: string | null;
      targetTimezone?: string | null;
    }) =>
      apiFetch<Campaign>("/campaigns", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<Pick<Campaign, "name" | "status" | "dailyLimit" | "connectionNoteTemplate" | "targetTimezone">>
    ) =>
      apiFetch<Campaign>(`/campaigns/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/campaigns/${id}`, { method: "DELETE" }),
    start: (id: string) =>
      apiFetch<{ dispatched: number; urls: string[] }>(
        `/campaigns/${id}/start`,
        { method: "POST" }
      ),
    addLead: (
      campaignId: string,
      data: {
        linkedinUrl: string;
        firstName?: string;
        lastName?: string;
        company?: string;
        title?: string;
        source?: Lead["source"];
      }
    ) =>
      apiFetch<{ lead: Lead; campaignLeadId: string }>(`/campaigns/${campaignId}/leads`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    addSearchUrl: (
      campaignId: string,
      searchUrl: string,
      source: "LINKEDIN" | "SALES_NAVIGATOR" = "LINKEDIN",
      leadLimit?: number
    ) =>
      apiFetch<{ queued: number; jobId?: string; searchUrl: string; source: "LINKEDIN" | "SALES_NAVIGATOR"; leadLimit?: number }>(`/campaigns/${campaignId}/search-urls`, {
        method: "POST",
        body: JSON.stringify({ searchUrl, source, leadLimit }),
      }),
    searchJobs: (id: string) =>
      apiFetch<{ jobs: SearchScrapeCampaignJob[] }>(`/campaigns/${id}/search-jobs`),
    clearSearchJobs: (id: string) =>
      apiFetch<{ removed: number }>(`/campaigns/${id}/search-jobs`, {
        method: "DELETE",
      }),
    stats: (id: string) => apiFetch<CampaignStats>(`/campaigns/${id}/stats`),
    markReplied: (campaignId: string, leadId: string) =>
      apiFetch<{ ok: boolean }>(`/campaigns/${campaignId}/leads/${leadId}/mark-replied`, {
        method: "POST",
      }),
    messages: {
      create: (
        campaignId: string,
        data: {
          sequenceOrder: number;
          subjectTemplate?: string | null;
          bodyTemplate: string;
          variantGroup?: string;
          delayDays?: number;
        }
      ) =>
        apiFetch<Message>(`/campaigns/${campaignId}/messages`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
      update: (
        campaignId: string,
        msgId: string,
        data: Partial<Pick<Message, "subjectTemplate" | "bodyTemplate" | "variantGroup" | "delayDays">>
      ) =>
        apiFetch<Message>(`/campaigns/${campaignId}/messages/${msgId}`, {
          method: "PUT",
          body: JSON.stringify(data),
        }),
      delete: (campaignId: string, msgId: string) =>
        apiFetch<void>(`/campaigns/${campaignId}/messages/${msgId}`, {
          method: "DELETE",
        }),
      reorder: (campaignId: string, ids: string[]) =>
        apiFetch<{ ok: boolean }>(`/campaigns/${campaignId}/messages/reorder`, {
          method: "PUT",
          body: JSON.stringify({ ids }),
        }),
    },
  },

  sequences: {
    graph: {
      get: (campaignId: string) =>
        apiFetch<SequenceGraph>(`/campaigns/${campaignId}/graph`),
      save: (campaignId: string, data: SequenceGraph) =>
        apiFetch<SequenceGraph>(`/campaigns/${campaignId}/graph`, {
          method: "PUT",
          body: JSON.stringify(data),
        }),
    },
  },

  leads: {
    get: (id: string) =>
      apiFetch<Lead & { campaigns: Array<{ campaign: Campaign; stage: number; repliedAt: string | null; postSignal: PostSignal | null }>; postSignals: PostSignal[] }>(`/leads/${id}`),
    list: (params?: {
      status?: string;
      company?: string;
      campaignId?: string;
      keyword?: string;
      page?: number;
      limit?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.company) q.set("company", params.company);
      if (params?.campaignId) q.set("campaignId", params.campaignId);
      if (params?.keyword) q.set("keyword", params.keyword);
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      return apiFetch<LeadsPage>(`/leads?${q}`);
    },
    create: (data: {
      linkedinUrl: string;
      firstName?: string;
      lastName?: string;
      company?: string;
      title?: string;
      accountId?: string;
      campaignId?: string;
    }) =>
      apiFetch<Lead>("/leads", { method: "POST", body: JSON.stringify(data) }),
    importCsv: (data: { csvText: string; campaignId?: string }) =>
      apiFetch<LeadCsvImportResult>("/leads/import-csv", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    exportUrl: (params?: {
      status?: string;
      company?: string;
      campaignId?: string;
      keyword?: string;
    }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set("status", params.status);
      if (params?.company) q.set("company", params.company);
      if (params?.campaignId) q.set("campaignId", params.campaignId);
      if (params?.keyword) q.set("keyword", params.keyword);
      return `${API_BASE}/leads/export?${q}`;
    },
    blacklist: (id: string, reason?: string) =>
      apiFetch<Lead>(`/leads/${id}/blacklist`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    unblacklist: (id: string) =>
      apiFetch<Lead>(`/leads/${id}/blacklist`, { method: "DELETE" }),
  },

  checkpoints: {
    list: (params?: { accountId?: string; unresolved?: boolean }) => {
      const q = new URLSearchParams();
      if (params?.accountId) q.set("accountId", params.accountId);
      if (params?.unresolved) q.set("unresolved", "true");
      return apiFetch<Checkpoint[]>(`/checkpoints?${q}`);
    },
    resolve: (id: string, resolvedBy: string) =>
      apiFetch<Checkpoint>(`/checkpoints/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolvedBy }),
      }),
  },

  contentSignal: {
    getConfig: (campaignId: string) =>
      apiFetch<ContentSignalConfig>(`/content-signal/${campaignId}`),
    saveConfig: (campaignId: string, data: Omit<ContentSignalConfig, "id" | "campaignId" | "lastScrapedAt" | "connectionNoteTemplate"> & { connectionNoteTemplate?: string | null }) =>
      apiFetch<ContentSignalConfig>(`/content-signal/${campaignId}`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    run: (campaignId: string) =>
      apiFetch<{ queued: boolean; keyword: string }>(`/content-signal/${campaignId}/run`, {
        method: "POST",
      }),
    getSignals: (campaignId: string) =>
      apiFetch<PostSignal[]>(`/content-signal/${campaignId}/signals`),
  },

  activity: {
    list: (params?: {
      accountId?: string;
      actionType?: string;
      page?: number;
      limit?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.accountId) q.set("accountId", params.accountId);
      if (params?.actionType) q.set("actionType", params.actionType);
      if (params?.page) q.set("page", String(params.page));
      if (params?.limit) q.set("limit", String(params.limit));
      return apiFetch<ActivityPage>(`/activity?${q}`);
    },
    exportUrl: (params?: { accountId?: string; actionType?: string }) => {
      const q = new URLSearchParams();
      if (params?.accountId) q.set("accountId", params.accountId);
      if (params?.actionType) q.set("actionType", params.actionType);
      return `${API_BASE}/activity/export?${q}`;
    },
  },

  settings: {
    get: () => apiFetch<AppSettings>("/settings"),
    update: (data: Partial<AppSettings>) =>
      apiFetch<{ ok: boolean }>("/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    testAlert: () =>
      apiFetch<{ ok: boolean }>("/settings/test-alert", { method: "POST" }),
  },

  jobs: {
    list: (params?: { queue?: string; state?: JobState; limit?: number }) => {
      const q = new URLSearchParams();
      if (params?.queue) q.set("queue", params.queue);
      if (params?.state) q.set("state", params.state);
      if (params?.limit) q.set("limit", String(params.limit));
      return apiFetch<JobsPage>(`/jobs?${q}`);
    },
    clearFailed: () => apiFetch<{ ok: boolean }>("/jobs/failed", { method: "DELETE" }),
  },
};
