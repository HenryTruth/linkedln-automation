import type { Page } from "playwright";
import { prisma } from "@linkedin-automation/db";
import { delays } from "@linkedin-automation/guards";
import { navigateTo } from "./navigate.js";

interface ScrapedProfile {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company: string | null;
}

async function extractProfile(page: Page): Promise<ScrapedProfile> {
  return page.evaluate(() => {
    const fullName =
      document
        .querySelector("h1.text-heading-xlarge")
        ?.textContent?.trim() ?? null;
    const [firstName = null, ...rest] = fullName?.split(" ") ?? [];
    const lastName = rest.join(" ") || null;

    const title =
      document
        .querySelector(".text-body-medium.break-words")
        ?.textContent?.trim() ?? null;

    const company =
      document
        .querySelector(
          "#experience .pvs-list__item--line-separated:first-child .t-bold span[aria-hidden='true']"
        )
        ?.textContent?.trim() ?? null;

    return { firstName, lastName, title, company };
  });
}

export async function scrapeProfile(
  page: Page,
  linkedinUrl: string,
  accountId: string
): Promise<void> {
  await navigateTo(page, linkedinUrl);
  await delays.betweenActions();

  const profile = await extractProfile(page);

  await prisma.lead.upsert({
    where: { linkedinUrl },
    create: { linkedinUrl, accountId, ...profile },
    update: { ...profile },
  });
}
