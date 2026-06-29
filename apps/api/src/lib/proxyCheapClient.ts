import { z } from "zod";

const API_BASE = "https://api.proxy-cheap.com";
const optionalStringOrNumber = z.union([z.string(), z.number()]).nullish();

const proxyCheapProxySchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  status: z.string(),
  networkType: z.string().optional(),
  productType: z.string().optional(),
  countryCode: z.string().optional(),
  authentication: z.object({
    whitelistedIps: z.array(z.string()).optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  }),
  connection: z.object({
    publicIp: z.string().nullish(),
    connectIp: z.string(),
    httpPort: optionalStringOrNumber,
    httpsPort: optionalStringOrNumber,
    socks5Port: optionalStringOrNumber,
  }),
  proxyType: z.string().optional(),
  createdAt: z.string().optional(),
  expiresAt: z.string().optional(),
  metadata: z
    .object({
      ispName: z.string().optional(),
    })
    .optional(),
});

export type ProxyCheapProxy = z.infer<typeof proxyCheapProxySchema>;

export interface ProxyCheapPublicProxy {
  id: string;
  status: string;
  networkType: string | null;
  countryCode: string | null;
  host: string;
  httpPort: number | null;
  httpsPort: number | null;
  socks5Port: number | null;
  proxyType: string | null;
  username: string | null;
  publicIp: string | null;
  expiresAt: string | null;
  ispName: string | null;
  importable: boolean;
  importBlockReason: string | null;
}

function credentials() {
  const apiKey = process.env.PROXY_CHEAP_API_KEY;
  const apiSecret = process.env.PROXY_CHEAP_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error(
      "Proxy-Cheap credentials are not configured. Set PROXY_CHEAP_API_KEY and PROXY_CHEAP_API_SECRET."
    );
  }
  return { apiKey, apiSecret };
}

async function proxyCheapFetch<T>(path: string): Promise<T> {
  const { apiKey, apiSecret } = credentials();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "X-Api-Key": apiKey,
      "X-Api-Secret": apiSecret,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Proxy-Cheap API ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

function numberPort(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  const port = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function proxyNetworkLabel(proxy: ProxyCheapProxy): string {
  return (proxy.networkType ?? proxy.productType ?? "").toUpperCase();
}

export function getProxyCheapImportBlockReason(proxy: ProxyCheapProxy): string | null {
  if (proxy.status !== "ACTIVE") return `Proxy status is ${proxy.status}.`;

  const networkType = proxyNetworkLabel(proxy);
  if (networkType.includes("IPV6")) return "IPv6 residential proxies are not recommended.";
  if (!networkType.includes("RESIDENTIAL")) return "Only residential/ISP proxies are importable.";
  if (networkType.includes("ROTATING")) return "Rotating residential proxies are not stable enough.";

  if (!proxy.authentication.username || !proxy.authentication.password) {
    return "Username/password authentication is required.";
  }
  if (!numberPort(proxy.connection.httpPort) && !numberPort(proxy.connection.httpsPort)) {
    return "HTTP or HTTPS port is required.";
  }
  if (!proxy.countryCode) return "Country code is missing.";

  return null;
}

export function toPublicProxyCheapProxy(proxy: ProxyCheapProxy): ProxyCheapPublicProxy {
  const importBlockReason = getProxyCheapImportBlockReason(proxy);
  return {
    id: proxy.id,
    status: proxy.status,
    networkType: proxy.networkType ?? proxy.productType ?? null,
    countryCode: proxy.countryCode ?? null,
    host: proxy.connection.connectIp,
    httpPort: numberPort(proxy.connection.httpPort),
    httpsPort: numberPort(proxy.connection.httpsPort),
    socks5Port: numberPort(proxy.connection.socks5Port),
    proxyType: proxy.proxyType ?? null,
    username: proxy.authentication.username ?? null,
    publicIp: proxy.connection.publicIp ?? null,
    expiresAt: proxy.expiresAt ?? null,
    ispName: proxy.metadata?.ispName ?? null,
    importable: importBlockReason === null,
    importBlockReason,
  };
}

export async function listProxyCheapProxies(): Promise<ProxyCheapProxy[]> {
  const data = await proxyCheapFetch<unknown>("/proxies");
  const arrayData =
    Array.isArray(data)
      ? data
      : z
          .object({
            data: z.array(z.unknown()).optional(),
            proxies: z.array(z.unknown()).optional(),
          })
          .transform((value) => value.proxies ?? value.data ?? [])
          .parse(data);
  return z.array(proxyCheapProxySchema).parse(arrayData);
}

export const fetchProxyCheapProxies = listProxyCheapProxies;

export function isStaticResidential(proxy: ProxyCheapProxy): boolean {
  return getProxyCheapImportBlockReason({ ...proxy, status: "ACTIVE" }) === null;
}

export function toProxyCreateData(proxy: ProxyCheapProxy) {
  const port = numberPort(proxy.connection.httpPort) ?? numberPort(proxy.connection.httpsPort);
  if (!port || !proxy.countryCode || !proxy.authentication.username || !proxy.authentication.password) {
    throw new Error("Proxy-Cheap proxy is missing required connection fields.");
  }

  return {
    host: proxy.connection.connectIp,
    port,
    country: proxy.countryCode,
    city: undefined,
    username: proxy.authentication.username,
    password: proxy.authentication.password,
    rotationMode: "STATIC" as const,
    currentExitIp: proxy.connection.publicIp ?? null,
  };
}
