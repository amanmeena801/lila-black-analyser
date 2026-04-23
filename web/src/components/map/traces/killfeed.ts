/**
 * Kill Feed traces — renders each reconstructed killer→victim pair as a line
 * segment from killer_px/py to victim_px/py, plus a small marker at the
 * victim location. Four colour buckets (H→H, H→B, B→H, B→B) keep the legend
 * readable and let level designers scan the map for attack-direction trends.
 *
 * We emit one lines-trace and one markers-trace per combo, with null/NaN
 * separators between segments inside the lines trace — same pattern as the
 * trajectory view, so Plotly can render 100s of segments in a single draw
 * call.
 */

import type { Data } from 'plotly.js-dist-min';

import type { KillCombo, PairRow } from '@/lib/types';

import { COMBO_COLOR, COMBO_LABEL } from './palette';

const ORDER: KillCombo[] = ['H->B', 'B->H', 'H->H', 'B->B'];

interface Group {
  lineX: Array<number | null>;
  lineY: Array<number | null>;
  victimX: number[];
  victimY: number[];
  hover: string[];
}

function emptyGroup(): Group {
  return { lineX: [], lineY: [], victimX: [], victimY: [], hover: [] };
}

function formatHover(p: PairRow): string {
  const k = `${p.killer_is_bot ? 'Bot' : 'Human'} ${shortId(p.killer_id)}`;
  const v = `${p.victim_is_bot ? 'Bot' : 'Human'} ${shortId(p.victim_id)}`;
  const tSec = (p.killer_rel_ts / 1000).toFixed(2);
  return (
    `${k} → ${v}<br>` +
    `match ${shortId(p.match_id)} · t=${tSec}s<br>` +
    `dt=${p.dt_ms}ms · dist=${p.dist.toFixed(0)}<extra></extra>`
  );
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/**
 * Build Plotly traces for the Kill Feed view. ``pairs`` may be filtered in
 * advance by the caller (e.g. focusKillerId) — this function draws whatever
 * it receives.
 */
export function buildKillfeedTraces(pairs: PairRow[]): Data[] {
  if (pairs.length === 0) return [];

  const groups = new Map<KillCombo, Group>();
  for (const combo of ORDER) groups.set(combo, emptyGroup());

  for (const p of pairs) {
    const g = groups.get(p.combo);
    if (!g) continue;
    g.lineX.push(p.killer_px, p.victim_px, null);
    g.lineY.push(p.killer_py, p.victim_py, null);
    g.victimX.push(p.victim_px);
    g.victimY.push(p.victim_py);
    g.hover.push(formatHover(p));
  }

  const traces: Data[] = [];

  for (const combo of ORDER) {
    const g = groups.get(combo);
    if (!g || g.victimX.length === 0) continue;
    const color = COMBO_COLOR[combo];
    const label = COMBO_LABEL[combo];
    const n = g.victimX.length;

    traces.push({
      type: 'scattergl',
      mode: 'lines',
      name: `${label} (${n})`,
      legendgroup: combo,
      x: g.lineX,
      y: g.lineY,
      line: { color, width: 1.5 },
      opacity: 0.85,
      hoverinfo: 'skip',
    } as Data);

    traces.push({
      type: 'scattergl',
      mode: 'markers',
      name: `${label} victim`,
      legendgroup: combo,
      showlegend: false,
      x: g.victimX,
      y: g.victimY,
      marker: {
        color,
        size: 7,
        symbol: 'x',
        line: { color: 'rgba(0,0,0,0.4)', width: 0.5 },
      },
      hovertemplate: '%{text}',
      text: g.hover,
    } as Data);
  }

  return traces;
}
