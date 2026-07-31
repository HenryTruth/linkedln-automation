import { CampaignType } from "@linkedin-automation/db";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const DEFAULT_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";

export type CampaignStrategy = {
  name: string;
  type: CampaignType;
  dailyLimit: number;
  targetTimezone: string | null;
  connectionNoteTemplate: string | null;
  searchKeywords: string[];
  contentSignal: {
    keyword: string;
    dateRangeDays: number;
    maxLeads: number;
    titleFilter: string | null;
    companyFilter: string | null;
    connectionNoteTemplate: string | null;
  } | null;
  messages: Array<{
    sequenceOrder: number;
    subjectTemplate: string | null;
    bodyTemplate: string;
    variantGroup: string;
    delayDays: number;
  }>;
  postIdeas: Array<{
    title: string;
    angle: string;
    format: "TEXT" | "ARTICLE" | "IMAGE" | "VIDEO" | "DOCUMENT";
  }>;
  safetyChecks: string[];
  rationale: string;
};

export type PostDraft = {
  title: string;
  body: string;
  prompt: string;
  tone: string;
  audience: string;
  callToAction: string | null;
  mediaSuggestions: Array<{
    type: "ARTICLE" | "IMAGE" | "VIDEO" | "DOCUMENT";
    title: string;
    description: string;
  }>;
};

export type LeadQualification = {
  fitScore: number;
  fit: "GOOD" | "WEAK" | "REJECT";
  summary: string;
  recommendedAngle: string;
  riskFlags: string[];
  suggestedMessage: string;
};

export type CampaignPreflight = {
  readinessScore: number;
  status: "READY" | "NEEDS_REVIEW" | "BLOCKED";
  blockers: string[];
  warnings: string[];
  recommendations: string[];
  messageFeedback: string[];
  safetySummary: string;
};

export type PostRefinement = PostDraft & {
  angle: string;
};

export type DocumentPlan = {
  title: string;
  subtitle: string;
  pages: Array<{
    heading: string;
    bullets: string[];
  }>;
};

export type NicheOption = {
  label: string;
  rationale: string;
};

export type NicheOptions = {
  path: string[];
  depth: number;
  options: NicheOption[];
  customPromptHint: string;
  readyForTopics: boolean;
};

export type TopicIdeas = {
  niche: string;
  topics: Array<{
    title: string;
    angle: string;
    audience: string;
    format: "TEXT" | "IMAGE" | "DOCUMENT" | "ARTICLE" | "VIDEO";
  }>;
};

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

async function callOpenAIJson<T>(messages: ChatMessage[], fallback: T): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${text || response.statusText}`);
  }

  const parsed = JSON.parse(text) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = parsed.choices?.[0]?.message?.content;
  if (!content) return fallback;

  return JSON.parse(content) as T;
}

function firstSentence(value: string) {
  return value.trim().split(/[.!?]\s/)[0]?.slice(0, 120).trim() || "LinkedIn outreach";
}

function compactName(value: string) {
  return firstSentence(value).replace(/\s+/g, " ").slice(0, 72);
}

export function fallbackCampaignStrategy(input: {
  goal: string;
  targetAudience: string;
  offer?: string | null;
  tone?: string | null;
  accountTimezone?: string | null;
}): CampaignStrategy {
  const goal = input.goal.trim();
  const audience = input.targetAudience.trim() || "qualified LinkedIn prospects";
  const offer = input.offer?.trim() || "a relevant conversation";
  const tone = input.tone?.trim() || "professional";
  const keyword = compactName(`${audience} ${goal}`).toLowerCase();
  const note = `Hi {{firstName}}, noticed your work around ${audience.split(" ").slice(0, 4).join(" ")}. Open to connecting?`;

  return {
    name: compactName(`${audience} - ${goal}`),
    type: CampaignType.CONTENT_SIGNAL,
    dailyLimit: 8,
    targetTimezone: input.accountTimezone ?? null,
    connectionNoteTemplate: note.slice(0, 300),
    searchKeywords: [keyword, compactName(goal).toLowerCase(), compactName(audience).toLowerCase()],
    contentSignal: {
      keyword,
      dateRangeDays: 14,
      maxLeads: 50,
      titleFilter: null,
      companyFilter: null,
      connectionNoteTemplate: note.slice(0, 300),
    },
    messages: [
      {
        sequenceOrder: 0,
        subjectTemplate: null,
        bodyTemplate: `Hi {{firstName}}, saw your perspective around ${keyword}. Curious how your team is approaching ${offer}?`,
        variantGroup: "A",
        delayDays: 0,
      },
      {
        sequenceOrder: 1,
        subjectTemplate: null,
        bodyTemplate: `Quick follow-up, {{firstName}}. If ${goal.toLowerCase()} is on your radar, happy to compare notes.`,
        variantGroup: "A",
        delayDays: 4,
      },
    ],
    postIdeas: [
      {
        title: compactName(goal),
        angle: `Teach ${audience} how to think about ${offer} without sounding promotional.`,
        format: "TEXT",
      },
      {
        title: `${compactName(audience)} checklist`,
        angle: "Turn the outreach thesis into a practical checklist.",
        format: "DOCUMENT",
      },
    ],
    safetyChecks: [
      "Start below account caps and review the first replies manually.",
      "Keep connection notes short and specific.",
      "Do not launch if the account has an unresolved checkpoint.",
    ],
    rationale: `A content-signal campaign is the safest starting point because it looks for people already discussing ${keyword}, then uses that context for reviewed outreach.`,
  };
}

export async function generateCampaignStrategy(input: {
  goal: string;
  targetAudience: string;
  offer?: string | null;
  tone?: string | null;
  accountEmail?: string | null;
  accountTimezone?: string | null;
  warmUpPhase?: string | null;
  salesNavigatorEnabled?: boolean | null;
}) {
  const fallback = fallbackCampaignStrategy(input);
  return callOpenAIJson<CampaignStrategy>(
    [
      {
        role: "system",
        content:
          "You are Vectra's safety-first LinkedIn outreach strategist. Return only valid JSON. Choose conservative limits. Prefer CONTENT_SIGNAL or SEQUENCE when context improves relevance. Never recommend spammy volume.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task:
            "Create a complete campaign strategy for this LinkedIn automation product. Use the exact JSON shape shown in expectedShape.",
          expectedShape: fallback,
          allowedCampaignTypes: Object.values(CampaignType),
          variables: ["{{firstName}}", "{{lastName}}", "{{company}}", "{{title}}"],
          maxConnectionNoteChars: 300,
          input,
        }),
      },
    ],
    fallback
  );
}

export function fallbackPostDraft(input: {
  topic: string;
  tone: string;
  audience: string;
  callToAction?: string | null;
}): PostDraft {
  const topic = input.topic.trim();
  const audience = input.audience.trim() || "LinkedIn operators";
  const cta = input.callToAction?.trim() || "What would you add?";
  const hook =
    input.tone.toLowerCase().includes("casual")
      ? `A quick thought on ${topic}:`
      : `${topic} is becoming one of those areas where execution matters more than noise.`;

  return {
    title: compactName(topic),
    body: [
      hook,
      "",
      `For ${audience}, the useful question is not whether to pay attention. It is how to turn attention into a repeatable operating habit.`,
      "",
      "The teams that win usually do three things well:",
      "1. Define the signal they care about.",
      "2. Make the workflow easy to repeat.",
      "3. Review outcomes before scaling volume.",
      "",
      cta,
    ].join("\n"),
    prompt: topic,
    tone: input.tone,
    audience,
    callToAction: cta,
    mediaSuggestions: [
      {
        type: "DOCUMENT",
        title: `${compactName(topic)} checklist`,
        description: "A short carousel-style document that turns the post into a practical checklist.",
      },
      {
        type: "IMAGE",
        title: `${compactName(topic)} framework`,
        description: "A simple visual framework summarizing the three main ideas.",
      },
    ],
  };
}

export async function generatePostDraft(input: {
  topic: string;
  tone: string;
  audience: string;
  callToAction?: string | null;
}) {
  const fallback = fallbackPostDraft(input);
  return callOpenAIJson<PostDraft>(
    [
      {
        role: "system",
        content:
          "You write useful LinkedIn posts for B2B operators. Return only valid JSON. Avoid hype, fake metrics, fabricated claims, and engagement-bait. Keep the post publish-ready.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Generate a LinkedIn post draft and media suggestions using the expected JSON shape.",
          expectedShape: fallback,
          input,
        }),
      },
    ],
    fallback
  );
}

export async function refinePostDraft(input: {
  title: string;
  body: string;
  instruction: string;
  angle?: string | null;
  tone?: string | null;
  audience?: string | null;
  context?: string | null;
}) {
  const fallback = fallbackPostDraft({
    topic: `${input.title}\n${input.instruction}`,
    tone: input.tone ?? "professional",
    audience: input.audience ?? "LinkedIn audience",
    callToAction: null,
  });
  return callOpenAIJson<PostRefinement>(
    [
      {
        role: "system",
        content:
          "You are a LinkedIn editor. Return only valid JSON. Refine the draft according to the user's requested angle, tone, audience, and context. Keep it concrete, non-hype, and publish-ready.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Refine this LinkedIn post. Use the expected JSON shape.",
          expectedShape: { ...fallback, angle: input.angle ?? "refined" },
          input,
        }),
      },
    ],
    { ...fallback, angle: input.angle ?? "refined" }
  );
}

export async function generateImageBytes(input: {
  prompt: string;
  title?: string | null;
  body?: string | null;
  format?: "png" | "jpeg" | "webp";
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate images.");
  }

  const response = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_IMAGE_MODEL,
      prompt: [
        input.prompt,
        input.title ? `Post title: ${input.title}` : "",
        input.body ? `Post context: ${input.body.slice(0, 1200)}` : "",
        "Create a polished LinkedIn-safe business visual. Avoid tiny text, fake logos, copyrighted characters, celebrity likeness, and unverifiable charts.",
      ]
        .filter(Boolean)
        .join("\n\n"),
      size: "1024x1024",
      quality: "auto",
      output_format: input.format ?? "png",
      n: 1,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI image request failed (${response.status}): ${text || response.statusText}`);
  }

  const parsed = JSON.parse(text) as { data?: Array<{ b64_json?: string }> };
  const b64 = parsed.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI image response did not include image data.");
  }
  return Buffer.from(b64, "base64");
}

export function fallbackDocumentPlan(input: {
  title: string;
  body: string;
  instruction?: string | null;
}): DocumentPlan {
  const title = input.title.trim() || "LinkedIn Document";
  const bodyLines = input.body
    .split(/\n+/)
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 9);
  const bullets = bodyLines.length > 0 ? bodyLines : ["Define the signal.", "Build the workflow.", "Review before scaling."];
  return {
    title,
    subtitle: input.instruction?.trim() || "A short operator-ready checklist",
    pages: [
      { heading: "The idea", bullets: bullets.slice(0, 3) },
      { heading: "How to use it", bullets: bullets.slice(3, 6).length ? bullets.slice(3, 6) : bullets.slice(0, 3) },
      { heading: "Before you scale", bullets: bullets.slice(6, 9).length ? bullets.slice(6, 9) : ["Keep it specific.", "Review early replies.", "Increase volume slowly."] },
    ],
  };
}

export async function generateDocumentPlan(input: {
  title: string;
  body: string;
  instruction?: string | null;
  audience?: string | null;
}) {
  const fallback = fallbackDocumentPlan(input);
  return callOpenAIJson<DocumentPlan>(
    [
      {
        role: "system",
        content:
          "You create concise LinkedIn carousel/PDF document outlines. Return only valid JSON. Use short, useful headings and bullets. Avoid fabricated stats.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Turn this post into a short LinkedIn document plan using the expected JSON shape.",
          expectedShape: fallback,
          input,
        }),
      },
    ],
    fallback
  );
}

export function fallbackNicheOptions(input: {
  path: string[];
  audience?: string | null;
  context?: string | null;
  customSeed?: string | null;
}) {
  const path = [...input.path, input.customSeed ?? ""].map((item) => item.trim()).filter(Boolean);
  const base = path.at(-1) || input.context?.trim() || input.audience?.trim() || "LinkedIn growth";
  const depth = path.length;
  const suffixes =
    depth === 0
      ? ["operator workflows", "founder lessons", "sales systems", "AI adoption", "content-led outreach", "risk controls"]
      : depth === 1
        ? ["for small teams", "for agencies", "for B2B founders", "with low-volume execution", "using recent buyer signals", "without spammy automation"]
        : ["mistakes", "checklists", "before-and-after examples", "decision frameworks", "weekly operating routines", "metrics to review"];
  return {
    path,
    depth,
    options: suffixes.map((suffix) => ({
      label: depth === 0 ? suffix : `${base} ${suffix}`,
      rationale: `Narrows the idea toward ${suffix}.`,
    })),
    customPromptHint: "Add your own audience, industry, pain point, or point of view.",
    readyForTopics: depth >= 2,
  } satisfies NicheOptions;
}

export async function generateNicheOptions(input: {
  path: string[];
  audience?: string | null;
  context?: string | null;
  customSeed?: string | null;
}) {
  const fallback = fallbackNicheOptions(input);
  return callOpenAIJson<NicheOptions>(
    [
      {
        role: "system",
        content:
          "You are Vectra's LinkedIn content strategist. Return only valid JSON. Generate useful niche-down options based on the selected path. Each option must be meaningfully narrower than the previous path and suitable for B2B LinkedIn posts.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Generate the next cascade options for niching down a LinkedIn content idea.",
          expectedShape: fallback,
          constraints: [
            "Return 6 options.",
            "Avoid generic categories once depth is greater than 0.",
            "Make options specific enough that the next selection can become post topics.",
            "Set readyForTopics true when the path is narrow enough to generate strong topics.",
          ],
          input,
        }),
      },
    ],
    fallback
  );
}

export function fallbackTopicIdeas(input: {
  path: string[];
  audience?: string | null;
  context?: string | null;
  customSeed?: string | null;
}) {
  const path = [...input.path, input.customSeed ?? ""].map((item) => item.trim()).filter(Boolean);
  const niche = path.join(" > ") || input.context || "LinkedIn growth";
  const audience = input.audience?.trim() || "founders and operators";
  const finalNiche = path.at(-1) || "LinkedIn outreach";
  return {
    niche,
    topics: [
      {
        title: `The quiet mistake ${audience} make with ${finalNiche}`,
        angle: "A practical warning post with a simple fix.",
        audience,
        format: "TEXT",
      },
      {
        title: `A simple checklist for ${finalNiche}`,
        angle: "Turn the niche into an operator checklist.",
        audience,
        format: "DOCUMENT",
      },
      {
        title: `What to review before scaling ${finalNiche}`,
        angle: "Safety-first preflight framework.",
        audience,
        format: "IMAGE",
      },
    ],
  } satisfies TopicIdeas;
}

export async function generateTopicIdeas(input: {
  path: string[];
  audience?: string | null;
  context?: string | null;
  customSeed?: string | null;
}) {
  const fallback = fallbackTopicIdeas(input);
  return callOpenAIJson<TopicIdeas>(
    [
      {
        role: "system",
        content:
          "You generate specific LinkedIn post topics from a narrowed niche. Return only valid JSON. Topics must be concrete, non-clickbait, and useful for B2B operators.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Generate topic ideas from this niche path using the expected JSON shape.",
          expectedShape: fallback,
          constraints: [
            "Return 6 topics.",
            "Each topic should be publishable as a LinkedIn post brief.",
            "Vary format suggestions across TEXT, DOCUMENT, IMAGE, ARTICLE, and VIDEO when useful.",
            "Avoid fabricated data or overpromising.",
          ],
          input,
        }),
      },
    ],
    fallback
  );
}

export function fallbackLeadQualification(input: {
  lead: {
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    company?: string | null;
    linkedinUrl: string;
  };
  campaign?: {
    name: string;
    type: string;
    connectionNoteTemplate?: string | null;
  } | null;
  postSignals?: Array<{ keyword: string; excerpt: string }> | null;
}): LeadQualification {
  const title = input.lead.title?.trim() ?? "";
  const company = input.lead.company?.trim() ?? "";
  const hasContext = (input.postSignals?.length ?? 0) > 0;
  const hasRole = Boolean(title || company);
  const fitScore = hasContext ? 78 : hasRole ? 62 : 38;
  const fit = fitScore >= 70 ? "GOOD" : fitScore >= 45 ? "WEAK" : "REJECT";
  const signal = input.postSignals?.[0];
  const angle = signal
    ? `Reference their post about ${signal.keyword} and connect it to the campaign goal.`
    : title || company
      ? `Reference their role${company ? ` at ${company}` : ""} and keep the ask light.`
      : "Do not personalize beyond a light introduction until more profile context is collected.";

  return {
    fitScore,
    fit,
    summary: hasRole
      ? `${[title, company].filter(Boolean).join(" at ")} looks ${fit === "GOOD" ? "relevant" : "partially relevant"} based on available lead data.`
      : "There is not enough lead data to confidently qualify this person.",
    recommendedAngle: angle,
    riskFlags: [
      ...(!hasRole ? ["Missing title/company context"] : []),
      ...(fit === "REJECT" ? ["Low personalization confidence"] : []),
    ],
    suggestedMessage:
      fit === "REJECT"
        ? "Collect more context before sending outreach."
        : `Hi {{firstName}}, ${signal ? `saw your post about ${signal.keyword}` : `noticed your work${company ? ` at ${company}` : ""}`}. Open to connecting?`,
  };
}

export async function qualifyLead(input: {
  lead: {
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    company?: string | null;
    linkedinUrl: string;
    source?: string | null;
    connectionStatus?: string | null;
    blacklisted?: boolean | null;
  };
  campaign?: {
    name: string;
    type: string;
    connectionNoteTemplate?: string | null;
    dailyLimit?: number | null;
  } | null;
  postSignals?: Array<{ keyword: string; excerpt: string }> | null;
}) {
  const fallback = fallbackLeadQualification(input);
  return callOpenAIJson<LeadQualification>(
    [
      {
        role: "system",
        content:
          "You are Vectra's lead qualification analyst. Return only valid JSON. Be conservative. Flag poor fit, missing context, competitors, and low personalization confidence. Never fabricate facts.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Score this LinkedIn lead for outreach and draft a safe personalized opener using the expected JSON shape.",
          expectedShape: fallback,
          maxConnectionNoteChars: 300,
          variables: ["{{firstName}}", "{{lastName}}", "{{company}}", "{{title}}"],
          input,
        }),
      },
    ],
    fallback
  );
}

export function fallbackCampaignPreflight(input: {
  campaign: {
    name: string;
    type: string;
    status: string;
    dailyLimit: number;
    connectionNoteTemplate?: string | null;
    leadTotal: number;
    messages?: Array<{ bodyTemplate: string; delayDays: number }> | null;
  };
  account?: {
    status?: string | null;
    browserProfileStatus?: string | null;
    warmUpPhase?: string | null;
  } | null;
}) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (input.account?.status && input.account.status !== "ACTIVE") {
    blockers.push(`Account status is ${input.account.status}.`);
  }
  if (input.account?.browserProfileStatus && input.account.browserProfileStatus !== "AUTHENTICATED") {
    warnings.push(`Browser profile is ${input.account.browserProfileStatus}.`);
  }
  if (input.campaign.leadTotal === 0) blockers.push("Campaign has no leads.");
  if (input.campaign.dailyLimit > 15) warnings.push("Daily limit is above the conservative default.");
  if (input.campaign.type === "CONNECT" && !input.campaign.connectionNoteTemplate) {
    recommendations.push("Add a short connection note or use content-signal context before starting.");
  }
  if ((input.campaign.messages?.length ?? 0) === 0 && ["MESSAGE", "INMAIL"].includes(input.campaign.type)) {
    blockers.push("Campaign has no message templates.");
  }

  const status = blockers.length > 0 ? "BLOCKED" : warnings.length > 0 ? "NEEDS_REVIEW" : "READY";
  return {
    readinessScore: status === "READY" ? 88 : status === "NEEDS_REVIEW" ? 64 : 35,
    status,
    blockers,
    warnings,
    recommendations:
      recommendations.length > 0
        ? recommendations
        : ["Review the first 10 leads manually before increasing volume."],
    messageFeedback: ["Keep language specific, short, and tied to observable profile or post context."],
    safetySummary:
      status === "READY"
        ? "This campaign looks ready for a conservative launch."
        : "Review the listed items before starting this campaign.",
  } satisfies CampaignPreflight;
}

export async function reviewCampaignPreflight(input: Parameters<typeof fallbackCampaignPreflight>[0]) {
  const fallback = fallbackCampaignPreflight(input);
  return callOpenAIJson<CampaignPreflight>(
    [
      {
        role: "system",
        content:
          "You are Vectra's campaign safety reviewer. Return only valid JSON. Prioritize account safety, personalization quality, missing setup, lead fit, and conservative volume.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Review this campaign before launch using the expected JSON shape.",
          expectedShape: fallback,
          input,
        }),
      },
    ],
    fallback
  );
}
