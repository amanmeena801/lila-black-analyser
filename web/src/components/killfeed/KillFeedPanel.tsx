/**
 * Right-hand panel that replaces StatsPanel while the Kill Feed view is
 * active. Shows:
 *   • four-way combo counts (H→H / H→B / B→H / B→B),
 *   • a Focus-player dropdown (match-mode only) that narrows the map + list
 *     to a single killer,
 *   • a scrollable list of paired events sorted by ``killer_rel_ts``.
 *
 * The list is virtualised by native browser scrolling — the pair parquets
 * top out at ~100 rows per map, so a plain ``<div>`` with overflow-y-auto
 * is plenty.
 */

import { useEffect, useState } from 'react';

import { listKillersInMatch, type KillerSummary } from '@/lib/queries';
import type { KillCombo, PairRow } from '@/lib/types';
import { toPairSpec, useFilterStore } from '@/state/filterStore';
import { usePairs } from '@/hooks/usePairs';

import { COMBO_COLOR, COMBO_LABEL } from '../map/traces/palette';

const COMBO_ORDER: KillCombo[] = ['H->B', 'B->H', 'H->H', 'B->B'];

export function KillFeedPanel() {
  const state = useFilterStore();
  const spec = toPairSpec(state);
  const { pairs, loading, error } = usePairs(spec);

  const focusKillerId = useFilterStore((s) => s.focusKillerId);
  const setFocusKillerId = useFilterStore((s) => s.setFocusKillerId);

  const counts = countsByCombo(pairs);
  const total = pairs.length;

  return (
    <aside className="flex min-h-0 flex-col border-l border-surface-700 bg-surface-800 text-sm">
      <header className="border-b border-surface-700 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Kill Feed
        </h3>
        {error ? (
          <div className="mb-2 rounded border border-rose-700 bg-rose-950 p-2 text-xs text-rose-300">
            {error.message}
          </div>
        ) : null}

        <div className="mb-3 text-xs text-zinc-400">
          {loading ? '…' : total.toLocaleString()} reconstructed pair
          {total === 1 ? '' : 's'}
        </div>

        <div className="space-y-1">
          {COMBO_ORDER.map((c) => (
            <ComboRow key={c} combo={c} count={counts[c]} />
          ))}
        </div>

        {state.matchId ? (
          <FocusPlayerSelector
            map={state.map}
            matchId={state.matchId}
            value={focusKillerId}
            onChange={setFocusKillerId}
          />
        ) : (
          <p className="mt-4 rounded border border-surface-700 bg-surface-900 p-2 text-xs text-zinc-500">
            Pick a specific match to drill down by killer.
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-xs">
        {pairs.length === 0 && !loading ? (
          <p className="text-zinc-500">No pairs match the current filters.</p>
        ) : (
          <ul className="space-y-1">
            {pairs.slice(0, 400).map((p, i) => (
              <PairItem key={`${p.match_id}-${p.killer_ts}-${i}`} pair={p} />
            ))}
          </ul>
        )}
        {pairs.length > 400 ? (
          <p className="mt-2 text-zinc-500">
            …and {(pairs.length - 400).toLocaleString()} more.
          </p>
        ) : null}
      </div>
    </aside>
  );
}

// --------------------------------------------------------------------------- //
// Sub-components                                                              //
// --------------------------------------------------------------------------- //

function ComboRow({ combo, count }: { combo: KillCombo; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-3 w-3 rounded-sm"
          style={{ backgroundColor: COMBO_COLOR[combo] }}
        />
        <span className="text-zinc-300">{COMBO_LABEL[combo]}</span>
      </div>
      <span className="font-mono text-zinc-200">{count.toLocaleString()}</span>
    </div>
  );
}

interface FocusPlayerProps {
  map: PairRow['map_id'];
  matchId: string;
  value: string | undefined;
  onChange(id: string | undefined): void;
}

function FocusPlayerSelector({ map, matchId, value, onChange }: FocusPlayerProps) {
  const [killers, setKillers] = useState<KillerSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listKillersInMatch(map, matchId)
      .then((rows) => {
        if (!cancelled) setKillers(rows);
      })
      .catch(() => {
        if (!cancelled) setKillers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [map, matchId]);

  return (
    <div className="mt-4">
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Focus player{loading ? ' (loading…)' : ''}
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full rounded border border-surface-600 bg-surface-900 px-2 py-1 text-zinc-100 focus:border-accent-500 focus:outline-none"
      >
        <option value="">All killers ({killers.length})</option>
        {killers.map((k) => (
          <option key={k.killer_id} value={k.killer_id}>
            {k.killer_is_bot ? 'Bot' : 'Human'} {short(k.killer_id)} — {k.kills} kills (
            {k.kills_of_humans}H / {k.kills_of_bots}B)
          </option>
        ))}
      </select>
    </div>
  );
}

function PairItem({ pair }: { pair: PairRow }) {
  const color = COMBO_COLOR[pair.combo];
  const t = (pair.killer_rel_ts / 1000).toFixed(2);
  const kLabel = pair.killer_is_bot ? 'Bot' : 'Human';
  const vLabel = pair.victim_is_bot ? 'Bot' : 'Human';
  return (
    <li className="flex items-baseline gap-2 border-l-2 pl-2" style={{ borderColor: color }}>
      <span className="w-12 shrink-0 text-zinc-500">{t}s</span>
      <span className="text-zinc-300">
        {kLabel} <span className="text-zinc-100">{short(pair.killer_id)}</span>
      </span>
      <span className="text-zinc-500">→</span>
      <span className="text-zinc-300">
        {vLabel} <span className="text-zinc-100">{short(pair.victim_id)}</span>
      </span>
      <span className="ml-auto text-zinc-500">{pair.dist.toFixed(0)}u</span>
    </li>
  );
}

// --------------------------------------------------------------------------- //
// Helpers                                                                     //
// --------------------------------------------------------------------------- //

function countsByCombo(pairs: PairRow[]): Record<KillCombo, number> {
  const out: Record<KillCombo, number> = { 'H->H': 0, 'H->B': 0, 'B->H': 0, 'B->B': 0 };
  for (const p of pairs) out[p.combo] += 1;
  return out;
}

function short(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}
