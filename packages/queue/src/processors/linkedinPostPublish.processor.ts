import { LinkedInPostStatus, prisma } from "@linkedin-automation/db";
import type { Job } from "bullmq";
import type { LinkedInPostPublishTickJobData } from "../queues.js";
import { publishLinkedInPost } from "../linkedinPublisher.js";

const BATCH_SIZE = 10;

async function publishScheduledPost(postId: string): Promise<void> {
  const claim = await prisma.linkedInPost.updateMany({
    where: {
      id: postId,
      status: LinkedInPostStatus.SCHEDULED,
      scheduledFor: { lte: new Date() },
    },
    data: { status: LinkedInPostStatus.PUBLISHING, lastError: null },
  });

  if (claim.count === 0) return;

  const post = await prisma.linkedInPost.findUniqueOrThrow({
    where: { id: postId },
    include: {
      account: {
        select: {
          linkedinAccessTokenEncrypted: true,
          linkedinAccessTokenExpiresAt: true,
          linkedinMemberUrn: true,
        },
      },
      media: { orderBy: { createdAt: "asc" } },
    },
  });

  try {
    if (!post.account.linkedinAccessTokenEncrypted || !post.account.linkedinMemberUrn) {
      throw new Error(
        "Connect this account with LinkedIn API access before scheduled publishing."
      );
    }

    if (
      post.account.linkedinAccessTokenExpiresAt &&
      post.account.linkedinAccessTokenExpiresAt < new Date()
    ) {
      throw new Error("LinkedIn API access expired. Reconnect this account.");
    }

    const linkedinPostUrn = await publishLinkedInPost({
      accessTokenEncrypted: post.account.linkedinAccessTokenEncrypted,
      authorUrn: post.account.linkedinMemberUrn,
      body: post.body,
      media: post.media,
    });

    await prisma.linkedInPost.update({
      where: { id: post.id },
      data: {
        status: LinkedInPostStatus.PUBLISHED,
        publishedAt: new Date(),
        linkedinPostUrn,
        lastError: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "LinkedIn publish failed.";
    await prisma.linkedInPost.update({
      where: { id: post.id },
      data: {
        status: LinkedInPostStatus.FAILED,
        lastError: message.slice(0, 2_000),
      },
    });
  }
}

export async function linkedInPostPublishProcessor(
  _job: Job<LinkedInPostPublishTickJobData>
): Promise<void> {
  const duePosts = await prisma.linkedInPost.findMany({
    where: {
      status: LinkedInPostStatus.SCHEDULED,
      scheduledFor: { lte: new Date() },
    },
    select: { id: true },
    orderBy: { scheduledFor: "asc" },
    take: BATCH_SIZE,
  });

  for (const post of duePosts) {
    await publishScheduledPost(post.id);
  }
}
