import { createFileRoute, Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/Wordmark";
import { Disclaimer } from "@/components/Disclaimer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ScopeGuard — find the scope that falls between packages" },
      {
        name: "description",
        content:
          "Upload a construction drawing. ScopeGuard returns every deferral, contested interface and coverage gap, quoted verbatim and cited to the sheet.",
      },
      { property: "og:title", content: "ScopeGuard — find the scope that falls between packages" },
      {
        property: "og:description",
        content:
          "Deferrals, trade allocation and contested interfaces, read straight off the drawing and exportable to Excel.",
      },
    ],
  }),
  component: Index,
});

const CAPABILITIES = [
  {
    title: "Deferrals",
    body: "Every place the drawing hands responsibility to someone else — by others, by specialist, indicative only, in abeyance.",
  },
  {
    title: "Trade allocation",
    body: "Each annotated item allocated to a trade package, from the project's own system codes and a validated cue base.",
  },
  {
    title: "Contested interfaces",
    body: "Items two or more packages could legitimately own. Contested is a correct answer, never collapsed to look confident.",
  },
  {
    title: "Cross-document corroboration",
    body: "Where two consultants defer the same interface, no package owns it. That is the finding worth the fee.",
  },
];

function Index() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Wordmark />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Scope gap analysis
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="max-w-3xl font-display text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
          Scope falls between packages. It is printed on the drawings, unread.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
          ScopeGuard reads UK construction drawings and returns an evidence-cited register:
          deferrals, trade allocation, contested interfaces and coverage gaps. Every finding quotes
          the drawing verbatim and cites the sheet, revision and location. Correctable by you,
          exportable to Excel.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            to="/auth"
            className="rounded-sm bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Sign in
          </Link>
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-accent">
            Phase 1 — deferrals register
          </span>
        </div>

        <dl className="mt-16 grid gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <div key={c.title} className="bg-card p-6">
              <dt className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-primary">
                {c.title}
              </dt>
              <dd className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.body}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-12">
          <Disclaimer />
        </div>
      </main>
    </div>
  );
}
