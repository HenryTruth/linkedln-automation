import { prisma } from "@linkedin-automation/db";
import { encrypt, decrypt } from "@linkedin-automation/guards";
import type { Cookie } from "playwright";

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
  return JSON.parse(decrypt(account.cookiesEncrypted)) as Cookie[];
}
