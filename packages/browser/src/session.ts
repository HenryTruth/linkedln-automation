import { prisma } from "@linkedin-automation/db";
import { encrypt, decrypt } from "@linkedin-automation/guards";
import type { Cookie } from "playwright";

function normalizeSameSite(value: unknown): "Strict" | "Lax" | "None" | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase().replace(/[_\s-]/g, "");
  if (normalized === "strict") return "Strict";
  if (normalized === "lax") return "Lax";
  if (normalized === "none" || normalized === "norestriction") return "None";
  return undefined;
}

function normalizeCookie(raw: Record<string, unknown>): Cookie {
  const sameSite = normalizeSameSite(raw.sameSite);
  const cookie = { ...raw, sameSite } as Record<string, unknown>;
  if (!sameSite) delete cookie.sameSite;
  if (typeof cookie.expires !== "number") delete cookie.expires;
  return cookie as unknown as Cookie;
}

export async function saveCookies(
  accountId: string,
  cookies: Cookie[]
): Promise<void> {
  const encrypted = encrypt(JSON.stringify(cookies));
  await prisma.account.update({
    where: { id: accountId },
    data: { cookiesEncrypted: encrypted },
  });
}

export async function loadCookies(accountId: string): Promise<Cookie[] | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { cookiesEncrypted: true },
  });
  if (!account?.cookiesEncrypted) return null;
  const parsed = JSON.parse(decrypt(account.cookiesEncrypted)) as Array<Record<string, unknown>>;
  return parsed.map(normalizeCookie);
}
