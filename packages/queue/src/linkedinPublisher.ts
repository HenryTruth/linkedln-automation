import { PostMediaType } from "@linkedin-automation/db";
import { decrypt } from "@linkedin-automation/guards";

const LINKEDIN_ASSETS_URL = "https://api.linkedin.com/v2/assets?action=registerUpload";
const LINKEDIN_DOCUMENTS_REST_URL = "https://api.linkedin.com/rest/documents";
const LINKEDIN_POSTS_REST_URL = "https://api.linkedin.com/rest/posts";
const LINKEDIN_UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;
const LINKEDIN_REST_VERSION = process.env.LINKEDIN_REST_VERSION ?? "202607";

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

type LinkedInDocumentInitializeResponse = {
  value: {
    document: string;
    uploadUrl: string;
    uploadUrlExpiresAt?: number;
  };
};

type LinkedInDocumentResponse = {
  id: string;
  status?: "PROCESSING" | "PROCESSING_FAILED" | "AVAILABLE" | "WAITING_UPLOAD";
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
  const uploadMedia = media.filter(
    (item) => item.type === PostMediaType.IMAGE || item.type === PostMediaType.VIDEO
  );
  const articleMedia = media.filter((item) => item.type === PostMediaType.ARTICLE);
  const videoMedia = media.filter((item) => item.type === PostMediaType.VIDEO);
  const documentMedia = media.filter((item) => item.type === PostMediaType.DOCUMENT);

  if (articleMedia.length > 1) {
    throw new Error("LinkedIn article posts support one article URL.");
  }
  if (videoMedia.length > 1) {
    throw new Error("LinkedIn video posts support one video per post.");
  }
  if (documentMedia.length > 1) {
    throw new Error("LinkedIn document posts support one document per post.");
  }
  if (uploadMedia.length > 0 && articleMedia.length > 0) {
    throw new Error("LinkedIn posts cannot mix article URLs with uploaded image/video media.");
  }
  if (documentMedia.length > 0 && media.length > 1) {
    throw new Error("LinkedIn document posts cannot mix document media with other media.");
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
  const maxBytes =
    media.type === PostMediaType.IMAGE
      ? MAX_IMAGE_BYTES
      : media.type === PostMediaType.VIDEO
        ? MAX_VIDEO_BYTES
        : MAX_DOCUMENT_BYTES;

  if (contentLength > maxBytes) {
    throw new Error(`Media file is too large. Limit is ${Math.round(maxBytes / 1024 / 1024)}MB.`);
  }
  if (media.type === PostMediaType.IMAGE && !["image/jpeg", "image/png", "image/gif"].includes(contentType)) {
    throw new Error("Image media must be JPEG, PNG, or GIF.");
  }
  if (media.type === PostMediaType.VIDEO && contentType !== "video/mp4") {
    throw new Error("Video media must be MP4.");
  }
  if (media.type === PostMediaType.DOCUMENT && !isSupportedDocument(url, contentType)) {
    throw new Error("Document media must be PDF, PPT, PPTX, DOC, or DOCX.");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    throw new Error(`Media file is too large. Limit is ${Math.round(maxBytes / 1024 / 1024)}MB.`);
  }

  return { bytes, contentType };
}

function isSupportedDocument(url: string, contentType: string) {
  const allowedContentTypes = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ]);
  if (allowedContentTypes.has(contentType)) return true;

  const pathname = new URL(url).pathname.toLowerCase();
  return [".pdf", ".ppt", ".pptx", ".doc", ".docx"].some((extension) => pathname.endsWith(extension));
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

async function initializeDocumentUpload(input: {
  accessToken: string;
  authorUrn: string;
}) {
  return readJson<LinkedInDocumentInitializeResponse>(
    await fetch(`${LINKEDIN_DOCUMENTS_REST_URL}?action=initializeUpload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        "Linkedin-Version": LINKEDIN_REST_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: input.authorUrn,
        },
      }),
    })
  );
}

async function uploadDocument(input: {
  accessToken: string;
  authorUrn: string;
  media: LinkedInPublishMedia;
}) {
  if (input.media.type !== PostMediaType.DOCUMENT) {
    throw new Error("Only document media can be uploaded as a LinkedIn document.");
  }

  const [{ bytes, contentType }, initialized] = await Promise.all([
    fetchRemoteMedia(input.media),
    initializeDocumentUpload({
      accessToken: input.accessToken,
      authorUrn: input.authorUrn,
    }),
  ]);

  await uploadAsset({
    accessToken: input.accessToken,
    uploadUrl: initialized.value.uploadUrl,
    bytes,
    contentType,
  });

  await waitForDocumentAvailable(input.accessToken, initialized.value.document);

  return initialized.value.document;
}

async function getDocument(input: { accessToken: string; documentUrn: string }) {
  return readJson<LinkedInDocumentResponse>(
    await fetch(`${LINKEDIN_DOCUMENTS_REST_URL}/${input.documentUrn}`, {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Linkedin-Version": LINKEDIN_REST_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    })
  );
}

async function waitForDocumentAvailable(accessToken: string, documentUrn: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const document = await getDocument({ accessToken, documentUrn });
    if (document.status === "AVAILABLE") return;
    if (document.status === "PROCESSING_FAILED") {
      throw new Error("LinkedIn document processing failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error("LinkedIn document is still processing. Try publishing again in a moment.");
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

async function createDocumentPost(input: {
  accessToken: string;
  authorUrn: string;
  body: string;
  visibility?: "PUBLIC" | "CONNECTIONS";
  media: LinkedInPublishMedia;
}) {
  const documentUrn = await uploadDocument({
    accessToken: input.accessToken,
    authorUrn: input.authorUrn,
    media: input.media,
  });

  const response = await fetch(LINKEDIN_POSTS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      "Linkedin-Version": LINKEDIN_REST_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: input.authorUrn,
      commentary: input.body,
      visibility: input.visibility ?? "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      content: {
        media: {
          title: input.media.title?.trim() || filenameFromUrl(input.media.url),
          id: documentUrn,
        },
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });

  await readJson<Record<string, never>>(response);
  return response.headers.get("x-restli-id");
}

function filenameFromUrl(value: string) {
  const pathname = new URL(value).pathname;
  const filename = pathname.split("/").filter(Boolean).pop();
  return filename ? decodeURIComponent(filename).slice(0, 160) : "Document";
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

  if (media.length === 1 && media[0]?.type === PostMediaType.DOCUMENT) {
    return createDocumentPost({
      accessToken,
      authorUrn: input.authorUrn,
      body: input.body,
      visibility: input.visibility,
      media: media[0],
    });
  }

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
