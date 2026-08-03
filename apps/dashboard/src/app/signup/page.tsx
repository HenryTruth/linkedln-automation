"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) { setError("Email is required."); return; }
    if (!password) { setError("Password is required."); return; }

    setLoading(true);
    try {
      await api.auth.signup({ email: email.trim(), password });
      setSuccessEmail(email.trim());
      setPassword("");
    } catch (err) {
      const raw = (err as Error).message.replace(/^API \d+: /, "");
      setError(
        raw.includes("already") ? "That email is already registered. Sign in instead." : raw
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!successEmail) return;
    setResending(true);
    try {
      await api.auth.resendVerification({ email: successEmail });
      toast.success("Verification email sent.");
    } catch (err) {
      toast.error((err as Error).message.replace(/^API \d+: /, ""));
    } finally {
      setResending(false);
    }
  }

  function handleGooglePlaceholder() {
    toast.info("Google sign-in is coming soon. Sign up with email and password for now.");
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
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-white">Join the beta</h1>
          <p className="mt-1 text-sm text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-teal-400 hover:text-teal-300">
              Sign in
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="app-panel p-6 space-y-4">
          {successEmail && (
            <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-4 text-sm text-teal-200">
              <p className="font-semibold text-white">Check your inbox</p>
              <p className="mt-1 text-slate-300">
                We sent a verification link to {successEmail}. Verify your email, then you can sign in.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  {resending ? "Sending..." : "Resend email"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  Go to sign in
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 px-4 py-3 text-sm text-teal-400">
            <span className="font-semibold">Beta access</span> — every new user is a beta tester with full access for now, no credit card required.
          </div>

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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field w-full"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
