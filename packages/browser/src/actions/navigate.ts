import type { Page } from "playwright";
import { delays } from "@linkedin-automation/guards";

export async function navigateTo(page: Page, url: string): Promise<void> {
  await delays.betweenPageLoads();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
}
