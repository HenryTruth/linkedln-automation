import { createHash } from "crypto";
import { prisma } from "@linkedin-automation/db";
import { MessageBodyDedupError } from "./errors.js";

const MAX_SAME_BODY_PER_DAY = 3;

/** Produce a short, stable hash of a rendered message body for dedup tracking. */
export function hashMessageBody(body: string): string {
  return createHash("sha256").update(body.trim()).digest("hex").slice(0, 16);
}

/**
 * Guard 9: block sending the same rendered message body to more than 3 people
 * in a single calendar day. Counts successful sends with this bodyHash in ActivityLog.
 */
export async function checkMessageBodyDedup(
  accountId: string,
  bodyHash: string
): Promise<void> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const count = await prisma.activityLog.count({
    where: {
      accountId,
      actionType: "message",
      bodyHash,
      result: "success",
      createdAt: { gte: startOfDay },
    },
  });

  if (count >= MAX_SAME_BODY_PER_DAY) {
    throw new MessageBodyDedupError(bodyHash);
  }
}
