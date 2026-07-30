import { LinkedInPostStatus, PostMediaType, prisma } from "@linkedin-automation/db";
import { decrypt } from "@linkedin-automation/guards";
import type { Job } from "bullmq";
import type { LinkedInPostPublishTickJobData } from "../queues.js";

const LINKEDIN_UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";
const BATCH_SIZE = 10;

type LinkedInUgcPostResponse = {
  id?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let message = text || response.statusText;
    try {
      const parsed = JSON.parse(text) as { message?: unknown; error_description?: unknown };
      if (typeof parsed.error_description === "string") message = parsed.error_description;
      else if (typeof parsed.message === "string") message = parsed.message;
    } catch {
      // Keep the raw response text.
    }
    throw new Error(message);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function publishLinkedInTextPost(input: {
  accessTokenEncrypted: string;
  authorUrn: string;
  body: string;
  articleUrl?: string | null;
}) {
  const accessToken = decrypt(input.accessTokenEncrypted);
  const shareContent: Record<string, unknown> = {
    shareCommentary: { text: input.body },
    shareMediaCategory: input.articleUrl ? "ARTICLE" : "NONE",
  };

  if (input.articleUrl) {
    shareContent.media = [{ status: "READY", originalUrl: input.articleUrl }];
  }

  const result = await readJson<LinkedInUgcPostResponse>(
    await fetch(LINKEDIN_UGC_POSTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: input.authorUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": shareContent,
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      }),
    })
  );

  return result.id ?? null;
}

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

    const unsupportedMedia = post.media.filter((item) => item.type !== PostMediaType.ARTICLE);
    if (unsupportedMedia.length > 0) {
      throw new Error(
        "Scheduled publishing currently supports text and article URL posts only."
      );
    }

    const articleUrl =
      post.media.find((item) => item.type === PostMediaType.ARTICLE)?.url ?? null;
    const linkedinPostUrn = await publishLinkedInTextPost({
      accessTokenEncrypted: post.account.linkedinAccessTokenEncrypted,
      authorUrn: post.account.linkedinMemberUrn,
      body: post.body,
      articleUrl,
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
