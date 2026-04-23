export function Topbar() {
  return (
    <header className="flex h-12 items-center justify-between border-b border-surface-700 bg-surface-800 px-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-sm font-semibold tracking-wide text-zinc-100">
          LILA BLACK
        </span>
        <span className="text-xs uppercase tracking-widest text-zinc-500">
          Visual Level Analyser
        </span>
      </div>
      <div className="text-xs text-zinc-500">v0.1 · internal</div>
    </header>
  );
}
