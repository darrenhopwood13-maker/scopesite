export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <span className="font-display text-xl font-700 tracking-tight text-foreground">
        Scope<span className="text-primary">Guard</span>
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
        instructSite
      </span>
    </div>
  );
}
