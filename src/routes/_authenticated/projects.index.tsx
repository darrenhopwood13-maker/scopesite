import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AccountBar } from "@/components/AccountBar";
import { Disclaimer } from "@/components/Disclaimer";

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — ScopeGuard" },
      {
        name: "description",
        content:
          "Your ScopeGuard projects. Create a project, upload drawings and review deferred scope and holds.",
      },
      { property: "og:title", content: "Projects — ScopeGuard" },
      { property: "og:description", content: "Create a project and upload construction drawings for scope analysis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [reference, setReference] = useState("");

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, client, project_reference, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const owner = auth.user?.id;
      if (!owner) throw new Error("Not signed in");
      const { error } = await supabase.from("projects").insert({
        owner_id: owner,
        name,
        client: client || null,
        project_reference: reference || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      setClient("");
      setReference("");
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-10">
      <AccountBar />

      <section className="space-y-4">
        <h1 className="font-display text-3xl">Projects</h1>
        <form
          className="grid gap-3 sm:grid-cols-4 rounded-lg border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            className="rounded-md border border-border bg-background px-3 py-2"
          />
          <input
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="Client"
            className="rounded-md border border-border bg-background px-3 py-2"
          />
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Project reference"
            className="rounded-md border border-border bg-background px-3 py-2"
          />
          <button
            type="submit"
            disabled={create.isPending}
            className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
          >
            {create.isPending ? "Creating…" : "Create project"}
          </button>
        </form>
        {create.error ? (
          <p className="text-sm text-destructive">{(create.error as Error).message}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        {projects.isLoading ? <p className="text-muted-foreground">Loading…</p> : null}
        {projects.data?.length === 0 ? (
          <p className="text-muted-foreground">No projects yet.</p>
        ) : null}
        {projects.data?.map((p) => (
          <Link
            key={p.id}
            to="/projects/$projectId"
            params={{ projectId: p.id }}
            className="block rounded-lg border border-border bg-card p-4 hover:border-primary"
          >
            <div className="font-display text-lg">{p.name}</div>
            <div className="text-sm text-muted-foreground">
              {[p.client, p.project_reference].filter(Boolean).join(" · ") || "No client recorded"}
            </div>
          </Link>
        ))}
      </section>

      <Disclaimer />
    </main>
  );
}
