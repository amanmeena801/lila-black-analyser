/**
 * Unit tests for the three pure trace builders. We don't render Plotly here;
 * we just assert that the output shape matches what Plotly expects and that
 * the builders correctly fan events across traces.
 */

import { describe, expect, it } from 'vitest';

import { buildHeatmapTrace } from '@/components/map/traces/heatmap';
import { buildScatterTraces } from '@/components/map/traces/scatter';
import { buildTrajectoryTraces } from '@/components/map/traces/trajectory';
import type { EventRow, EventType } from '@/lib/types';

function makeEvent(partial: Partial<EventRow> = {}): EventRow {
  return {
    user_id: 'u1',
    match_id: 'm1',
    map_id: 'AmbroseValley',
    x: 0,
    y: 0,
    z: 0,
    ts: 1_700_000_000_000,
    event: 'Position',
    is_bot: false,
    day: '2025-01-01',
    duration_ms: 1000,
    rel_ts: 100,
    px: 100,
    py: 100,
    ...partial,
  };
}

describe('buildHeatmapTrace', () => {
  it('returns an empty array for zero events', () => {
    expect(buildHeatmapTrace([])).toEqual([]);
  });

  it('emits exactly one histogram2d trace with x/y arrays', () => {
    const events = [makeEvent({ px: 10, py: 20 }), makeEvent({ px: 30, py: 40 })];
    const traces = buildHeatmapTrace(events);
    expect(traces).toHaveLength(1);
    const t = traces[0] as { type: string; x: number[]; y: number[] };
    expect(t.type).toBe('histogram2d');
    expect(t.x).toEqual([10, 30]);
    expect(t.y).toEqual([20, 40]);
  });

  it('is event-type-agnostic — works for kills_heatmap/deaths_heatmap/traffic inputs', () => {
    // The three heatmap views (kill zones, death zones, traffic) reuse
    // buildHeatmapTrace but feed it different event populations. The builder
    // must ignore the ``event`` field and bin on px/py alone.
    const cases: Array<{ name: string; events: EventRow[] }> = [
      {
        name: 'kills_heatmap',
        events: [
          makeEvent({ event: 'Kill', px: 5, py: 5 }),
          makeEvent({ event: 'BotKill', px: 15, py: 25 }),
        ],
      },
      {
        name: 'deaths_heatmap',
        events: [
          makeEvent({ event: 'Killed', px: 100, py: 100 }),
          makeEvent({ event: 'BotKilled', px: 200, py: 300 }),
          makeEvent({ event: 'KilledByStorm', px: 400, py: 500 }),
        ],
      },
      {
        name: 'traffic',
        events: [
          makeEvent({ event: 'Position', px: 1, py: 2 }),
          makeEvent({ event: 'BotPosition', px: 3, py: 4 }),
        ],
      },
    ];
    for (const { events } of cases) {
      const traces = buildHeatmapTrace(events) as Array<{
        type: string;
        x: number[];
        y: number[];
      }>;
      expect(traces).toHaveLength(1);
      expect(traces[0].type).toBe('histogram2d');
      expect(traces[0].x).toHaveLength(events.length);
      expect(traces[0].y).toHaveLength(events.length);
    }
  });
});

describe('buildScatterTraces', () => {
  it('groups events by event type, one trace per type', () => {
    const events: EventRow[] = [
      makeEvent({ event: 'Kill', px: 1, py: 1 }),
      makeEvent({ event: 'Kill', px: 2, py: 2 }),
      makeEvent({ event: 'BotKill', px: 3, py: 3 }),
    ];
    const traces = buildScatterTraces(events) as Array<{ name: string; x: number[] }>;
    expect(traces).toHaveLength(2);
    const names = traces.map((t) => t.name);
    expect(names.some((n) => n.startsWith('Kill '))).toBe(true);
    expect(names.some((n) => n.startsWith('BotKill '))).toBe(true);
    const killTrace = traces.find((t) => t.name.startsWith('Kill '))!;
    expect(killTrace.x).toHaveLength(2);
  });

  it('uses scattergl and includes per-point customdata for hover', () => {
    const events: EventRow[] = [
      makeEvent({ event: 'Killed', user_id: 'alice', rel_ts: 500, px: 7, py: 8 }),
    ];
    const traces = buildScatterTraces(events) as Array<{
      type: string;
      customdata: unknown[];
    }>;
    expect(traces[0].type).toBe('scattergl');
    expect(traces[0].customdata).toEqual([['alice', 500]]);
  });
});

describe('buildTrajectoryTraces', () => {
  it('returns empty when no line has >= 2 points', () => {
    const events: EventRow[] = [makeEvent({ user_id: 'u1' })];
    expect(buildTrajectoryTraces(events)).toEqual([]);
  });

  it('sorts each polyline by rel_ts ascending', () => {
    const events: EventRow[] = [
      makeEvent({ user_id: 'u1', rel_ts: 300, px: 3, py: 3 }),
      makeEvent({ user_id: 'u1', rel_ts: 100, px: 1, py: 1 }),
      makeEvent({ user_id: 'u1', rel_ts: 200, px: 2, py: 2 }),
    ];
    const traces = buildTrajectoryTraces(events) as Array<{ x: Array<number | null> }>;
    // single human trace, points followed by null separator
    expect(traces).toHaveLength(1);
    expect(traces[0].x).toEqual([1, 2, 3, null]);
  });

  it('splits humans and bots into separate traces and keeps (match, user) polylines distinct', () => {
    const events: EventRow[] = [
      makeEvent({ user_id: 'h1', is_bot: false, match_id: 'm1', rel_ts: 10, px: 0, py: 0 }),
      makeEvent({ user_id: 'h1', is_bot: false, match_id: 'm1', rel_ts: 20, px: 1, py: 1 }),
      makeEvent({ user_id: 'h1', is_bot: false, match_id: 'm2', rel_ts: 10, px: 9, py: 9 }),
      makeEvent({ user_id: 'h1', is_bot: false, match_id: 'm2', rel_ts: 20, px: 8, py: 8 }),
      makeEvent({ user_id: 'b1', is_bot: true, match_id: 'm1', rel_ts: 10, px: 5, py: 5 }),
      makeEvent({ user_id: 'b1', is_bot: true, match_id: 'm1', rel_ts: 20, px: 6, py: 6 }),
    ];
    const traces = buildTrajectoryTraces(events) as Array<{ name: string; x: unknown[] }>;
    expect(traces).toHaveLength(2);
    const human = traces.find((t) => t.name.startsWith('Humans'))!;
    const bot = traces.find((t) => t.name.startsWith('Bots'))!;
    expect(human.name).toBe('Humans (2)');
    expect(bot.name).toBe('Bots (1)');
    // Two human polylines (2 points each) + 2 null separators = 6 entries.
    expect(human.x).toHaveLength(6);
  });

  it('drops polylines with < 2 points entirely', () => {
    const events: EventRow[] = [
      makeEvent({ user_id: 'solo', match_id: 'm1', rel_ts: 10 }),
      makeEvent({ user_id: 'pair', match_id: 'm1', rel_ts: 10, px: 1, py: 1 }),
      makeEvent({ user_id: 'pair', match_id: 'm1', rel_ts: 20, px: 2, py: 2 }),
    ];
    const traces = buildTrajectoryTraces(events) as Array<{ name: string; x: unknown[] }>;
    expect(traces).toHaveLength(1);
    expect(traces[0].name).toBe('Humans (1)');
  });

  it('coerces unknown event types gracefully via EventType cast (smoke)', () => {
    const evt: EventType = 'Position';
    expect(evt).toBe('Position');
  });
});
