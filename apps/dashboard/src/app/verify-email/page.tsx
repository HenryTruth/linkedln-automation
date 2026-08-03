"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth";
import { api, setAuthToken } from "@/lib/api";

type VerifyState = "checking" | "verified" | "error";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuth();
  const [state, setState] = useState<VerifyState>("checking");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setState("error");
      setMessage("This verification link is missing a token.");
      return;
    }

    api.auth
      .verifyEmail({ token })
      .then(({ user, token: sessionToken }) => {
        setAuthToken(sessionToken);
        setUser(user);
        setState("verified");
        setMessage("Your email is verified. Taking you to your dashboard...");
        window.setTimeout(() => router.replace("/dashboard"), 900);
      })
      .catch((err: Error) => {
        setState("error");
        setMessage(err.message.replace(/^API \d+: /, ""));
      });
  }, [router, searchParams, setUser]);

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="app-panel w-full max-w-md p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-blue-600 text-sm font-black text-white shadow-sm">
          V
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">
          {state === "verified" ? "Email verified" : state === "error" ? "Verification failed" : "Verifying email"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{message}</p>
        {state === "error" && (
          <div className="mt-5 flex justify-center gap-2">
            <Link href="/login" className="btn-secondary">
              Back to sign in
            </Link>
            <Link href="/signup" className="btn-primary">
              Create account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[80vh] items-center justify-center">
          <div className="app-panel w-full max-w-md p-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">Verifying email</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">Checking your verification link...</p>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
