"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  api,
  type Account,
  type LinkedInPost,
  type LinkedInPostStatus,
  type PostMediaType,
  type GeneratedPostDraft,
  type NicheOptions,
  type TopicIdeas,
} from "@/lib/api";
import { Badge } from "@/components/Badge";
import { Skeleton, SkeletonTableRows } from "@/components/Skeleton";

type MediaDraft = {
  type: PostMediaType;
  url: string;
  title: string;
  description: string;
};

const emptyMedia: MediaDraft = {
  type: "IMAGE",
  url: "",
  title: "",
  description: "",
};

function initialsFromEmail(email?: string | null) {
  if (!email) return "V";
  return email
    .split("@")[0]
    .split(/[._-]+/)
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase() || "V";
}

function accountDisplayName(email?: string | null) {
  if (!email) return "Your LinkedIn profile";
  return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function isPdfUrl(url: string) {
  return /\.pdf($|\?)/i.test(url) || url.includes("/ai-assets/");
}

function LinkedInAttachmentPreview({ item, index, total }: { item: MediaDraft; index: number; total: number }) {
  const title = item.title || `${item.type[0]}${item.type.slice(1).toLowerCase()} attachment`;
  const description = item.description || item.url;

  if (!item.url.trim()) {
    return (
      <div className="flex min-h-44 items-center justify-center rounded-b-xl border-t border-slate-200 bg-slate-100 px-6 text-center text-sm text-slate-500">
        {title} will appear here after you add a public URL.
      </div>
    );
  }

  if (item.type === "IMAGE") {
    return (
      <div className="relative overflow-hidden border-t border-slate-200 bg-slate-100">
        <img src={item.url} alt={title} className="max-h-[520px] w-full object-contain" />
        {total > 1 && (
          <span className="absolute right-3 top-3 rounded-full bg-slate-950/75 px-2.5 py-1 text-xs font-semibold text-white">
            {index + 1}/{total}
          </span>
        )}
      </div>
    );
  }

  if (item.type === "DOCUMENT") {
    return (
      <div className="border-t border-slate-200 bg-slate-100 p-3">
        <div className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
          {isPdfUrl(item.url) ? (
            <iframe src={item.url} title={title} className="h-80 w-full bg-white" />
          ) : (
            <div className="flex h-80 items-center justify-center bg-slate-50 px-6 text-center text-sm text-slate-500">
              Document preview uses the public document URL.
            </div>
          )}
          <div className="border-t border-slate-200 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{description}</p>
          </div>
        </div>
      </div>
    );
  }

  if (item.type === "ARTICLE") {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="block border-t border-slate-200 bg-slate-100 transition hover:bg-slate-200"
      >
        <div className="flex min-h-44 items-center justify-center bg-slate-200 px-6 text-center text-sm font-semibold text-slate-500">
          Link preview
        </div>
        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{description}</p>
          <p className="mt-2 truncate text-[11px] uppercase tracking-[0.08em] text-slate-400">
            {item.url.replace(/^https?:\/\//i, "")}
          </p>
        </div>
      </a>
    );
  }

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="block border-t border-slate-200 bg-slate-950 text-white"
    >
      <div className="flex min-h-64 items-center justify-center px-6 text-center">
        <div>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-xs font-bold uppercase tracking-[0.12em]">
            Play
          </span>
          <p className="mt-4 text-sm font-semibold">{title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-300">{description}</p>
        </div>
      </div>
    </a>
  );
}

function LinkedInPostPreview({
  account,
  title,
  body,
  media,
}: {
  account?: Account;
  title: string;
  body: string;
  media: MediaDraft[];
}) {
  const attachedMedia = media.filter((item) => item.url.trim() || item.title.trim() || item.description.trim());
  const displayBody = body.trim() || "Your post body will preview here as you write.";
  const bodyLines = displayBody.split("\n");

  return (
    <section className="app-panel p-5 lg:col-span-2">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-300">
            LinkedIn preview
          </p>
          <h2 className="mt-2 text-lg font-semibold text-white">How this post will feel in feed</h2>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-slate-950/60 px-3 py-1 text-xs font-semibold text-slate-400">
          {attachedMedia.length === 0 ? "Text post" : `${attachedMedia.length} media ${attachedMedia.length === 1 ? "item" : "items"}`}
        </span>
      </div>

      <div className="mx-auto max-w-2xl overflow-hidden rounded-xl bg-white text-slate-950 shadow-2xl shadow-slate-950/30">
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#0a66c2] text-sm font-bold text-white">
            {initialsFromEmail(account?.email)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold leading-5 text-slate-950">{accountDisplayName(account?.email)}</p>
                <p className="text-xs leading-4 text-slate-500">Founder - Posting from Vectra</p>
                <p className="text-xs leading-4 text-slate-500">Now - Public</p>
              </div>
              <span className="text-xl leading-none text-slate-400">...</span>
            </div>
          </div>
        </div>

        <div className="px-4 pb-3">
          {title.trim() && <p className="mb-2 text-sm font-semibold text-slate-950">{title}</p>}
          <div className="space-y-3 text-sm leading-5 text-slate-900">
            {bodyLines.map((line, index) =>
              line.trim() ? <p key={index}>{line}</p> : <div key={index} className="h-1" />
            )}
          </div>
        </div>

        {attachedMedia.length === 1 && (
          <LinkedInAttachmentPreview item={attachedMedia[0]} index={0} total={1} />
        )}

        {attachedMedia.length > 1 && (
          <div className="border-t border-slate-200 bg-slate-100">
            <div className="flex snap-x gap-3 overflow-x-auto p-3">
              {attachedMedia.map((item, index) => (
                <div key={`${item.type}-${item.url}-${index}`} className="w-[86%] shrink-0 snap-center overflow-hidden rounded-lg border border-slate-300 bg-white sm:w-[72%]">
                  <LinkedInAttachmentPreview item={item} index={index} total={attachedMedia.length} />
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-1.5 pb-3">
              {attachedMedia.map((item, index) => (
                <span key={`${item.type}-${index}`} className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
          <div className="flex items-center justify-between">
            <span>0 reactions</span>
            <span>0 comments - 0 reposts</span>
          </div>
        </div>
        <div className="grid grid-cols-4 border-t border-slate-200 px-2 py-1 text-sm font-semibold text-slate-500">
          {["Like", "Comment", "Repost", "Send"].map((item) => (
            <button key={item} type="button" className="rounded-md px-2 py-2 hover:bg-slate-100">
              {item}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function toLocalInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export default function PostsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<LinkedInPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("professional");
  const [audience, setAudience] = useState("founders and operators");
  const [callToAction, setCallToAction] = useState("");
  const [ideaContext, setIdeaContext] = useState("");
  const [customNiche, setCustomNiche] = useState("");
  const [nichePath, setNichePath] = useState<string[]>([]);
  const [nicheOptions, setNicheOptions] = useState<NicheOptions | null>(null);
  const [topicIdeas, setTopicIdeas] = useState<TopicIdeas | null>(null);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refineAngle, setRefineAngle] = useState("make it more practical");
  const [assetPrompt, setAssetPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [media, setMedia] = useState<MediaDraft[]>([]);
  const [mediaSuggestions, setMediaSuggestions] = useState<NonNullable<GeneratedPostDraft["mediaSuggestions"]>>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    return Promise.all([api.accounts.list(), api.posts.list()]).then(([a, p]) => {
      setAccounts(a);
      setPosts(p);
      setAccountId((current) => current || a[0]?.id || "");
    });
  }

  useEffect(() => {
    refresh()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    return posts.reduce(
      (acc, post) => {
        acc[post.status] = (acc[post.status] ?? 0) + 1;
        return acc;
      },
      {} as Partial<Record<LinkedInPostStatus, number>>
    );
  }, [posts]);
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId),
    [accounts, accountId]
  );

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setTopic("");
    setCallToAction("");
    setIdeaContext("");
    setCustomNiche("");
    setNichePath([]);
    setNicheOptions(null);
    setTopicIdeas(null);
    setRefineInstruction("");
    setAssetPrompt("");
    setScheduledFor("");
    setMedia([]);
    setMediaSuggestions([]);
  }

  function editPost(post: LinkedInPost) {
    setEditingId(post.id);
    setAccountId(post.accountId);
    setTitle(post.title);
    setBody(post.body);
    setTopic(post.prompt ?? "");
    setTone(post.tone ?? "professional");
    setAudience(post.audience ?? "founders and operators");
    setCallToAction(post.callToAction ?? "");
    setScheduledFor(toLocalInputValue(post.scheduledFor));
    setMedia(
      post.media.map((item) => ({
        type: item.type,
        url: item.url,
        title: item.title ?? "",
        description: item.description ?? "",
      }))
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadNicheOptions(nextPath = nichePath, customSeed?: string | null) {
    setBusy("niche");
    try {
      const options = await api.ai.nicheOptions({
        path: nextPath,
        audience,
        context: ideaContext || topic || null,
        customSeed: customSeed || null,
      });
      setNichePath(options.path);
      setNicheOptions(options);
      setTopicIdeas(null);
      toast.success(nextPath.length > 0 || customSeed ? "Niche refined" : "Idea options generated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function selectNiche(label: string) {
    void loadNicheOptions([...nichePath, label]);
  }

  function stepBackNiche() {
    const nextPath = nichePath.slice(0, -1);
    void loadNicheOptions(nextPath);
  }

  function resetNiche() {
    setNichePath([]);
    setNicheOptions(null);
    setTopicIdeas(null);
    setCustomNiche("");
  }

  function addCustomNiche() {
    const value = customNiche.trim();
    if (!value) {
      toast.error("Add a custom niche first.");
      return;
    }
    setCustomNiche("");
    void loadNicheOptions([...nichePath, value]);
  }

  async function generateTopics() {
    if (nichePath.length === 0 && !ideaContext.trim() && !customNiche.trim()) {
      toast.error("Select or enter a niche first.");
      return;
    }
    setBusy("topics");
    try {
      const ideas = await api.ai.topicIdeas({
        path: nichePath,
        audience,
        context: ideaContext || topic || null,
        customSeed: customNiche || null,
      });
      setTopicIdeas(ideas);
      toast.success("Topic ideas generated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function useTopicIdea(idea: TopicIdeas["topics"][number]) {
    setTopic(`${idea.title}\n\nAngle: ${idea.angle}\nAudience: ${idea.audience}`);
    setAudience(idea.audience);
    if (idea.format === "IMAGE" || idea.format === "DOCUMENT") {
      setAssetPrompt(`${idea.format === "IMAGE" ? "Create a visual framework for" : "Create a short checklist PDF for"}: ${idea.title}. Angle: ${idea.angle}`);
    }
    toast.success("Topic added to draft brief");
  }

  async function generateDraft() {
    if (!accountId || !topic.trim()) {
      toast.error("Choose an account and enter a topic first.");
      return;
    }
    setBusy("generate");
    try {
      const draft = await api.posts.generate({
        accountId,
        topic,
        tone,
        audience,
        callToAction: callToAction || null,
      });
      setTitle(draft.title);
      setBody(draft.body);
      setCallToAction(draft.callToAction ?? "");
      setMediaSuggestions(draft.mediaSuggestions ?? []);
      toast.success("Draft generated");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function refineDraft() {
    if (!title.trim() || !body.trim() || !refineInstruction.trim()) {
      toast.error("Add a post draft and a refinement instruction first.");
      return;
    }
    setBusy("refine");
    try {
      const draft = await api.ai.refinePost({
        title,
        body,
        instruction: refineInstruction,
        angle: refineAngle || null,
        tone,
        audience,
        context: topic || null,
      });
      setTitle(draft.title);
      setBody(draft.body);
      setCallToAction(draft.callToAction ?? "");
      setMediaSuggestions(draft.mediaSuggestions ?? []);
      toast.success("Draft refined");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function generateAsset(type: "IMAGE" | "DOCUMENT") {
    if (!title.trim() || !body.trim()) {
      toast.error("Generate or write the post first.");
      return;
    }
    setBusy(type === "IMAGE" ? "image" : "document");
    try {
      const asset =
        type === "IMAGE"
          ? await api.ai.generatePostImage({
              title,
              body,
              prompt: assetPrompt || null,
              audience,
            })
          : await api.ai.generatePostDocument({
              title,
              body,
              prompt: assetPrompt || null,
              audience,
            });
      setMedia((prev) => [
        ...prev,
        {
          type: asset.type,
          url: asset.url,
          title: asset.title,
          description: asset.description,
        },
      ]);
      toast.success(`${asset.type === "IMAGE" ? "Image" : "Document"} generated and attached`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function savePost(event: FormEvent) {
    event.preventDefault();
    if (!accountId) {
      toast.error("Add or select a LinkedIn account first.");
      return;
    }
    const cleanMedia = media
      .filter((item) => item.url.trim())
      .map((item) => ({
        type: item.type,
        url: item.url.trim(),
        title: item.title.trim() || null,
        description: item.description.trim() || null,
      }));
    const payload = {
      title,
      body,
      prompt: topic || null,
      tone,
      audience,
      callToAction: callToAction || null,
      scheduledFor: toIso(scheduledFor),
      media: cleanMedia,
    };
    setBusy("save");
    try {
      const saved = editingId
        ? await api.posts.update(editingId, payload)
        : await api.posts.create({ accountId, ...payload });
      setPosts((prev) => {
        const existing = prev.some((post) => post.id === saved.id);
        return existing
          ? prev.map((post) => (post.id === saved.id ? saved : post))
          : [saved, ...prev];
      });
      toast.success(editingId ? "Post updated" : "Post saved");
      resetForm();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function markPublished(post: LinkedInPost) {
    setBusy(post.id);
    try {
      const updated = await api.posts.publish(post.id);
      setPosts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast.success("Post published to LinkedIn");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deletePost(post: LinkedInPost) {
    setBusy(post.id);
    try {
      await api.posts.delete(post.id);
      setPosts((prev) => prev.filter((item) => item.id !== post.id));
      if (editingId === post.id) resetForm();
      toast.success("Post deleted");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-80 w-full rounded-2xl" />
        <div className="table-shell">
          <table className="min-w-full">
            <tbody className="divide-y divide-white/[0.06]">
              <SkeletonTableRows cols={5} rows={5} />
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (error) return <p className="text-sm text-red-400">{error}</p>;

  return (
    <div className="space-y-8">
      <section className="app-panel overflow-hidden">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_auto] lg:items-end lg:p-8">
          <div>
            <p className="page-kicker">Content studio</p>
            <h1 className="page-title mt-2">Posts</h1>
            <p className="page-copy">
              Draft AI-assisted LinkedIn content, attach media references, and schedule reviewed posts for the selected account.
            </p>
          </div>
          <button onClick={resetForm} className="btn-secondary">
            New Draft
          </button>
        </div>
        <div className="grid border-t border-white/[0.06] bg-slate-950/40 sm:grid-cols-4">
          {[
            ["Drafts", counts.DRAFT ?? 0],
            ["Scheduled", counts.SCHEDULED ?? 0],
            ["Published", counts.PUBLISHED ?? 0],
            ["Failed", counts.FAILED ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="border-white/[0.06] p-5 sm:border-r last:border-r-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                {label}
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <form onSubmit={savePost} className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="app-panel p-5 lg:col-span-2">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-300">
                AI idea cascade
              </p>
              <h2 className="mt-2 text-lg font-semibold text-white">Find a niche before writing</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Start broad, pick the most useful branch, then keep narrowing until the idea feels specific enough to publish.
              </p>
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-slate-300">
                  Content lane
                  <input
                    className="field mt-1 w-full"
                    value={ideaContext}
                    onChange={(e) => setIdeaContext(e.target.value)}
                    placeholder="AI sales workflows, founder lessons, compliance-led outreach..."
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => loadNicheOptions([])}
                    disabled={busy === "niche"}
                    className="btn-accent"
                  >
                    {busy === "niche" && nichePath.length === 0 ? "Thinking..." : "Generate Options"}
                  </button>
                  <button
                    type="button"
                    onClick={stepBackNiche}
                    disabled={busy === "niche" || nichePath.length === 0}
                    className="btn-secondary"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={resetNiche}
                    disabled={busy === "niche" || (nichePath.length === 0 && !nicheOptions)}
                    className="btn-secondary"
                  >
                    Reset
                  </button>
                </div>
                {nichePath.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {nichePath.map((item, index) => (
                      <span
                        key={`${item}-${index}`}
                        className="rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-semibold text-teal-200"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    className="field w-full"
                    value={customNiche}
                    onChange={(e) => setCustomNiche(e.target.value)}
                    placeholder={nicheOptions?.customPromptHint ?? "Or enter your own niche, audience, pain point, or angle"}
                  />
                  <button type="button" onClick={addCustomNiche} disabled={busy === "niche"} className="btn-secondary">
                    Use Custom
                  </button>
                </div>
                <button
                  type="button"
                  onClick={generateTopics}
                  disabled={busy === "topics" || (nichePath.length === 0 && !ideaContext.trim() && !customNiche.trim())}
                  className="btn-primary w-full"
                >
                  {busy === "topics" ? "Generating Topics..." : nicheOptions?.readyForTopics ? "Generate Topics" : "Generate Topics From Here"}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {(nicheOptions?.options ?? []).map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => selectNiche(option.label)}
                    disabled={busy === "niche"}
                    className="rounded-xl border border-white/[0.08] bg-slate-950/40 p-4 text-left transition hover:border-teal-400/50 hover:bg-teal-400/10"
                  >
                    <span className="block text-sm font-semibold text-white">{option.label}</span>
                    <span className="mt-2 block text-xs leading-5 text-slate-400">{option.rationale}</span>
                  </button>
                ))}
                {!nicheOptions && (
                  <div className="rounded-xl border border-dashed border-white/[0.12] bg-slate-950/30 p-5 text-sm leading-6 text-slate-400 sm:col-span-2">
                    Generate options to let AI suggest the first branches, or type a custom starting niche and keep narrowing from there.
                  </div>
                )}
              </div>

              {topicIdeas && (
                <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">Topics for {topicIdeas.niche}</p>
                    <span className="text-xs font-semibold text-teal-200">{topicIdeas.topics.length} ideas</span>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {topicIdeas.topics.map((idea) => (
                      <button
                        key={`${idea.title}-${idea.format}`}
                        type="button"
                        onClick={() => useTopicIdea(idea)}
                        className="rounded-lg border border-white/[0.08] bg-slate-950/50 p-3 text-left hover:border-teal-400/40"
                      >
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-teal-200">
                          {idea.format}
                        </span>
                        <span className="mt-2 block text-sm font-semibold text-white">{idea.title}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-400">{idea.angle}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="app-panel p-5">
          <h2 className="text-lg font-semibold text-white">AI draft brief</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-slate-300">
              Account
              <select className="field mt-1 w-full" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-300">
              Topic
              <textarea
                className="field mt-1 min-h-24 w-full"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Product launch, hiring insight, customer story..."
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-300">
                Tone
                <select className="field mt-1 w-full" value={tone} onChange={(e) => setTone(e.target.value)}>
                  <option value="professional">Professional</option>
                  <option value="casual">Casual</option>
                  <option value="founder-led">Founder-led</option>
                  <option value="educational">Educational</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-300">
                Audience
                <input className="field mt-1 w-full" value={audience} onChange={(e) => setAudience(e.target.value)} />
              </label>
            </div>
            <label className="block text-sm font-medium text-slate-300">
              Call to action
              <input
                className="field mt-1 w-full"
                value={callToAction}
                onChange={(e) => setCallToAction(e.target.value)}
                placeholder="Ask a question, invite DMs, link in comments..."
              />
            </label>
            <button type="button" onClick={generateDraft} disabled={busy === "generate"} className="btn-accent w-full">
              {busy === "generate" ? "Generating..." : "Generate Draft"}
            </button>
            <div className="rounded-xl border border-white/[0.08] bg-slate-950/40 p-3">
              <p className="text-sm font-semibold text-white">Refine draft</p>
              <div className="mt-3 grid gap-3">
                <select
                  className="field w-full"
                  value={refineAngle}
                  onChange={(e) => setRefineAngle(e.target.value)}
                >
                  <option value="make it more practical">More practical</option>
                  <option value="make it founder-led">Founder-led</option>
                  <option value="make it contrarian">Contrarian</option>
                  <option value="make it educational">Educational</option>
                  <option value="make it concise">Concise</option>
                  <option value="make it story-driven">Story-driven</option>
                </select>
                <textarea
                  className="field min-h-20 w-full"
                  value={refineInstruction}
                  onChange={(e) => setRefineInstruction(e.target.value)}
                  placeholder="Add context, switch angle, sharpen hook, remove hype, target a different audience..."
                />
                <button type="button" onClick={refineDraft} disabled={busy === "refine"} className="btn-secondary w-full">
                  {busy === "refine" ? "Refining..." : "Refine Draft"}
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-slate-950/40 p-3">
              <p className="text-sm font-semibold text-white">Generate media</p>
              <textarea
                className="field mt-3 min-h-20 w-full"
                value={assetPrompt}
                onChange={(e) => setAssetPrompt(e.target.value)}
                placeholder="Optional visual direction: checklist PDF, clean framework image, bold announcement graphic..."
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => generateAsset("IMAGE")}
                  disabled={busy === "image"}
                  className="btn-secondary w-full"
                >
                  {busy === "image" ? "Generating..." : "Generate Image"}
                </button>
                <button
                  type="button"
                  onClick={() => generateAsset("DOCUMENT")}
                  disabled={busy === "document"}
                  className="btn-secondary w-full"
                >
                  {busy === "document" ? "Generating..." : "Generate PDF"}
                </button>
              </div>
            </div>
            {mediaSuggestions.length > 0 && (
              <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-300">
                  Media angles
                </p>
                <div className="mt-3 space-y-3">
                  {mediaSuggestions.map((item) => (
                    <button
                      key={`${item.type}-${item.title}`}
                      type="button"
                      className="w-full rounded-lg border border-white/[0.08] bg-slate-950/50 p-3 text-left hover:border-teal-400/40"
                      onClick={() =>
                        setMedia((prev) => [
                          ...prev,
                          {
                            type: item.type,
                            url: "",
                            title: item.title,
                            description: item.description,
                          },
                        ])
                      }
                    >
                      <span className="text-xs font-semibold text-teal-300">{item.type}</span>
                      <span className="mt-1 block text-sm font-semibold text-white">{item.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-400">{item.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="app-panel p-5">
          <h2 className="text-lg font-semibold text-white">Post composer</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-slate-300">
              Title
              <input required className="field mt-1 w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block text-sm font-medium text-slate-300">
              Body
              <textarea
                required
                className="field mt-1 min-h-56 w-full whitespace-pre-wrap"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-slate-300">
              Schedule
              <input
                type="datetime-local"
                className="field mt-1 w-full"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
              />
            </label>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">Media</h3>
                <button type="button" className="btn-secondary px-3 py-1.5" onClick={() => setMedia((prev) => [...prev, { ...emptyMedia }])}>
                  Add Media
                </button>
              </div>
              {media.map((item, index) => (
                <div key={index} className="grid gap-3 rounded-xl border border-white/[0.08] bg-slate-950/40 p-3 sm:grid-cols-[120px_1fr_auto]">
                  <select
                    className="field"
                    value={item.type}
                    onChange={(e) =>
                      setMedia((prev) => prev.map((m, i) => (i === index ? { ...m, type: e.target.value as PostMediaType } : m)))
                    }
                  >
                    <option value="IMAGE">Image</option>
                    <option value="VIDEO">Video</option>
                    <option value="DOCUMENT">Document</option>
                    <option value="ARTICLE">Article</option>
                  </select>
                  <input
                    className="field"
                    value={item.url}
                    onChange={(e) =>
                      setMedia((prev) => prev.map((m, i) => (i === index ? { ...m, url: e.target.value } : m)))
                    }
                    placeholder="https://..."
                  />
                  <button type="button" className="btn-danger px-3 py-2" onClick={() => setMedia((prev) => prev.filter((_, i) => i !== index))}>
                    Remove
                  </button>
                  <input
                    className="field sm:col-start-2"
                    value={item.title}
                    onChange={(e) =>
                      setMedia((prev) => prev.map((m, i) => (i === index ? { ...m, title: e.target.value } : m)))
                    }
                    placeholder="Optional media title"
                  />
                  <input
                    className="field sm:col-start-2"
                    value={item.description}
                    onChange={(e) =>
                      setMedia((prev) => prev.map((m, i) => (i === index ? { ...m, description: e.target.value } : m)))
                    }
                    placeholder="Optional media description"
                  />
                </div>
              ))}
            </div>
            <button type="submit" disabled={busy === "save"} className="btn-primary w-full">
              {editingId ? "Update Post" : scheduledFor ? "Save Scheduled Post" : "Save Draft"}
            </button>
          </div>
        </section>

        <LinkedInPostPreview account={selectedAccount} title={title} body={body} media={media} />
      </form>

      <div className="table-shell">
        <table className="min-w-full divide-y divide-white/[0.06]">
          <thead className="table-head">
            <tr>
              {["Title", "Account", "Status", "Schedule", "Media", "Actions"].map((h) => (
                <th key={h} className="px-6 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {posts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-14 text-center text-sm text-slate-400">
                  No posts yet. Generate a draft above to start the content workflow.
                </td>
              </tr>
            )}
            {posts.map((post) => (
              <tr key={post.id} className="hover:bg-white/[0.03]">
                <td className="table-cell max-w-md">
                  <p className="font-semibold text-white">{post.title}</p>
                  <p className="mt-1 line-clamp-2 text-slate-500">{post.body}</p>
                </td>
                <td className="table-cell text-slate-400">{post.account?.email ?? "Account"}</td>
                <td className="table-cell"><Badge value={post.status} /></td>
                <td className="table-cell text-slate-400">
                  {post.scheduledFor ? new Date(post.scheduledFor).toLocaleString() : "-"}
                </td>
                <td className="table-cell text-slate-400">{post.media.length}</td>
                <td className="table-cell">
                  <div className="flex flex-nowrap items-center gap-1.5">
                    <button onClick={() => editPost(post)} className="btn-secondary whitespace-nowrap px-2.5 py-1 text-xs">Edit</button>
                    <button onClick={() => markPublished(post)} disabled={busy === post.id || post.status === "PUBLISHED"} className="btn-secondary whitespace-nowrap px-2.5 py-1 text-xs">
                      Publish
                    </button>
                    <button onClick={() => deletePost(post)} disabled={busy === post.id} className="btn-danger whitespace-nowrap px-2.5 py-1 text-xs">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
