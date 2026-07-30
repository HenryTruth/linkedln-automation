import { PostMediaType } from "@linkedin-automation/db";
import { decrypt } from "@linkedin-automation/guards";

const LINKEDIN_ASSETS_URL = "https://api.linkedin.com/v2/assets?action=registerUpload";
const LINKEDIN_UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export type LinkedInPublishMedia = {
  type: PostMediaType;
  url: string;
  title?: string | null;
  description?: string | null;
};

type LinkedInAssetRegisterResponse = {
  value: {
    asset: string;
    uploadMechanism: {
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
        headers?: Record<string, string>;
        uploadUrl: string;
      };
    };
  };
};

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

function textObject(value?: string | null) {
  const text = value?.trim();
  return text ? { text } : undefined;
}

function assertSupportedMedia(media: LinkedInPublishMedia[]) {
  if (media.some((item) => item.type === PostMediaType.DOCUMENT)) {
    throw new Error(
      "Document publishing needs LinkedIn Documents API support. Use image, video, or article media for now."
    );
  }

  const uploadMedia = media.filter(
    (item) => item.type === PostMediaType.IMAGE || item.type === PostMediaType.VIDEO
  );
  const articleMedia = media.filter((item) => item.type === PostMediaType.ARTICLE);
  const videoMedia = media.filter((item) => item.type === PostMediaType.VIDEO);

  if (articleMedia.length > 1) {
    throw new Error("LinkedIn article posts support one article URL.");
  }
  if (videoMedia.length > 1) {
    throw new Error("LinkedIn video posts support one video per post.");
  }
  if (uploadMedia.length > 0 && articleMedia.length > 0) {
    throw new Error("LinkedIn posts cannot mix article URLs with uploaded image/video media.");
  }
  if (videoMedia.length > 0 && uploadMedia.length > 1) {
    throw new Error("LinkedIn video posts cannot mix video with other media.");
  }
}

function validateRemoteUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Media URL must be http or https.");
  }
  return url.toString();
}

async function fetchRemoteMedia(media: LinkedInPublishMedia) {
  const url = validateRemoteUrl(media.url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch media URL (${response.status}).`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  const maxBytes = media.type === PostMediaType.IMAGE ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;

  if (contentLength > maxBytes) {
    throw new Error(`Media file is too large. Limit is ${Math.round(maxBytes / 1024 / 1024)}MB.`);
  }
  if (media.type === PostMediaType.IMAGE && !["image/jpeg", "image/png", "image/gif"].includes(contentType)) {
    throw new Error("Image media must be JPEG, PNG, or GIF.");
  }
  if (media.type === PostMediaType.VIDEO && contentType !== "video/mp4") {
    throw new Error("Video media must be MP4.");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    throw new Error(`Media file is too large. Limit is ${Math.round(maxBytes / 1024 / 1024)}MB.`);
  }

  return { bytes, contentType };
}

async function registerUpload(input: {
  accessToken: string;
  authorUrn: string;
  type: "IMAGE" | "VIDEO";
}) {
  const recipe =
    input.type === PostMediaType.IMAGE
      ? "urn:li:digitalmediaRecipe:feedshare-image"
      : "urn:li:digitalmediaRecipe:feedshare-video";
  const registerUploadRequest: Record<string, unknown> = {
    recipes: [recipe],
    owner: input.authorUrn,
    serviceRelationships: [
      {
        relationshipType: "OWNER",
        identifier: "urn:li:userGeneratedContent",
      },
    ],
  };

  if (input.type === PostMediaType.IMAGE) {
    registerUploadRequest.supportedUploadMechanism = ["SYNCHRONOUS_UPLOAD"];
  }

  return readJson<LinkedInAssetRegisterResponse>(
    await fetch(LINKEDIN_ASSETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({ registerUploadRequest }),
    })
  );
}

async function uploadAsset(input: {
  accessToken: string;
  uploadUrl: string;
  headers?: Record<string, string>;
  bytes: Buffer;
  contentType: string;
}) {
  const response = await fetch(input.uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": input.contentType,
      ...(input.headers ?? {}),
    },
    body: input.bytes,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LinkedIn media upload failed (${response.status}): ${text || response.statusText}`);
  }
}

async function uploadMedia(input: {
  accessToken: string;
  authorUrn: string;
  media: LinkedInPublishMedia;
}) {
  if (input.media.type !== PostMediaType.IMAGE && input.media.type !== PostMediaType.VIDEO) {
    throw new Error("Only image and video media can be uploaded.");
  }

  const [{ bytes, contentType }, registered] = await Promise.all([
    fetchRemoteMedia(input.media),
    registerUpload({
      accessToken: input.accessToken,
      authorUrn: input.authorUrn,
      type: input.media.type,
    }),
  ]);
  const uploadRequest =
    registered.value.uploadMechanism[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ];

  await uploadAsset({
    accessToken: input.accessToken,
    uploadUrl: uploadRequest.uploadUrl,
    headers: uploadRequest.headers,
    bytes,
    contentType,
  });

  return registered.value.asset;
}

function buildArticleMedia(media: LinkedInPublishMedia) {
  return {
    status: "READY",
    originalUrl: media.url,
    ...(textObject(media.title) ? { title: textObject(media.title) } : {}),
    ...(textObject(media.description) ? { description: textObject(media.description) } : {}),
  };
}

function buildUploadedMedia(asset: string, media: LinkedInPublishMedia) {
  return {
    status: "READY",
    media: asset,
    ...(textObject(media.title) ? { title: textObject(media.title) } : {}),
    ...(textObject(media.description) ? { description: textObject(media.description) } : {}),
  };
}

export async function publishLinkedInPost(input: {
  accessTokenEncrypted: string;
  authorUrn: string;
  body: string;
  visibility?: "PUBLIC" | "CONNECTIONS";
  media?: LinkedInPublishMedia[];
}) {
  const accessToken = decrypt(input.accessTokenEncrypted);
  const media = input.media ?? [];
  assertSupportedMedia(media);

  let shareMediaCategory: "NONE" | "ARTICLE" | "IMAGE" | "VIDEO" = "NONE";
  let shareMedia: Array<Record<string, unknown>> | undefined;

  if (media.length > 0 && media.every((item) => item.type === PostMediaType.ARTICLE)) {
    shareMediaCategory = "ARTICLE";
    shareMedia = media.map(buildArticleMedia);
  } else if (media.length > 0) {
    const uploaded = [];
    for (const item of media) {
      const asset = await uploadMedia({ accessToken, authorUrn: input.authorUrn, media: item });
      uploaded.push(buildUploadedMedia(asset, item));
    }
    shareMediaCategory = media[0]?.type === PostMediaType.VIDEO ? "VIDEO" : "IMAGE";
    shareMedia = uploaded;
  }

  const shareContent: Record<string, unknown> = {
    shareCommentary: { text: input.body },
    shareMediaCategory,
  };

  if (shareMedia) {
    shareContent.media = shareMedia;
  }

  const response = await fetch(LINKEDIN_UGC_POSTS_URL, {
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
        "com.linkedin.ugc.MemberNetworkVisibility": input.visibility ?? "PUBLIC",
      },
    }),
  });
  const result = await readJson<LinkedInUgcPostResponse>(response);

  return result.id ?? response.headers.get("x-restli-id");
}
