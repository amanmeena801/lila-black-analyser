/**
 * Renders the minimap plus one of several overlay styles chosen by the active
 * view mode:
 *
 *   - ``loot`` / ``kills_heatmap`` / ``deaths_heatmap`` / ``traffic``
 *                           → 2D histogram heatmap
 *   - ``kills`` / ``deaths`` / ``storm`` → WebGL scatter, one trace per event type
 *   - ``movement``          → trajectory polylines per (match, user)
 *   - ``killfeed``          → killer→victim line segments from pairs.parquet
 *
 * Trace construction is delegated to pure functions in ``./traces/`` so the
 * visual behaviour can be unit-tested without mounting React. This component
 * is responsible only for wiring data → the right trace builder → Plotly.
 */

import { useMemo } from 'react';

import { useEvents } from '@/hooks/useEvents';
import { usePairs } from '@/hooks/usePairs';
import { MAP_LABELS } from '@/lib/mapConfig';
import { toFilterSpec, toPairSpec, useFilterStore } from '@/state/filterStore';

import { PlotlyCanvas } from './PlotlyCanvas';
import { buildHeatmapTrace } from './traces/heatmap';
import { buildKillfeedTraces } from './traces/killfeed';
import { buildScatterTraces } from './traces/scatter';
import { buildTrajectoryTraces } from './traces/trajectory';

const CANVAS_PX = 768;

/**
 * Soft cap on points fed to Plotly. Heatmap bins so this rarely matters;
 * scatter and trajectory start to feel laggy above ~80k nodes in scattergl.
 */
const MAX_POINTS = 80_000;

export function MapCanvas() {
  const state = useFilterStore();
  const isKillfeed = state.view === 'killfeed';

  // Run the events query for every non-killfeed view; run the pairs query
  // only when the killfeed view is active. Keeping them separate means the
  // other views are never blocked on pairs loading and vice versa.
  const eventSpec = toFilterSpec(state);
  const pairSpec = toPairSpec(state);
  const { events, loading: eventsLoading, error: eventsError } = useEvents(eventSpec);
  const { pairs, loading: pairsLoading, error: pairsError } = usePairs(pairSpec);

  const mapSlug = state.map;
  const ext = state.map === 'Lockdown' ? 'jpg' : 'png';
  const imageUrl = `/minimaps/${mapSlug}.${ext}`;

  const capped = events.length > MAX_POINTS ? events.slice(0, MAX_POINTS) : events;

  const traces = useMemo(() => {
    if (isKillfeed) return buildKillfeedTraces(pairs);
    switch (state.view) {
      case 'loot':
      case 'kills_heatmap':
      case 'deaths_heatmap':
      case 'traffic':
        return buildHeatmapTrace(capped);
      case 'movement':
        return buildTrajectoryTraces(capped);
      case 'kills':
      case 'deaths':
      case 'storm':
        return buildScatterTraces(capped);
    }
    return [];
    // ``capped``/``pairs`` encode length + identity, so keying on the source
    // arrays is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.view, events, pairs]);

  const isHeatmap =
    state.view === 'loot' ||
    state.view === 'kills_heatmap' ||
    state.view === 'deaths_heatmap' ||
    state.view === 'traffic';
  const showLegend = !isHeatmap;
  const loading = isKillfeed ? pairsLoading : eventsLoading;
  const error = isKillfeed ? pairsError : eventsError;
  const empty = isKillfeed ? pairs.length === 0 : events.length === 0;

  return (
    <div className="flex min-h-0 items-center justify-center bg-surface-900 p-4">
      <div
        className="relative rounded border border-surface-700"
        style={{ width: CANVAS_PX, height: CANVAS_PX }}
      >
        <PlotlyCanvas
          imageUrl={imageUrl}
          traces={traces}
          size={CANVAS_PX}
          showLegend={showLegend}
        />

        {loading ? (
          <Badge position="top">querying…</Badge>
        ) : null}

        {error ? (
          <Badge position="top" tone="error">
            {error.message}
          </Badge>
        ) : null}

        {!loading && !error && empty ? (
          <Badge position="middle">
            {isKillfeed
              ? 'no killer→victim pairs in this slice'
              : 'no events match the current filters'}
          </Badge>
        ) : null}

        {!isKillfeed && events.length > MAX_POINTS ? (
          <Badge position="bottom">
            showing first {MAX_POINTS.toLocaleString()} of{' '}
            {events.length.toLocaleString()} points
          </Badge>
        ) : null}

        <span className="sr-only" data-map={MAP_LABELS[state.map]} data-view={state.view} />
      </div>
    </div>
  );
}

interface BadgeProps {
  children: React.ReactNode;
  position: 'top' | 'middle' | 'bottom';
  tone?: 'default' | 'error';
}

function Badge({ children, position, tone = 'default' }: BadgeProps) {
  const placement =
    position === 'top'
      ? 'inset-x-0 top-2'
      : position === 'bottom'
        ? 'inset-x-0 bottom-2'
        : 'inset-0 m-auto h-fit';
  const toneCls =
    tone === 'error'
      ? 'bg-rose-950 text-rose-300 border border-rose-800'
      : 'bg-surface-800 text-zinc-400';
  return (
    <div
      className={`pointer-events-none absolute ${placement} mx-auto w-fit rounded px-2 py-0.5 text-xs shadow ${toneCls}`}
    >
      {children}
    </div>
  );
}
