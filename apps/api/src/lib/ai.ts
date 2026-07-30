import { CampaignType } from "@linkedin-automation/db";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

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
