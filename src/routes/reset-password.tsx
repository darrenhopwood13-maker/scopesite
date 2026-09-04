import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/Wordmark";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — ScopeGuard" },
      {
        name: "description",
        content: "Choose a new password for your ScopeGuard account and return to your drawings.",
      },
      { property: "og:title", content: "Set a new password — ScopeGuard" },
      { property: "og:description", content: "Choose a new ScopeGuard password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(err.message);
    else navigate({ to: "/projects" });
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-8">
        <Wordmark />
        <h1 className="font-display text-3xl">Set a new password</h1>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm text-muted-foreground" htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-card px-3 py-2"
            placeholder="••••••••"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save password"}
          </button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>
      </div>
    </main>
  );
}
