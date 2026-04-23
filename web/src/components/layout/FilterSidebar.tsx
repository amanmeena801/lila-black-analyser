/**
 * Left-hand panel. Drives every filter in the store. Intentionally a single
 * component — small enough to read top-to-bottom, no prop drilling.
 */

import type { ChangeEvent } from 'react';

import { MAP_IDS, MAP_LABELS } from '@/lib/mapConfig';
import type { MapId, Manifest, ViewMode } from '@/lib/types';
import { useMatches } from '@/hooks/useMatches';
import { useFilterStore } from '@/state/filterStore';

interface Props {
  manifest: Manifest;
}

interface ViewOption {
  value: ViewMode;
  label: string;
}

interface ViewGroup {
  heading: string;
  items: ViewOption[];
}

const VIEW_GROUPS: ViewGroup[] = [
  {
    heading: 'Points',
    items: [
      { value: 'kills', label: 'Kill distribution' },
      { value: 'deaths', label: 'Killed positions' },
      { value: 'storm', label: 'Storm deaths' },
      { value: 'movement', label: 'Player movement' },
    ],
  },
  {
    heading: 'Heatmaps',
    items: [
      { value: 'kills_heatmap', label: 'Kill zones' },
      { value: 'deaths_heatmap', label: 'Death zones' },
      { value: 'traffic', label: 'Traffic' },
      { value: 'loot', label: 'Loot' },
    ],
  },
  {
    heading: 'Kill Feed',
    items: [{ value: 'killfeed', label: 'Killer → victim pairs' }],
  },
];

export function FilterSidebar({ manifest }: Props) {
  const map = useFilterStore((s) => s.map);
  const day = useFilterStore((s) => s.day);
  const matchId = useFilterStore((s) => s.matchId);
  const view = useFilterStore((s) => s.view);
  const showHumans = useFilterStore((s) => s.showHumans);
  const showBots = useFilterStore((s) => s.showBots);

  const setMap = useFilterStore((s) => s.setMap);
  const setDay = useFilterStore((s) => s.setDay);
  const setMatchId = useFilterStore((s) => s.setMatchId);
  const setView = useFilterStore((s) => s.setView);
  const setShowHumans = useFilterStore((s) => s.setShowHumans);
  const setShowBots = useFilterStore((s) => s.setShowBots);

  const days = manifest.maps[map].days;
  const { matches, loading: matchesLoading } = useMatches(map, day);

  return (
    <aside className="min-h-0 overflow-y-auto border-r border-surface-700 bg-surface-800 p-4 text-sm">
      <Section title="Map">
        <Select
          value={map}
          onChange={(e) => setMap(e.target.value as MapId)}
          options={MAP_IDS.map((m) => ({ value: m, label: MAP_LABELS[m] }))}
        />
      </Section>

      <Section title="Day">
        <Select
          value={day ?? ''}
          onChange={(e) => setDay(e.target.value || undefined)}
          options={[
            { value: '', label: 'All days' },
            ...days.map((d) => ({ value: d, label: d })),
          ]}
        />
      </Section>

      <Section title={matchesLoading ? 'Match (loading…)' : `Match (${matches.length})`}>
        <Select
          value={matchId ?? ''}
          onChange={(e) => setMatchId(e.target.value || undefined)}
          options={[
            { value: '', label: 'All matches' },
            ...matches.map((m) => ({
              value: m.match_id,
              label: `${m.day} · ${short(m.match_id)} · ${m.duration_ms}ms`,
            })),
          ]}
        />
      </Section>

      <Section title="View">
        <div className="space-y-3">
          {VIEW_GROUPS.map((g) => (
            <div key={g.heading}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                {g.heading}
              </p>
              <div className="space-y-1">
                {g.items.map((v) => (
                  <label
                    key={v.value}
                    className="flex cursor-pointer items-center gap-2 text-zinc-300"
                  >
                    <input
                      type="radio"
                      name="view"
                      checked={view === v.value}
                      onChange={() => setView(v.value)}
                      className="accent-accent-500"
                    />
                    {v.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Actors">
        <label className="flex cursor-pointer items-center gap-2 text-zinc-300">
          <input
            type="checkbox"
            checked={showHumans}
            onChange={(e) => setShowHumans(e.target.checked)}
            className="accent-accent-500"
          />
          Humans
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-zinc-300">
          <input
            type="checkbox"
            checked={showBots}
            onChange={(e) => setShowBots(e.target.checked)}
            className="accent-accent-500"
          />
          Bots
        </label>
      </Section>

      <div className="mt-6 rounded border border-surface-700 bg-surface-900 p-3 font-mono text-xs text-zinc-500">
        {manifest.maps[map].events.toLocaleString()} events · {manifest.maps[map].matches} matches
      </div>
    </aside>
  );
}

// --------------------------------------------------------------------------- //
// Small presentational primitives. Local to this file — they have no purpose  //
// elsewhere.                                                                  //
// --------------------------------------------------------------------------- //

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </h3>
      {children}
    </div>
  );
}

interface SelectProps<T extends string> {
  value: T;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  options: { value: T; label: string }[];
}

function Select<T extends string>({ value, onChange, options }: SelectProps<T>) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="w-full rounded border border-surface-600 bg-surface-900 px-2 py-1 text-zinc-100 focus:border-accent-500 focus:outline-none"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function short(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}
