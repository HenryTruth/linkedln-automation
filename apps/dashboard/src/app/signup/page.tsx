"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setAuthToken } from "@/lib/api";
import { useAuth } from "@/contexts/auth";

export default function SignupPage() {
  const router = useRouter();
  const { setUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) { setError("Email is required."); return; }
    if (!password) { setError("Password is required."); return; }

    setLoading(true);
    try {
      const { user, token } = await api.auth.signup({ email: email.trim(), password });
      setAuthToken(token);
      setUser(user);
      router.replace("/dashboard");
    } catch (err) {
      const raw = (err as Error).message.replace(/^API \d+: /, "");
      setError(
        raw.includes("already") ? "That email is already registered. Sign in instead." : raw
      );
    } finally {
      setLoading(false);
    }
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
              <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-teal-400">Outreach control</span>
            </span>
          </Link>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-white">Create your account</h1>
          <p className="mt-1 text-sm text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-teal-400 hover:text-teal-300">
              Sign in
            </Link>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="app-panel p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 px-4 py-3 text-sm text-teal-400">
            <span className="font-semibold">Free Forever</span> — full access to all features, no credit card required.
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
