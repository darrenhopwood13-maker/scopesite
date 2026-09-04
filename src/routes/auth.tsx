import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/Wordmark";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — ScopeGuard drawing scope analysis" },
      {
        name: "description",
        content:
          "Sign in to ScopeGuard to upload UK construction drawings and review deferred scope, holds and unallocated work.",
      },
      { property: "og:title", content: "Sign in — ScopeGuard" },
      {
        property: "og:description",
        content: "Sign in to review deferred scope and holds on your construction drawings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "reset";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/projects" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate({ to: "/projects" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === "signin") {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
    } else if (mode === "signup") {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/projects` },
      });
      if (err) setError(err.message);
      else if (!data.session)
        setNotice(`Account created. Check ${email} and click the confirmation link to finish.`);
    } else {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) setError(err.message);
      else setNotice(`Password reset link sent to ${email}.`);
    }
    setBusy(false);
  };

  const magicLink = async () => {
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/projects` },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setNotice(`Sign-in link sent to ${email}.`);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-8">
        <Wordmark />
        <h1 className="font-display text-3xl">
          {mode === "signup" ? "Create account" : mode === "reset" ? "Reset password" : "Sign in"}
        </h1>

        <form onSubmit={submit} className="space-y-4" autoComplete="on">
          <div className="space-y-1">
            <label className="block text-sm text-muted-foreground" htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2"
              placeholder="you@company.co.uk"
            />
          </div>

          {mode !== "reset" ? (
            <div className="space-y-1">
              <label className="block text-sm text-muted-foreground" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-card px-3 py-2"
                placeholder="••••••••"
              />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy
              ? "Working…"
              : mode === "signup"
                ? "Create account"
                : mode === "reset"
                  ? "Send reset link"
                  : "Sign in"}
          </button>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
        </form>

        <div className="flex flex-wrap gap-4 text-sm">
          {mode !== "signin" ? (
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                setMode("signin");
                setError(null);
                setNotice(null);
              }}
            >
              Back to sign in
            </button>
          ) : (
            <>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                  setNotice(null);
                }}
              >
                Create account
              </button>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setMode("reset");
                  setError(null);
                  setNotice(null);
                }}
              >
                Forgot password?
              </button>
            </>
          )}
        </div>

        <div className="border-t border-border pt-6">
          <button
            type="button"
            onClick={magicLink}
            disabled={busy}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
          >
            Or email me a sign-in link instead
          </button>
        </div>
      </div>
    </main>
  );
}
