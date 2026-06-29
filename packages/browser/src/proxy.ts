import { prisma, type Proxy } from "@linkedin-automation/db";
import { decrypt } from "@linkedin-automation/guards";
import { randomBytes } from "crypto";
import https from "node:https";

function proxyPassword(proxy: Proxy): string {
  try {
    return decrypt(proxy.password);
  } catch {
    // Password was stored before encryption was introduced — use as-is.
    return proxy.password;
  }
}

export interface PlaywrightProxy {
  server: string;
  username: string;
  password: string;
}

export async function getProxyForAccount(
  accountId: string
): Promise<Proxy | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { proxy: true },
  });
  return account?.proxy ?? null;
}

export function createProxySessionId(): string {
  return randomBytes(8).toString("hex");
}

export function renderProxyUsername(
  proxy: Proxy,
  sessionId?: string
): string {
  if (proxy.rotationMode !== "STICKY_SESSION") return proxy.username;

  const template = proxy.usernameTemplate ?? proxy.username;
  if (!template.includes("{{sessionId}}")) return template;
  return template.replaceAll("{{sessionId}}", sessionId ?? createProxySessionId());
}

export function buildPlaywrightProxy(
  proxy: Proxy,
  sessionId?: string
): PlaywrightProxy {
  return {
    server: `http://${proxy.host}:${proxy.port}`,
    username: renderProxyUsername(proxy, sessionId),
    password: proxyPassword(proxy),
  };
}

function buildProxyUrl(proxy: Proxy, sessionId?: string): string {
  const username = encodeURIComponent(renderProxyUsername(proxy, sessionId));
  const password = encodeURIComponent(proxyPassword(proxy));
  return `http://${username}:${password}@${proxy.host}:${proxy.port}`;
}

async function fetchIpInfoThroughProxy(
  proxyUrl: string
): Promise<{ ok: boolean; ip: string | null }> {
  const { HttpsProxyAgent } = await import("https-proxy-agent");
  const agent = new HttpsProxyAgent(proxyUrl);

  return await new Promise((resolve, reject) => {
    const request = https.get(
      "https://ipinfo.io/json",
      {
        agent,
        timeout: 8_000,
        headers: { Accept: "application/json" },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            resolve({ ok: false, ip: null });
            return;
          }
          try {
            const data = JSON.parse(body) as { ip?: string };
            resolve({ ok: true, ip: data.ip ?? null });
          } catch {
            resolve({ ok: false, ip: null });
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Proxy IP check timed out"));
    });
    request.on("error", reject);
  });
}

export async function checkProxyHealth(
  proxy: Proxy,
  sessionId?: string
): Promise<boolean> {
  const proxyUrl = buildProxyUrl(proxy, sessionId);
  try {
    const result = await fetchIpInfoThroughProxy(proxyUrl);
    const healthy = result.ok;
    await prisma.proxy.update({
      where: { id: proxy.id },
      data: {
        healthStatus: healthy ? "HEALTHY" : "DEGRADED",
        currentExitIp: result.ip,
        lastUsed: new Date(),
      },
    });
    return healthy;
  } catch {
    await prisma.proxy.update({
      where: { id: proxy.id },
      data: { healthStatus: "DEAD" },
    });
    return false;
  }
}

/**
 * Fetch the actual exit IP that traffic routes through when using this proxy.
 * Used to detect mid-session IP rotation (Guard 10).
 */
export async function detectProxyIp(
  proxy: Proxy,
  sessionId?: string
): Promise<string | null> {
  const proxyUrl = buildProxyUrl(proxy, sessionId);
  try {
    const result = await fetchIpInfoThroughProxy(proxyUrl);
    return result.ip;
  } catch {
    return null;
  }
}
