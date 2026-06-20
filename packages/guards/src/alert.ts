import { request as httpsRequest } from "https";
import { request as httpRequest } from "http";
import { URL } from "url";

export async function sendAlert(subject: string, body: string): Promise<void> {
  const message = `[LinkedIn Automation] ${subject}\n\n${body}`;
  console.error(`[ALERT] ${message}`);

  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
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
  } catch (err) {
    console.error(`[ALERT] Webhook delivery failed: ${err}`);
  }
}
