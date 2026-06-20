const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
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

export interface Account {
  id: string;
  email: string;
  status: "ACTIVE" | "PAUSED" | "RESTRICTED";
  warmUpPhase: "MANUAL" | "WEEK2" | "WEEK3" | "WEEK4" | "FULL";
  dailyCaps: Record<string, Record<string, number>>;
  timezone: string;
  proxy?: Proxy | null;
  createdAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  accountId: string;
  type: "CONNECT" | "MESSAGE" | "SCRAPE" | "CONTENT_SIGNAL";
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  dailyLimit: number;
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
  connectionStatus: "NONE" | "PENDING" | "CONNECTED" | "WITHDRAWN";
  blacklisted: boolean;
  blacklistReason?: string | null;
  accountId?: string | null;
  createdAt: string;
}

export interface CampaignLead {
  id: string;
  campaignId: string;
  leadId: string;
  stage: number;
  variantGroup: string;
  lastActionAt?: string | null;
  nextActionAt?: string | null;
  repliedAt?: string | null;
  postSignalId?: string | null;
  postSignal?: PostSignal | null;
  lead: Lead;
}

export interface Message {
  id: string;
  campaignId: string;
  sequenceOrder: number;
  bodyTemplate: string;
  variantGroup: string;
  delayDays: number;
}

export interface CampaignDetail extends Campaign {
  leads: CampaignLead[];
  messages: Message[];
  contentSignalConfig?: ContentSignalConfig | null;
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

export interface Stats {
  connectsSentToday: number;
  messagesSentToday: number;
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

// ─── API functions ─────────────────────────────────────────────────────────────

export const api = {
  stats: {
    get: () => apiFetch<Stats>("/stats"),
  },

  accounts: {
    list: () => apiFetch<Account[]>("/accounts"),
    create: (data: { email: string; timezone?: string; proxyId?: string }) =>
      apiFetch<Account>("/accounts", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    pause: (id: string) =>
      apiFetch<Account>(`/accounts/${id}/pause`, { method: "POST" }),
    resume: (id: string) =>
      apiFetch<Account>(`/accounts/${id}/resume`, { method: "POST" }),
    uploadCookies: (id: string, cookies: string) =>
      apiFetch<{ ok: boolean }>(`/accounts/${id}/cookies`, {
        method: "POST",
        body: JSON.stringify({ cookies }),
      }),
    advanceWarmup: (id: string) =>
      apiFetch<Account>(`/accounts/${id}/advance-warmup`, { method: "POST" }),
  },

  proxies: {
    list: () => apiFetch<Proxy[]>("/proxies"),
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
    }) =>
      apiFetch<Campaign>("/campaigns", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<Pick<Campaign, "name" | "status" | "dailyLimit">>
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
      }
    ) =>
      apiFetch<{ lead: Lead; campaignLeadId: string }>(`/campaigns/${campaignId}/leads`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    addSearchUrl: (campaignId: string, searchUrl: string) =>
      apiFetch<{ queued: number }>(`/campaigns/${campaignId}/search-urls`, {
        method: "POST",
        body: JSON.stringify({ searchUrl }),
      }),
    messages: {
      create: (
        campaignId: string,
        data: {
          sequenceOrder: number;
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
        data: Partial<Pick<Message, "bodyTemplate" | "variantGroup" | "delayDays">>
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
};
