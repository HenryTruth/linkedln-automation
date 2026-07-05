import { Queue } from "bullmq";
import { getConnection } from "./redis.js";

const defaultJobOptions = {
  removeOnComplete: 100,
  removeOnFail: 200,
  attempts: 2,
  backoff: { type: "exponential" as const, delay: 5_000 },
};

export interface ConnectJobData {
  accountId: string;
  leadId: string;
  linkedinUrl: string;
  note?: string;
  campaignLeadId?: string;
}

export interface MessageJobData {
  accountId: string;
  leadId: string;
  linkedinUrl: string;
  messageBody: string;
  campaignLeadId: string;
  /** Present when dispatched by the sequence engine — skips duplicate-action guard */
  sequenceStep?: number;
  /** Lead's company, forwarded so message.processor can run the same-company throttle */
  company?: string | null;
}

export interface InMailJobData {
  accountId: string;
  leadId: string;
  linkedinUrl: string;
  subject: string;
  messageBody: string;
  campaignLeadId: string;
  company?: string | null;
}

export interface SequenceDispatchJobData {
  /** Intentionally empty — the processor scans the DB for due leads */
  _tick: true;
}

export interface ScrapeJobData {
  accountId: string;
  linkedinUrl: string;
  campaignId?: string;
  campaignLeadId?: string;
}

export interface WithdrawJobData {
  accountId: string;
}

export interface SearchScrapeJobData {
  accountId: string;
  searchUrl: string;
  campaignId?: string;
  maxPages?: number;
  source?: "LINKEDIN" | "SALES_NAVIGATOR";
}

export interface ContentSignalJobData {
  accountId: string;
  campaignId: string;
  keyword: string;
  dateRangeDays: number;
  maxLeads: number;
  titleFilter?: string | null;
  companyFilter?: string | null;
  locationFilter?: string | null;
  /** Guard D: connection note template — must include {{postTopic}}, {{postExcerpt}}, or {{postDate}} */
  connectionNoteTemplate?: string | null;
}

export const connectQueue = new Queue<ConnectJobData>("connect", {
  connection: getConnection(),
  defaultJobOptions,
});

export const messageQueue = new Queue<MessageJobData>("message", {
  connection: getConnection(),
  defaultJobOptions,
});

export const inMailQueue = new Queue<InMailJobData>("inMail", {
  connection: getConnection(),
  defaultJobOptions,
});

export const scrapeQueue = new Queue<ScrapeJobData>("scrape", {
  connection: getConnection(),
  defaultJobOptions,
});

export const withdrawQueue = new Queue<WithdrawJobData>("withdraw", {
  connection: getConnection(),
  defaultJobOptions,
});

export const searchScrapeQueue = new Queue<SearchScrapeJobData>("searchScrape", {
  connection: getConnection(),
  defaultJobOptions,
});

export const sequenceDispatchQueue = new Queue<SequenceDispatchJobData>(
  "sequenceDispatch",
  { connection: getConnection(), defaultJobOptions }
);

export const contentSignalQueue = new Queue<ContentSignalJobData>(
  "contentSignal",
  { connection: getConnection(), defaultJobOptions }
);

export interface AnomalyCheckJobData {
  _tick: true;
}

export const anomalyCheckQueue = new Queue<AnomalyCheckJobData>(
  "anomalyCheck",
  { connection: getConnection(), defaultJobOptions }
);

export interface SyncStatusJobData {
  _tick: true;
}

export const syncStatusQueue = new Queue<SyncStatusJobData>(
  "syncStatus",
  { connection: getConnection(), defaultJobOptions }
);
