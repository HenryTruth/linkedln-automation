"use client";

import { useEffect, useState } from "react";
import { api, type AppSettings } from "@/lib/api";
import { Skeleton, SkeletonPageHeader } from "@/components/Skeleton";

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Webhook
  const [webhookDraft, setWebhookDraft] = useState("");
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Email (Resend)
  const [resendKeyDraft, setResendKeyDraft] = useState("");
  const [emailToDraft, setEmailToDraft] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Test alert
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api.settings
      .get()
      .then((s) => {
        setSettings(s);
        setWebhookDraft(s.alert_webhook_url ?? "");
        setResendKeyDraft(s.resend_api_key ?? "");
        setEmailToDraft(s.alert_email_to ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleWebhookSave(e: React.FormEvent) {
    e.preventDefault();
    setWebhookSaving(true);
    setWebhookMsg(null);
    try {
      await api.settings.update({ alert_webhook_url: webhookDraft.trim() || null });
      setWebhookMsg({ ok: true, text: "Saved." });
      setSettings((prev) =>
        prev ? { ...prev, alert_webhook_url: webhookDraft.trim() || null } : prev
      );
    } catch (err) {
      setWebhookMsg({ ok: false, text: (err as Error).message });
    } finally {
      setWebhookSaving(false);
    }
  }

  async function handleEmailSave(e: React.FormEvent) {
    e.preventDefault();
    setEmailSaving(true);
    setEmailMsg(null);
    try {
      await api.settings.update({
        resend_api_key: resendKeyDraft.trim() || null,
        alert_email_to: emailToDraft.trim() || null,
      });
      setEmailMsg({ ok: true, text: "Saved." });
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              resend_api_key: resendKeyDraft.trim() || null,
              alert_email_to: emailToDraft.trim() || null,
            }
          : prev
      );
    } catch (err) {
      setEmailMsg({ ok: false, text: (err as Error).message });
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleTestAlert() {
    setTesting(true);
    setTestMsg(null);
    try {
      await api.settings.testAlert();
      const via = settings?.alert_webhook_url
        ? "webhook"
        : settings?.resend_api_key && settings?.alert_email_to
        ? `email (${settings.alert_email_to})`
        : "console only";
      setTestMsg({ ok: true, text: `Test alert sent via ${via}.` });
    } catch (err) {
      setTestMsg({ ok: false, text: (err as Error).message });
    } finally {
      setTesting(false);
    }
  }

  if (loading)
    return (
      <div className="max-w-2xl space-y-6">
        <SkeletonPageHeader />
        {Array.from({ length: 2 }).map((_, i) => (
          <section key={i} className="app-panel p-6 space-y-5">
            <div className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-full max-w-sm" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
          </section>
        ))}
      </div>
    );

  const hasWebhook = !!(settings?.alert_webhook_url);
  const hasEmail = !!(settings?.resend_api_key && settings?.alert_email_to);
  const hasAnyAlert = hasWebhook || hasEmail;

  return (
    <div className="space-y-6 max-w-2xl">
      <section className="app-panel p-6 lg:p-8">
        <p className="page-kicker">Configuration</p>
        <h1 className="page-title mt-2">Settings</h1>
        <p className="page-copy">
          Runtime configuration for alerts and notifications. Changes take
          effect immediately — no server restart required.
        </p>
      </section>

      {/* Alert webhook */}
      <section className="app-panel p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-white">Alert webhook</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            A POST request with{" "}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-xs font-mono">
              {"{ text: \"...\" }"}
            </code>{" "}
            is sent when a checkpoint is detected, an account is paused for anomalous behaviour, or
            proxy health degrades. Compatible with Slack, Discord, and any generic webhook receiver.
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-slate-800/40 p-4 text-sm">
          <p className="font-semibold text-slate-200">Status</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                hasWebhook ? "bg-emerald-400" : "bg-slate-300"
              }`}
            />
            <span className="text-slate-300">
              {hasWebhook ? "Webhook configured" : "No webhook set"}
            </span>
          </div>
          {hasWebhook && (
            <p className="mt-1.5 font-mono text-xs text-slate-400 break-all">
              {settings!.alert_webhook_url}
            </p>
          )}
        </div>

        <form onSubmit={handleWebhookSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">Webhook URL</label>
            <input
              type="url"
              value={webhookDraft}
              onChange={(e) => setWebhookDraft(e.target.value)}
              placeholder="https://hooks.slack.com/services/... or https://discord.com/api/webhooks/..."
              className="field w-full"
            />
            <p className="mt-1 text-xs text-slate-400">Leave blank to disable webhook delivery.</p>
          </div>

          {webhookMsg && (
            <div
              className={`rounded-xl border p-3 text-sm ${
                webhookMsg.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              }`}
            >
              {webhookMsg.text}
            </div>
          )}

          <button type="submit" disabled={webhookSaving} className="btn-primary">
            {webhookSaving ? "Saving..." : "Save webhook"}
          </button>
        </form>
      </section>

      {/* Email alerts via Resend */}
      <section className="app-panel p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-white">Email alerts (Resend)</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Fallback alert delivery via email when no webhook is configured. Powered by{" "}
            <a
              href="https://resend.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-teal-400 hover:text-teal-300"
            >
              Resend
            </a>{" "}
            — free tier supports 3,000 emails/month.
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-slate-800/40 p-4 text-sm">
          <p className="font-semibold text-slate-200">Status</p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                hasEmail ? "bg-emerald-400" : "bg-slate-300"
              }`}
            />
            <span className="text-slate-300">
              {hasEmail
                ? `Email alerts active → ${settings!.alert_email_to}`
                : "Email alerts not configured"}
            </span>
          </div>
          {hasWebhook && hasEmail && (
            <p className="mt-2 text-xs text-amber-400">
              Webhook takes priority — email is only used when the webhook is removed.
            </p>
          )}
        </div>

        <form onSubmit={handleEmailSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">
              Resend API key
            </label>
            <input
              type="password"
              value={resendKeyDraft}
              onChange={(e) => setResendKeyDraft(e.target.value)}
              placeholder="re_..."
              className="field w-full"
              autoComplete="new-password"
            />
            <p className="mt-1 text-xs text-slate-400">
              Get your API key from{" "}
              <a
                href="https://resend.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                resend.com/api-keys
              </a>
              .
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">
              Alert recipient email
            </label>
            <input
              type="email"
              value={emailToDraft}
              onChange={(e) => setEmailToDraft(e.target.value)}
              placeholder="you@example.com"
              className="field w-full"
            />
          </div>

          {emailMsg && (
            <div
              className={`rounded-xl border p-3 text-sm ${
                emailMsg.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/30 bg-red-500/10 text-red-400"
              }`}
            >
              {emailMsg.text}
            </div>
          )}

          <button type="submit" disabled={emailSaving} className="btn-primary">
            {emailSaving ? "Saving..." : "Save email settings"}
          </button>
        </form>
      </section>

      {/* Test alert */}
      <section className="app-panel p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-white">Send test alert</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Fire a test notification to verify your alert delivery. Uses webhook if configured,
            otherwise falls back to email.
          </p>
        </div>

        <button
          type="button"
          onClick={handleTestAlert}
          disabled={testing || !hasAnyAlert}
          title={!hasAnyAlert ? "Configure a webhook or email alerts first" : "Send a test alert"}
          className="btn-secondary disabled:opacity-40"
        >
          {testing ? "Sending..." : "Send test alert"}
        </button>

        {testMsg && (
          <div
            className={`rounded-xl border p-3 text-sm ${
              testMsg.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}
          >
            {testMsg.text}
          </div>
        )}
      </section>

      {/* Anomaly detection info */}
      <section className="app-panel p-6 space-y-3">
        <h2 className="text-base font-semibold text-white">Anomaly detection</h2>
        <p className="text-sm leading-6 text-slate-500">
          A background job runs every hour and scans all active accounts for unusual behaviour. If
          triggered, the account is automatically paused and an alert is sent.
        </p>
        <ul className="space-y-1.5 text-sm text-slate-300">
          {[
            "More than 5 actions in any 10-minute window",
            "Session error rate above 20% across the last 10 actions",
          ].map((rule) => (
            <li key={rule} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400" />
              {rule}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
