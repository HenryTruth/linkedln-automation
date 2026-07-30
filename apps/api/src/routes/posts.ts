import { Router, type IRouter } from "express";
import { z } from "zod";
import { prisma, LinkedInPostStatus, PostMediaType } from "@linkedin-automation/db";
import { publishLinkedInPost } from "@linkedin-automation/queue";
import { generatePostDraft } from "../lib/ai.js";

export const postsRouter: IRouter = Router();

const MediaSchema = z.object({
  type: z.nativeEnum(PostMediaType),
  url: z.string().url().max(2048),
  title: z.string().max(160).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

const CreatePostSchema = z.object({
  accountId: z.string().min(1),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(3000),
  prompt: z.string().max(2000).optional().nullable(),
  tone: z.string().max(80).optional().nullable(),
  audience: z.string().max(120).optional().nullable(),
  callToAction: z.string().max(160).optional().nullable(),
  scheduledFor: z.coerce.date().optional().nullable(),
  media: z.array(MediaSchema).max(10).default([]),
});

const UpdatePostSchema = CreatePostSchema.omit({ accountId: true }).partial().extend({
  status: z
    .enum([
      LinkedInPostStatus.DRAFT,
      LinkedInPostStatus.APPROVED,
      LinkedInPostStatus.SCHEDULED,
      LinkedInPostStatus.FAILED,
    ])
    .optional(),
  media: z.array(MediaSchema).max(10).optional(),
});

const GeneratePostSchema = z.object({
  accountId: z.string().min(1),
  topic: z.string().min(3).max(500),
  tone: z.string().max(80).default("professional"),
  audience: z.string().max(120).default("LinkedIn audience"),
  callToAction: z.string().max(160).optional().nullable(),
});

function includePostRelations() {
  return {
    account: { select: { id: true, email: true, status: true, timezone: true } },
    media: { orderBy: { createdAt: "asc" as const } },
  };
}

async function assertAccountOwner(accountId: string, userId: string) {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true },
  });
  if (!account) {
    throw new Error("Account not found");
  }
  return account;
}

postsRouter.get("/", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const where = {
      userId: req.user.id,
      ...(status ? { status: status as LinkedInPostStatus } : {}),
    };
    const posts = await prisma.linkedInPost.findMany({
      where,
      include: includePostRelations(),
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    res.json(posts);
  } catch (err) {
    next(err);
  }
});

postsRouter.post("/generate", async (req, res, next) => {
  try {
    const data = GeneratePostSchema.parse(req.body);
    await assertAccountOwner(data.accountId, req.user.id);
    const draft = await generatePostDraft(data);
    res.json(draft);
  } catch (err) {
    next(err);
  }
});

postsRouter.post("/", async (req, res, next) => {
  try {
    const data = CreatePostSchema.parse(req.body);
    await assertAccountOwner(data.accountId, req.user.id);
    const status = data.scheduledFor ? LinkedInPostStatus.SCHEDULED : LinkedInPostStatus.DRAFT;
    const post = await prisma.linkedInPost.create({
      data: {
        userId: req.user.id,
        accountId: data.accountId,
        title: data.title,
        body: data.body,
        prompt: data.prompt,
        tone: data.tone,
        audience: data.audience,
        callToAction: data.callToAction,
        scheduledFor: data.scheduledFor,
        status,
        media: { create: data.media },
      },
      include: includePostRelations(),
    });
    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
});

postsRouter.get("/:id", async (req, res, next) => {
  try {
    const post = await prisma.linkedInPost.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      include: includePostRelations(),
    });
    res.json(post);
  } catch (err) {
    next(err);
  }
});

postsRouter.put("/:id", async (req, res, next) => {
  try {
    const data = UpdatePostSchema.parse(req.body);
    await prisma.linkedInPost.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true },
    });
    const post = await prisma.$transaction(async (tx) => {
      if (data.media) {
        await tx.postMedia.deleteMany({ where: { postId: req.params.id } });
      }
      await tx.linkedInPost.update({
        where: { id: req.params.id },
        data: {
          title: data.title,
          body: data.body,
          prompt: data.prompt,
          tone: data.tone,
          audience: data.audience,
          callToAction: data.callToAction,
          scheduledFor: data.scheduledFor,
          status: data.status,
          lastError: data.status === LinkedInPostStatus.FAILED ? undefined : null,
          ...(data.media ? { media: { create: data.media } } : {}),
        },
      });
      return tx.linkedInPost.findUniqueOrThrow({
        where: { id: req.params.id },
        include: includePostRelations(),
      });
    });
    res.json(post);
  } catch (err) {
    next(err);
  }
});

postsRouter.post("/:id/schedule", async (req, res, next) => {
  try {
    const data = z.object({ scheduledFor: z.coerce.date() }).parse(req.body);
    const post = await prisma.linkedInPost.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: {
        scheduledFor: data.scheduledFor,
        status: LinkedInPostStatus.SCHEDULED,
        lastError: null,
      },
    });
    if (post.count === 0) {
      res.status(404).json({ error: "Post not found" });
      return;
    }
    const updated = await prisma.linkedInPost.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      include: includePostRelations(),
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

postsRouter.post("/:id/publish", async (req, res, next) => {
  try {
    const data = z
      .object({
        visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
      })
      .parse(req.body);
    const post = await prisma.linkedInPost.findFirst({
      where: { id: req.params.id, userId: req.user.id },
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

    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    if (!post.account.linkedinAccessTokenEncrypted || !post.account.linkedinMemberUrn) {
      res.status(409).json({
        error:
          "Connect this account with LinkedIn API access before publishing. Use Accounts > Connect posting API.",
      });
      return;
    }

    if (
      post.account.linkedinAccessTokenExpiresAt &&
      post.account.linkedinAccessTokenExpiresAt < new Date()
    ) {
      res.status(409).json({
        error:
          "LinkedIn API access expired. Reconnect this account from the Accounts page.",
      });
      return;
    }

    await prisma.linkedInPost.update({
      where: { id: post.id },
      data: { status: LinkedInPostStatus.PUBLISHING, lastError: null },
    });

    let linkedinPostUrn: string | null = null;
    try {
      linkedinPostUrn = await publishLinkedInPost({
        accessTokenEncrypted: post.account.linkedinAccessTokenEncrypted,
        authorUrn: post.account.linkedinMemberUrn,
        body: post.body,
        visibility: data.visibility,
        media: post.media,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "LinkedIn publish failed.";
      await prisma.linkedInPost.update({
        where: { id: post.id },
        data: { status: LinkedInPostStatus.FAILED, lastError: message },
      });
      throw err;
    }

    await prisma.linkedInPost.update({
      where: { id: post.id },
      data: {
        status: LinkedInPostStatus.PUBLISHED,
        publishedAt: new Date(),
        linkedinPostUrn,
        lastError: null,
      },
    });

    const updated = await prisma.linkedInPost.findFirstOrThrow({
      where: { id: req.params.id, userId: req.user.id },
      include: includePostRelations(),
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

postsRouter.delete("/:id", async (req, res, next) => {
  try {
    await prisma.linkedInPost.deleteMany({
      where: { id: req.params.id, userId: req.user.id },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
