"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setAuthToken } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import { toast } from "sonner";

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);

    if (!email.trim()) { setError("Email is required."); return; }
    if (!password) { setError("Password is required."); return; }

    setLoading(true);
    try {
      const { user, token } = await api.auth.login({ email: email.trim(), password });
      setAuthToken(token);
      setUser(user);
      const params = new URLSearchParams(window.location.search);
      router.replace(safeNextPath(params.get("next")));
    } catch (err) {
      const raw = (err as Error).message.replace(/^API \d+: /, "");
      if (/verify your email/i.test(raw)) {
        setNeedsVerification(true);
        setError("Please verify your email before signing in.");
      } else {
        setError(raw.includes("401") || raw.includes("Invalid") ? "Invalid email or password." : raw);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email.trim()) { setError("Enter your email first."); return; }
    setResending(true);
    try {
      await api.auth.resendVerification({ email: email.trim() });
      toast.success("Verification email sent.");
    } catch (err) {
      toast.error((err as Error).message.replace(/^API \d+: /, ""));
    } finally {
      setResending(false);
    }
  }

  function handleGooglePlaceholder() {
    toast.info("Google sign-in is coming soon. Use email and password for now.");
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-blue-600 text-sm font-black text-white shadow-sm">
              V
            </span>
            <span className="text-left">
              <span className="block text-sm font-semibold tracking-tight text-white">Vectra</span>
              <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-teal-400">Beta workspace</span>
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-white">Sign in</h1>
          <p className="mt-1 text-sm text-slate-400">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-semibold text-teal-400 hover:text-teal-300">
              Join beta free
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="app-panel p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
              {needsVerification && (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="mt-3 block font-semibold text-red-200 underline underline-offset-4"
                >
                  {resending ? "Sending..." : "Resend verification email"}
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleGooglePlaceholder}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-xs font-bold text-slate-950">
              G
            </span>
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/[0.08]" />
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">or</span>
            <div className="h-px flex-1 bg-white/[0.08]" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field w-full"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-300">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field w-full"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
