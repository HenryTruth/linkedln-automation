import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma } from "@linkedin-automation/db";
import { sendAlert } from "@linkedin-automation/guards";

export const settingsRouter: IRouter = Router();

const SETTING_KEYS = ["alert_webhook_url", "alert_email_to"] as const;

// GET /settings — return all configurable settings
settingsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.systemSetting.findMany();
    const map: Record<string, string | null> = {
      alert_webhook_url: null,
      alert_email_to: null,
    };
    for (const row of rows) {
      if (SETTING_KEYS.includes(row.key as typeof SETTING_KEYS[number])) {
        map[row.key] = row.value;
      }
    }
    res.json(map);
  } catch (err) {
    next(err);
  }
});

// PUT /settings — upsert one or more settings
settingsRouter.put("/", async (req, res, next) => {
  try {
    const schema = z.object({
      alert_webhook_url: z.string().url().nullable().optional(),
      alert_email_to: z.string().email().nullable().optional(),
    });
    const data = schema.parse(req.body);

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        await prisma.systemSetting.deleteMany({ where: { key } });
      } else {
        await prisma.systemSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /settings/test-alert — fire a test notification via webhook or email
settingsRouter.post("/test-alert", async (_req, res, next) => {
  try {
    await sendAlert(
      "Test alert",
      "This is a test from your LinkedIn Automation dashboard. If you see this, your alert delivery is configured correctly."
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
