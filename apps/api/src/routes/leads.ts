import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma, LeadSource } from "@linkedin-automation/db";

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
