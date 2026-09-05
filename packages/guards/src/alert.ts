import { request as httpsRequest } from "https";
import { request as httpRequest } from "http";
import { URL } from "url";
import { prisma } from "@linkedin-automation/db";

async function getWebhookUrl(userId: string): Promise<string | undefined> {
  try {
    const setting = await prisma.userSetting.findUnique({
      where: { userId_key: { userId, key: "alert_webhook_url" } },
    });
    if (setting?.value) return setting.value;
  } catch {
    // DB unavailable — fall back silently
  }
  return process.env.ALERT_WEBHOOK_URL;
}

async function getEmailConfig(
  userId: string
): Promise<{ apiKey: string; to: string; from: string } | null> {
  let to: string | undefined;
  try {
    const setting = await prisma.userSetting.findUnique({
      where: { userId_key: { userId, key: "alert_email_to" } },
    });
    to = setting?.value || process.env.ALERT_EMAIL_TO;
  } catch {
    to = process.env.ALERT_EMAIL_TO;
  }
  // resend_api_key is instance-wide infra config (not a per-user preference),
  // so it still lives in the global SystemSetting table.
  let apiKey: string | undefined;
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "resend_api_key" },
    });
    apiKey = setting?.value || process.env.RESEND_API_KEY;
  } catch {
    apiKey = process.env.RESEND_API_KEY;
  }
  if (!apiKey || !to) return null;
  const from = process.env.ALERT_EMAIL_FROM ?? "LinkedIn Auto Alerts <alerts@resend.dev>";
  return { apiKey, to, from };
}

async function sendWebhook(webhookUrl: string, message: string): Promise<void> {
  const parsed = new URL(webhookUrl);
  const payload = JSON.stringify({ text: message });
  const requester = parsed.protocol === "https:" ? httpsRequest : httpRequest;

  await new Promise<void>((resolve, reject) => {
    const req = requester(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        res.resume();
        resolve();
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function sendEmail(subject: string, body: string, userId: string): Promise<void> {
  const cfg = await getEmailConfig(userId);
  if (!cfg) return;

  const { Resend } = await import("resend");
  const resend = new Resend(cfg.apiKey);

  const { error } = await resend.emails.send({
    from: cfg.from,
    to: [cfg.to],
    subject: `[LinkedIn Auto] ${subject}`,
    text: body,
  });

  if (error) {
    console.error(`[ALERT] Resend delivery failed: ${JSON.stringify(error)}`);
  }
}

export async function sendAlert(
  subject: string,
  body: string,
  userId: string
): Promise<void> {
  const message = `[LinkedIn Automation] ${subject}\n\n${body}`;
  console.error(`[ALERT] ${message}`);

  const webhookUrl = await getWebhookUrl(userId);
  if (webhookUrl) {
    try {
      await sendWebhook(webhookUrl, message);
    } catch (err) {
      console.error(`[ALERT] Webhook delivery failed: ${err}`);
    }
    return;
  }

  // No webhook configured — fall back to email via Resend
  try {
    await sendEmail(subject, message, userId);
  } catch (err) {
    console.error(`[ALERT] Email delivery failed: ${err}`);
  }
}
