import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma } from "@linkedin-automation/db";

export const leadsRouter: IRouter = Router();

const LeadFilterSchema = z.object({
  status: z.string().optional(),
  company: z.string().optional(),
  campaignId: z.string().optional(),
  keyword: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const HEADER_ALIASES: Record<string, string[]> = {
  linkedinUrl: [
    "url",
    "linkedinurl",
    "linkedin_url",
    "linkedin url",
    "profile url",
    "profileurl",
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

leadsRouter.get("/", async (req, res, next) => {
  try {
    const { status, company, campaignId, keyword, page, limit } =
      LeadFilterSchema.parse(req.query);

    const where: Record<string, unknown> = {};
    if (status) where.connectionStatus = status;
    if (company) where.company = { contains: company, mode: "insensitive" };
    if (campaignId) where.campaigns = { some: { campaignId } };
    if (keyword) where.postSignals = { some: { keyword: { contains: keyword, mode: "insensitive" } } };

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

leadsRouter.post("/import-csv", async (req, res, next) => {
  try {
    const schema = z.object({
      csvText: z.string().min(1),
      campaignId: z.string().optional(),
    });
    const { csvText, campaignId } = schema.parse(req.body);
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
      where: { linkedinUrl: { in: urls } },
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
        where: { linkedinUrl: row.linkedinUrl },
        create: data,
        update: {
          firstName: data.firstName,
          lastName: data.lastName,
          company: data.company,
          title: data.title,
        },
      });

      if (existed) updated++;
      else created++;

      if (campaignId) {
        await prisma.campaignLead.upsert({
          where: { campaignId_leadId: { campaignId, leadId: lead.id } },
          create: { campaignId, leadId: lead.id },
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

    const lead = await prisma.lead.upsert({
      where: { linkedinUrl: data.linkedinUrl },
      create: data,
      update: {},
    });

    if (campaignId) {
      await prisma.campaignLead.upsert({
        where: { campaignId_leadId: { campaignId, leadId: lead.id } },
        create: { campaignId, leadId: lead.id },
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
    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: req.params.id },
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
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { blacklisted: true, blacklistReason: reason ?? "Manually blacklisted" },
    });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

leadsRouter.delete("/:id/blacklist", async (req, res, next) => {
  try {
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { blacklisted: false, blacklistReason: null },
    });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});
