/**
 * Right-hand panel — summary stats about the current view. Everything here
 * reacts to the filter store automatically.
 */

import { useEvents } from '@/hooks/useEvents';
import { useSelectedMatch } from '@/hooks/useSelectedMatch';
import { toFilterSpec, useFilterStore } from '@/state/filterStore';

export function StatsPanel() {
  const state = useFilterStore();
  const spec = toFilterSpec(state);
  const { events, loading, error } = useEvents(spec);
  const { match } = useSelectedMatch();

  const humans = events.filter((e) => !e.is_bot).length;
  const bots = events.length - humans;
  const kills = events.filter((e) => e.event === 'Kill' || e.event === 'BotKill').length;
  const deaths = events.filter(
    (e) => e.event === 'Killed' || e.event === 'BotKilled' || e.event === 'KilledByStorm',
  ).length;
  const loot = events.filter((e) => e.event === 'Loot').length;

  return (
    <aside className="min-h-0 overflow-y-auto border-l border-surface-700 bg-surface-800 p-4 text-sm">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Current selection
      </h3>

      {error ? (
        <div className="mb-2 rounded border border-rose-700 bg-rose-950 p-2 text-xs text-rose-300">
          {error.message}
        </div>
      ) : null}

      <Stat label="Events" value={loading ? '…' : events.length.toLocaleString()} />
      <Stat label="Human rows" value={humans.toLocaleString()} />
      <Stat label="Bot rows" value={bots.toLocaleString()} />
      <Stat label="Kills (K + BotK)" value={kills.toLocaleString()} />
      <Stat label="Deaths (K'd + storm)" value={deaths.toLocaleString()} />
      <Stat label="Loot" value={loot.toLocaleString()} />

      {match ? (
        <>
          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Selected match
          </h3>
          <Stat label="Match" value={match.match_id.slice(0, 8)} mono />
          <Stat label="Day" value={match.day} />
          <Stat label="Duration" value={`${match.duration_ms} ms`} />
          <Stat label="Humans" value={match.human_count.toString()} />
          <Stat label="Bots" value={match.bot_count.toString()} />
        </>
      ) : null}
    </aside>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-zinc-200 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
