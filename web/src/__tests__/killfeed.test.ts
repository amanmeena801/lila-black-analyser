/**
 * Unit tests for the Kill Feed trace builder. Mirrors the style of
 * traces.test.ts — no Plotly mounting, just shape and bucketing assertions.
 */

import { describe, expect, it } from 'vitest';

import { buildKillfeedTraces } from '@/components/map/traces/killfeed';
import type { KillCombo, PairRow } from '@/lib/types';

function makePair(partial: Partial<PairRow> = {}): PairRow {
  return {
    match_id: 'm1',
    map_id: 'AmbroseValley',
    day: '2026-02-10',
    killer_id: 'k',
    victim_id: 'v',
    killer_is_bot: false,
    victim_is_bot: true,
    combo: 'H->B',
    killer_ts: 1000,
    victim_ts: 1050,
    dt_ms: 50,
    killer_rel_ts: 100,
    victim_rel_ts: 150,
    duration_ms: 300,
    killer_x: 0,
    killer_z: 0,
    victim_x: 10,
    victim_z: 10,
    killer_px: 100,
    killer_py: 100,
    victim_px: 200,
    victim_py: 200,
    dist: 14,
    ...partial,
  };
}

describe('buildKillfeedTraces', () => {
  it('returns [] when given no pairs', () => {
    expect(buildKillfeedTraces([])).toEqual([]);
  });

  it('emits two traces per occupied combo: a line segment set + victim markers', () => {
    const traces = buildKillfeedTraces([makePair()]);
    expect(traces).toHaveLength(2);
    const line = traces[0] as { type: string; mode: string; name: string };
    const markers = traces[1] as { type: string; mode: string };
    expect(line.type).toBe('scattergl');
    expect(line.mode).toBe('lines');
    expect(line.name).toMatch(/Human → Bot/);
    expect(markers.type).toBe('scattergl');
    expect(markers.mode).toBe('markers');
  });

  it('skips combos that have zero pairs', () => {
    // Only H->B pairs here → exactly 2 traces, no B->H/H->H/B->B traces.
    const pairs: PairRow[] = [
      makePair({ combo: 'H->B' }),
      makePair({ combo: 'H->B', killer_px: 50, victim_px: 80 }),
    ];
    const traces = buildKillfeedTraces(pairs);
    expect(traces).toHaveLength(2); // one combo × (line + markers)
  });

  it('segments each pair with a null separator in the lines trace', () => {
    const pairs = [
      makePair({ killer_px: 1, killer_py: 1, victim_px: 2, victim_py: 2 }),
      makePair({ killer_px: 3, killer_py: 3, victim_px: 4, victim_py: 4 }),
    ];
    const traces = buildKillfeedTraces(pairs) as Array<{
      mode: string;
      x: Array<number | null>;
      y: Array<number | null>;
    }>;
    const lineTrace = traces.find((t) => t.mode === 'lines')!;
    // Each pair contributes killer, victim, null → 3 × 2 = 6 entries.
    expect(lineTrace.x).toEqual([1, 2, null, 3, 4, null]);
    expect(lineTrace.y).toEqual([1, 2, null, 3, 4, null]);
  });

  it('produces one line-trace and one marker-trace per combo, covering all four', () => {
    const combos: KillCombo[] = ['H->H', 'H->B', 'B->H', 'B->B'];
    const pairs = combos.map((c, i) =>
      makePair({
        combo: c,
        killer_is_bot: c.startsWith('B'),
        victim_is_bot: c.endsWith('B'),
        killer_px: i, victim_px: i + 1,
      }),
    );
    const traces = buildKillfeedTraces(pairs) as Array<{ mode: string; name: string }>;
    expect(traces).toHaveLength(8); // 4 combos × 2 traces
    const lineNames = traces.filter((t) => t.mode === 'lines').map((t) => t.name);
    expect(lineNames.some((n) => n.includes('Human → Human'))).toBe(true);
    expect(lineNames.some((n) => n.includes('Human → Bot'))).toBe(true);
    expect(lineNames.some((n) => n.includes('Bot → Human'))).toBe(true);
    expect(lineNames.some((n) => n.includes('Bot → Bot'))).toBe(true);
  });

  it('includes count in legend label', () => {
    const pairs = [
      makePair({ combo: 'H->B' }),
      makePair({ combo: 'H->B' }),
      makePair({ combo: 'H->B' }),
    ];
    const traces = buildKillfeedTraces(pairs) as Array<{ mode: string; name: string }>;
    const lineTrace = traces.find((t) => t.mode === 'lines')!;
    expect(lineTrace.name).toContain('(3)');
  });

  it('marker trace holds victim coordinates only, not killer coords', () => {
    const pairs = [
      makePair({ killer_px: 100, killer_py: 200, victim_px: 555, victim_py: 666 }),
    ];
    const traces = buildKillfeedTraces(pairs) as Array<{
      mode: string;
      x: number[];
      y: number[];
    }>;
    const markers = traces.find((t) => t.mode === 'markers')!;
    expect(markers.x).toEqual([555]);
    expect(markers.y).toEqual([666]);
  });
});
