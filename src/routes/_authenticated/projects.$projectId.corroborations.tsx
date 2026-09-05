import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AccountBar } from "@/components/AccountBar";
import { Disclaimer } from "@/components/Disclaimer";
import { CorroborationBoard } from "@/components/CorroborationBoard";

export const Route = createFileRoute("/_authenticated/projects/$projectId/corroborations")({
  head: () => ({
    meta: [
      { title: "Corroborated scope gaps — ScopeGuard" },
      {
        name: "description",
        content:
          "Scope gaps corroborated across drawings in this ScopeGuard project, grouped by topic and by named party.",
      },
      { property: "og:title", content: "Corroborated scope gaps — ScopeGuard" },
      {
        property: "og:description",
        content: "The same scope left open on more than one drawing, grouped by topic and by party.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CorroborationsPage,
});

function CorroborationsPage() {
  const { projectId } = Route.useParams();

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, client, project_reference")
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <AccountBar>
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          className="text-muted-foreground hover:text-foreground"
        >
          Back to drawings
        </Link>
      </AccountBar>

      <header className="space-y-1">
        <h1 className="font-display text-3xl">Corroborated scope gaps</h1>
        <p className="text-sm text-muted-foreground">
          {project.data?.name ?? "This project"} — the same scope left open on more than one
          drawing, and elements left to nobody at all.
        </p>
      </header>

      <CorroborationBoard projectId={projectId} />

      <Disclaimer />
    </main>
  );
}
