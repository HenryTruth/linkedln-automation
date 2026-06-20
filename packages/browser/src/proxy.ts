import { prisma, type Proxy } from "@linkedin-automation/db";
import { randomBytes } from "crypto";

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
    password: proxy.password,
  };
}

function buildProxyUrl(proxy: Proxy, sessionId?: string): string {
  const username = encodeURIComponent(renderProxyUsername(proxy, sessionId));
  const password = encodeURIComponent(proxy.password);
  return `http://${username}:${password}@${proxy.host}:${proxy.port}`;
}

export async function checkProxyHealth(
  proxy: Proxy,
  sessionId?: string
): Promise<boolean> {
  const proxyUrl = buildProxyUrl(proxy, sessionId);
  try {
    const { HttpsProxyAgent } = await import("https-proxy-agent");
    const agent = new HttpsProxyAgent(proxyUrl);
    const response = await fetch("https://ipinfo.io/json", {
      signal: AbortSignal.timeout(8_000),
      // @ts-expect-error node-fetch agent typing
      agent,
    });
    const healthy = response.ok;
    await prisma.proxy.update({
      where: { id: proxy.id },
      data: {
        healthStatus: healthy ? "HEALTHY" : "DEGRADED",
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
    const { HttpsProxyAgent } = await import("https-proxy-agent");
    const agent = new HttpsProxyAgent(proxyUrl);
    const response = await fetch("https://ipinfo.io/json", {
      signal: AbortSignal.timeout(8_000),
      // @ts-expect-error node-fetch agent typing
      agent,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { ip?: string };
    return data.ip ?? null;
  } catch {
    return null;
  }
}
