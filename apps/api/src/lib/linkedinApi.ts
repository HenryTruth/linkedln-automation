import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { encrypt, decrypt } from "@linkedin-automation/guards";

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const LINKEDIN_UGC_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";

type LinkedInTokenResponse = {
  access_token: string;
  expires_in?: number;
  scope?: string;
};

type LinkedInUserInfo = {
  sub: string;
};

type LinkedInUgcPostResponse = {
  id?: string;
};

type OAuthState = {
  accountId: string;
  userId: string;
  exp: number;
  nonce: string;
};

function env(name: string, fallbacks: string[] = []) {
  for (const key of [name, ...fallbacks]) {
    const value = process.env[key];
    if (value) return value;
  }
  return null;
}

export function getLinkedInConfig() {
  const clientId = env("LINKEDIN_CLIENT_ID", ["Client_ID"]);
  const clientSecret = env("LINKEDIN_CLIENT_SECRET", [
    "LINKEDIN_ClIENT_SECRET",
    "LINKEDIN_CLIENT_SECRET",
  ]);
  const redirectUri =
    env("LINKEDIN_REDIRECT_URI") ??
    `http://localhost:${process.env.PORT ?? 3001}/accounts/linkedin/callback`;

  if (!clientId || !clientSecret) {
    throw new Error(
      "LinkedIn OAuth is not configured. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET."
    );
  }

  return { clientId, clientSecret, redirectUri };
}

function stateSecret() {
  return (
    process.env.LINKEDIN_OAUTH_STATE_SECRET ??
    process.env.ENCRYPTION_KEY ??
    getLinkedInConfig().clientSecret
  );
}

function sign(payload: string) {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

export function createLinkedInOAuthState(input: {
  accountId: string;
  userId: string;
}) {
  const state: OAuthState = {
    accountId: input.accountId,
    userId: input.userId,
    exp: Date.now() + 10 * 60 * 1000,
    nonce: randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseLinkedInOAuthState(encoded: string): OAuthState {
  const [payload, signature] = encoded.split(".");
  if (!payload || !signature) throw new Error("Invalid OAuth state.");

  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid OAuth state signature.");
  }

  const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
  if (!state.accountId || !state.userId || !state.exp || state.exp < Date.now()) {
    throw new Error("Expired OAuth state.");
  }
  return state;
}

export function buildLinkedInAuthorizationUrl(input: {
  accountId: string;
  userId: string;
}) {
  const { clientId, redirectUri } = getLinkedInConfig();
  const url = new URL(LINKEDIN_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", createLinkedInOAuthState(input));
  url.searchParams.set("scope", "openid profile w_member_social");
  return url.toString();
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let message = text || response.statusText;
    try {
      const parsed = JSON.parse(text) as { message?: unknown; error_description?: unknown };
      if (typeof parsed.error_description === "string") message = parsed.error_description;
      else if (typeof parsed.message === "string") message = parsed.message;
    } catch {
      // Keep raw response text.
    }
    throw new Error(message);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function exchangeLinkedInCode(code: string) {
  const { clientId, clientSecret, redirectUri } = getLinkedInConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const token = await readJson<LinkedInTokenResponse>(
    await fetch(LINKEDIN_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
  );
  const userInfo = await readJson<LinkedInUserInfo>(
    await fetch(LINKEDIN_USERINFO_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
  );

  return {
    accessTokenEncrypted: encrypt(token.access_token),
    accessTokenExpiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000)
      : null,
    memberUrn: `urn:li:person:${userInfo.sub}`,
  };
}

export async function publishLinkedInTextPost(input: {
  accessTokenEncrypted: string;
  authorUrn: string;
  body: string;
  visibility?: "PUBLIC" | "CONNECTIONS";
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
          "com.linkedin.ugc.MemberNetworkVisibility": input.visibility ?? "PUBLIC",
        },
      }),
    })
  );

  return result.id ?? null;
}
