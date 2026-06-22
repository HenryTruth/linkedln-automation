import { request as httpsRequest } from "https";
import { request as httpRequest } from "http";
import { URL } from "url";
import { prisma } from "@linkedin-automation/db";

async function getWebhookUrl(): Promise<string | undefined> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "alert_webhook_url" },
    });
    if (setting?.value) return setting.value;
  } catch {
    // DB unavailable — fall back silently
  }
  return process.env.ALERT_WEBHOOK_URL;
}

async function getEmailConfig(): Promise<{ apiKey: string; to: string; from: string } | null> {
  let apiKey: string | undefined;
  let to: string | undefined;
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: ["resend_api_key", "alert_email_to"] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
    apiKey = map["resend_api_key"] || process.env.RESEND_API_KEY;
    to = map["alert_email_to"] || process.env.ALERT_EMAIL_TO;
  } catch {
    apiKey = process.env.RESEND_API_KEY;
    to = process.env.ALERT_EMAIL_TO;
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

async function sendEmail(subject: string, body: string): Promise<void> {
  const cfg = await getEmailConfig();
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

export async function sendAlert(subject: string, body: string): Promise<void> {
  const message = `[LinkedIn Automation] ${subject}\n\n${body}`;
  console.error(`[ALERT] ${message}`);

  const webhookUrl = await getWebhookUrl();
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
    await sendEmail(subject, message);
  } catch (err) {
    console.error(`[ALERT] Email delivery failed: ${err}`);
  }
}
