import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma, LeadSource } from "@linkedin-automation/db";
import { searchScrapeQueue } from "@linkedin-automation/queue";
import { remainingDailyCap } from "@linkedin-automation/guards";
import { hasActiveBrowserSession } from "./browserSessions.js";
import {
  SEARCH_QUALIFICATION_TTL_MS,
  REQUIRE_SEARCH_QUALIFICATION,
  isSalesNavigatorUrl,
  assertAccountReadyForScraping,
  normalizeSearchUrlForQualification,
} from "./searchScrapeGuards.js";

export const leadsRouter: IRouter = Router();

const LeadFilterSchema = z.object({
  status: z.string().optional(),
  company: z.string().optional(),
  campaignId: z.string().optional(),
  keyword: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const LeadExportFilterSchema = LeadFilterSchema.omit({ page: true, limit: true });

const HEADER_ALIASES: Record<string, string[]> = {
  linkedinUrl: [
    "url",
    "linkedinurl",
    "linkedin_url",
    "linkedin url",
    "profile url",
    "profileurl",
    "salesnavigatorurl",
    "sales navigator url",
    "sales_nav_url",
    "salesnavurl",
    "linkedin",
  ],
  firstName: ["firstname", "first_name", "first name", "first"],
  lastName: ["lastname", "last_name", "last name", "last"],
  company: ["company", "organization", "organisation"],
  title: ["title", "jobtitle", "job title", "job_title", "role"],
};

interface CsvLeadRow {
  rowNumber: number;
  linkedinUrl: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, "").trim());
}

function parseCsv(raw: string) {
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    return {
      rows: [] as CsvLeadRow[],
      errors: [{ row: 0, error: "CSV must include a header row and at least one data row." }],
    };
  }

  const headers = parseCsvLine(lines[0]).map((header) =>
    header.toLowerCase().trim()
  );

  const get = (cells: string[], key: keyof typeof HEADER_ALIASES) => {
    for (const alias of HEADER_ALIASES[key]) {
      const index = headers.indexOf(alias);
      if (index !== -1) return cells[index]?.trim() ?? "";
    }
    return "";
  };

  const rows: CsvLeadRow[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  lines.slice(1).forEach((line, index) => {
    const rowNumber = index + 2;
    const cells = parseCsvLine(line);
    const linkedinUrl = get(cells, "linkedinUrl");

    if (!linkedinUrl) {
      errors.push({ row: rowNumber, error: "Missing LinkedIn URL." });
      return;
    }

    try {
      new URL(linkedinUrl);
    } catch {
      errors.push({ row: rowNumber, error: "LinkedIn URL is not a valid URL." });
      return;
    }

    rows.push({
      rowNumber,
      linkedinUrl,
      firstName: get(cells, "firstName"),
      lastName: get(cells, "lastName"),
      company: get(cells, "company"),
      title: get(cells, "title"),
    });
  });

  return { rows, errors };
}

function compactLeadData(data: {
  linkedinUrl: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
}) {
  return {
    linkedinUrl: data.linkedinUrl,
    firstName: data.firstName || undefined,
    lastName: data.lastName || undefined,
    company: data.company || undefined,
    title: data.title || undefined,
  };
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function leadWhere(filters: {
  userId: string;
  status?: string;
  company?: string;
  campaignId?: string;
  keyword?: string;
}) {
  const where: Record<string, unknown> = { userId: filters.userId };
  if (filters.status) where.connectionStatus = filters.status;
  if (filters.company) where.company = { contains: filters.company, mode: "insensitive" };
  if (filters.campaignId) {
    where.campaigns = {
      some: {
        campaignId: filters.campaignId,
        campaign: { account: { userId: filters.userId } },
      },
    };
  }
  if (filters.keyword) {
    where.postSignals = {
      some: { keyword: { contains: filters.keyword, mode: "insensitive" } },
    };
  }
  return where;
}

leadsRouter.get("/", async (req, res, next) => {
  try {
    const { status, company, campaignId, keyword, page, limit } =
      LeadFilterSchema.parse(req.query);

    const where = leadWhere({ userId: req.user.id, status, company, campaignId, keyword });

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({ leads, total, page, limit });
  } catch (err) {
    next(err);
  }
});

leadsRouter.get("/export", async (req, res, next) => {
  try {
    const filters = LeadExportFilterSchema.parse(req.query);
    const leads = await prisma.lead.findMany({
      where: leadWhere({ userId: req.user.id, ...filters }),
      include: {
        campaigns: {
          include: { campaign: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10_000,
    });

    const lines = [
      "id,linkedinUrl,source,firstName,lastName,title,company,connectionStatus,blacklisted,replyStatus,campaigns,createdAt",
      ...leads.map((lead) => {
        const replied = lead.campaigns.some((campaignLead) => campaignLead.repliedAt);
        return [
          lead.id,
          csvCell(lead.linkedinUrl),
          lead.source,
          csvCell(lead.firstName),
          csvCell(lead.lastName),
          csvCell(lead.title),
          csvCell(lead.company),
          lead.connectionStatus,
          lead.blacklisted,
          replied ? "REPLIED" : "NO_REPLY",
          csvCell(lead.campaigns.map((cl) => cl.campaign.name).join("; ")),
          lead.createdAt.toISOString(),
        ].join(",");
      }),
    ];

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(lines.join("\n"));
  } catch (err) {
    next(err);
  }
});

const SearchUrlSchema = z.object({
  accountId: z.string().min(1),
  searchUrl: z.string().url(),
  source: z.enum(["LINKEDIN", "SALES_NAVIGATOR"]).default("LINKEDIN"),
  leadLimit: z.number().int().min(1).max(200).optional(),
});

// POST /leads/search-urls — queue a search-scrape job against an account with
// no campaign involved. Discovered profiles are saved straight to the lead
// database (see searchScrapeProcessor) for later assignment to any campaign.
leadsRouter.post("/search-urls", async (req, res, next) => {
  try {
    const { accountId, searchUrl, source, leadLimit } = SearchUrlSchema.parse(req.body);

    if (source === "SALES_NAVIGATOR" && !isSalesNavigatorUrl(searchUrl)) {
      res.status(422).json({
        error: "Sales Navigator source requires a linkedin.com/sales search, list, or lead URL.",
      });
      return;
    }
    if (source === "LINKEDIN" && isSalesNavigatorUrl(searchUrl)) {
      res.status(422).json({
        error: "This is a Sales Navigator URL. Select Sales Navigator as the source.",
      });
      return;
    }

    const account = await prisma.account.findFirstOrThrow({
      where: { id: accountId, userId: req.user.id },
      select: {
        id: true,
        status: true,
        cookiesEncrypted: true,
        browserProfileStatus: true,
        lastSearchQualifiedAt: true,
        lastSearchQualifiedUrl: true,
        lastSearchQualifiedSource: true,
        lastSearchQualifiedNextButtons: true,
        proxyId: true,
        salesNavigatorEnabled: true,
        timezone: true,
      },
    });

    const readinessError = assertAccountReadyForScraping(account);
    if (readinessError) {
      res.status(422).json({ error: readinessError });
      return;
    }
    if (source === "SALES_NAVIGATOR" && !account.salesNavigatorEnabled) {
      res.status(422).json({
        error: "Enable Sales Navigator on this account before scraping Sales Navigator URLs.",
      });
      return;
    }

    // Same 30-day checkpoint-caution + qualification-freshness rules as the
    // campaign-scoped version (apps/api/src/routes/campaigns.ts) — multi-page
    // pagination proved unsafe on recently-checkpointed accounts.
    const CHECKPOINT_LOOKBACK_DAYS = 30;
    const recentCheckpoint = await prisma.checkpoint.findFirst({
      where: {
        accountId: account.id,
        detectedAt: {
          gte: new Date(Date.now() - CHECKPOINT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
        },
      },
    });
    const openCheckpoint = await prisma.checkpoint.findFirst({
      where: { accountId: account.id, resolvedAt: null },
      select: { id: true },
    });

    const effectiveLeadLimit = leadLimit;
    let leadLimitWarning: string | undefined;
    if (openCheckpoint && leadLimit && leadLimit > 10) {
      res.status(422).json({
        error:
          "This account has an unresolved LinkedIn checkpoint. Resolve it in the hosted browser before running multi-page search scraping.",
      });
      return;
    }
    if (recentCheckpoint && leadLimit && leadLimit > 10) {
      leadLimitWarning =
        "This account had a LinkedIn security checkpoint in the last 30 days. Multi-page search will still run with the requested lead count, but watch the job progress and pause if LinkedIn shows another checkpoint.";
    }
    if (REQUIRE_SEARCH_QUALIFICATION && effectiveLeadLimit && effectiveLeadLimit > 10) {
      const qualifiedAt = account.lastSearchQualifiedAt?.getTime() ?? 0;
      const qualificationFresh = Date.now() - qualifiedAt <= SEARCH_QUALIFICATION_TTL_MS;
      const qualifiedUrl = account.lastSearchQualifiedUrl;
      const requestedUrl = normalizeSearchUrlForQualification(searchUrl);
      const sourceMatches = account.lastSearchQualifiedSource === source;
      const urlMatches = qualifiedUrl === requestedUrl;
      const hasNextPage = (account.lastSearchQualifiedNextButtons ?? 0) > 0;

      if (!qualificationFresh || !urlMatches || !sourceMatches || !hasNextPage) {
        const reason = !qualificationFresh
          ? "No recent hosted-browser qualification exists for this account."
          : !urlMatches
          ? "The last qualified search URL does not match this URL."
          : !sourceMatches
          ? "The last qualified search source does not match this source."
          : "The last qualified search did not expose a next-page control.";
        res.status(422).json({
          error: `${reason} Open the account's hosted browser, load this exact search URL while logged in, click Qualify search, then add the URL again for more than 10 leads.`,
        });
        return;
      }
    }
    if (await hasActiveBrowserSession(req.user.id, account.id)) {
      res.status(409).json({
        error:
          "Hosted browser is still open for this account. Close it from Accounts, then queue the search again so the worker can use the persistent profile.",
      });
      return;
    }
    const requiredSearchPages = effectiveLeadLimit ? Math.ceil(effectiveLeadLimit / 10) : 5;
    const remainingSearchPages = await remainingDailyCap(
      account.id,
      "searchPage",
      account.timezone ?? undefined
    );
    if (remainingSearchPages < requiredSearchPages) {
      res.status(422).json({
        error: `Not enough search-page capacity for this scrape. Requested ${effectiveLeadLimit ?? "default"} leads needs ${requiredSearchPages} search page${requiredSearchPages === 1 ? "" : "s"}, but this account has ${remainingSearchPages} search page${remainingSearchPages === 1 ? "" : "s"} remaining today. Lower the lead count, raise the account's Search Pages cap, or try again tomorrow.`,
      });
      return;
    }

    const job = await searchScrapeQueue.add("scrape-search", {
      accountId: account.id,
      searchUrl,
      leadLimit: effectiveLeadLimit,
      source,
    });

    res.status(201).json({
      queued: 1,
      jobId: job.id,
      searchUrl,
      source,
      leadLimit: effectiveLeadLimit,
      ...(leadLimitWarning ? { warning: leadLimitWarning } : {}),
    });
  } catch (err) {
    next(err);
  }
});

leadsRouter.get("/search-jobs", async (req, res, next) => {
  try {
    const accountId = z.string().min(1).parse(req.query.accountId);
    await prisma.account.findFirstOrThrow({
      where: { id: accountId, userId: req.user.id },
      select: { id: true },
    });

    const jobs = await searchScrapeQueue.getJobs(
      ["waiting", "active", "delayed", "completed", "failed"],
      0,
      24,
      false
    );

    const scoped = await Promise.all(
      jobs
        .filter((job) => {
          const data = job.data as { accountId?: string; campaignId?: string };
          return data.accountId === accountId && !data.campaignId;
        })
        .map(async (job) => ({
          id: job.id,
          name: job.name,
          state: await job.getState(),
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason ?? null,
          timestamp: job.timestamp,
          processedOn: job.processedOn ?? null,
          finishedOn: job.finishedOn ?? null,
          progress: job.progress,
          data: job.data,
          returnvalue: job.returnvalue ?? null,
        }))
    );

    scoped.sort(
      (a, b) =>
        (b.finishedOn ?? b.processedOn ?? b.timestamp) -
        (a.finishedOn ?? a.processedOn ?? a.timestamp)
    );

    res.json({ jobs: scoped });
  } catch (err) {
    next(err);
  }
});

leadsRouter.delete("/search-jobs", async (req, res, next) => {
  try {
    const accountId = z.string().min(1).parse(req.query.accountId);
    await prisma.account.findFirstOrThrow({
      where: { id: accountId, userId: req.user.id },
      select: { id: true },
    });

    // Only finished jobs are cleared — waiting/active/delayed ones are still
    // doing work and stay visible until they resolve.
    const jobs = await searchScrapeQueue.getJobs(["completed", "failed"], 0, 200, false);

    let removed = 0;
    for (const job of jobs) {
      const data = job.data as { accountId?: string; campaignId?: string };
      if (data.accountId !== accountId || data.campaignId) continue;
      await job.remove();
      removed++;
    }

    res.json({ removed });
  } catch (err) {
    next(err);
  }
});

leadsRouter.post("/import-csv", async (req, res, next) => {
  try {
    const schema = z.object({
      csvText: z.string().min(1),
      campaignId: z.string().optional(),
    });
    const { csvText, campaignId } = schema.parse(req.body);
    const campaign = campaignId
      ? await prisma.campaign.findFirstOrThrow({
          where: { id: campaignId, account: { userId: req.user.id } },
          select: { id: true, accountId: true },
        })
      : null;
    const { rows, errors } = parseCsv(csvText);

    const uniqueRows = new Map<string, (typeof rows)[number]>();
    const duplicateErrors: Array<{ row: number; error: string }> = [];

    for (const row of rows) {
      if (uniqueRows.has(row.linkedinUrl)) {
        duplicateErrors.push({
          row: row.rowNumber,
          error: "Duplicate URL in CSV; first occurrence was imported.",
        });
        continue;
      }
      uniqueRows.set(row.linkedinUrl, row);
    }

    const urls = [...uniqueRows.keys()];
    const existing = await prisma.lead.findMany({
      where: { userId: req.user.id, linkedinUrl: { in: urls } },
      select: { linkedinUrl: true },
    });
    const existingUrls = new Set(existing.map((lead) => lead.linkedinUrl));

    let created = 0;
    let updated = 0;
    let attached = 0;

    for (const row of uniqueRows.values()) {
      const data = compactLeadData(row);
      const existed = existingUrls.has(row.linkedinUrl);

      const lead = await prisma.lead.upsert({
        where: {
          userId_linkedinUrl: {
            userId: req.user.id,
            linkedinUrl: row.linkedinUrl,
          },
        },
        create: {
          ...data,
          source: LeadSource.CSV,
          userId: req.user.id,
          accountId: campaign?.accountId,
        },
        update: {
          firstName: data.firstName,
          lastName: data.lastName,
          company: data.company,
          title: data.title,
          source: LeadSource.CSV,
        },
      });

      if (existed) updated++;
      else created++;

      if (campaign) {
        await prisma.campaignLead.upsert({
          where: { campaignId_leadId: { campaignId: campaign.id, leadId: lead.id } },
          create: { campaignId: campaign.id, leadId: lead.id },
          update: {},
        });
        attached++;
      }
    }

    res.status(201).json({
      imported: created + updated,
      created,
      updated,
      attached,
      skipped: errors.length + duplicateErrors.length,
      errors: [...errors, ...duplicateErrors],
    });
  } catch (err) {
    next(err);
  }
});

leadsRouter.post("/", async (req, res, next) => {
  try {
    const schema = z.object({
      linkedinUrl: z.string().url(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      company: z.string().optional(),
      title: z.string().optional(),
      accountId: z.string().optional(),
      campaignId: z.string().optional(),
    });
    const { campaignId, ...data } = schema.parse(req.body);
    const campaign = campaignId
      ? await prisma.campaign.findFirstOrThrow({
          where: { id: campaignId, account: { userId: req.user.id } },
          select: { id: true, accountId: true },
        })
      : null;
    if (data.accountId) {
      await prisma.account.findFirstOrThrow({
        where: { id: data.accountId, userId: req.user.id },
        select: { id: true },
      });
    }

    const lead = await prisma.lead.upsert({
      where: {
        userId_linkedinUrl: {
          userId: req.user.id,
          linkedinUrl: data.linkedinUrl,
        },
      },
      create: {
        ...data,
        source: data.linkedinUrl.includes("/sales/lead/")
          ? LeadSource.SALES_NAVIGATOR
          : LeadSource.MANUAL,
        userId: req.user.id,
        accountId: data.accountId ?? campaign?.accountId,
      },
      update: {},
    });

    if (campaign) {
      await prisma.campaignLead.upsert({
        where: { campaignId_leadId: { campaignId: campaign.id, leadId: lead.id } },
        create: { campaignId: campaign.id, leadId: lead.id },
        update: {},
      });
    }

    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
});

leadsRouter.get("/:id", async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        campaigns: {
          include: {
            campaign: true,
            postSignal: true,
          },
          orderBy: { createdAt: "desc" },
        },
        postSignals: {
          orderBy: { scrapedAt: "desc" },
          take: 10,
        },
      },
    });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

leadsRouter.post("/:id/blacklist", async (req, res, next) => {
  try {
    const schema = z.object({ reason: z.string().optional() });
    const { reason } = schema.parse(req.body);
    const result = await prisma.lead.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { blacklisted: true, blacklistReason: reason ?? "Manually blacklisted" },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    const lead = await prisma.lead.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
    });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

leadsRouter.delete("/:id/blacklist", async (req, res, next) => {
  try {
    const result = await prisma.lead.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { blacklisted: false, blacklistReason: null },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }
    const lead = await prisma.lead.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
    });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});
