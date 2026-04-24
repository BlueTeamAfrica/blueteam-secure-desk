"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getFirebaseAuth, signInWithEmailAndPassword } from "@/app/_lib/firebase/auth";
import { useAuth } from "@/app/_components/auth/AuthContext";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    state: { status },
  } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const next = searchParams.get("next") || "/dashboard";

  useEffect(() => {
    if (status === "signedInWorkspace" || status === "signedInNoRole") {
      router.replace(next);
    }
  }, [next, router, status]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const auth = getFirebaseAuth();
      await signInWithEmailAndPassword(auth, email, password);
      router.replace(next);
    } catch {
      setError("Login failed. Check your email and password.");
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <div className="auth-card">
        <h1 className="heading-xl">Admin login</h1>
        <p className="subtext">
          Sign in with your admin email and password to access the dashboard.
        </p>

        <form onSubmit={handleSubmit}>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            required
          />

          <label className="label" htmlFor="password" style={{ marginTop: 12 }}>
            Password
          </label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            required
          />

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={submitting}
            style={{ marginTop: 16 }}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>

          {error ? (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          ) : null}
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-layout">
          <div className="auth-card">
            <p className="subtext">Loading…</p>
          </div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
