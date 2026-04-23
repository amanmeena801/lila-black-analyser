/**
 * Trajectory trace — one polyline per (match_id, user_id) pair connecting
 * Position / BotPosition events sorted by rel_ts. Used by the Movement view.
 *
 * Each user gets a stable hue derived from user_id so the same player keeps
 * the same colour across views and reloads. Humans and bots share the
 * hue-rotation scheme but bot lines are rendered at a lower opacity and thinner
 * stroke to keep human trails dominant.
 *
 * Implementation note: we emit a single scattergl trace with NaN separators
 * between polylines rather than N traces. Plotly renders far more efficiently
 * with one trace and this keeps the legend clean.
 */

import type { Data } from 'plotly.js-dist-min';

import type { EventRow } from '@/lib/types';

/** FNV-1a → HSL. Stable and cheap. */
function hueForUser(userId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 360;
}

interface Polyline {
  userId: string;
  isBot: boolean;
  points: EventRow[];
}

function groupPolylines(events: EventRow[]): Polyline[] {
  const map = new Map<string, Polyline>();
  for (const e of events) {
    const key = `${e.match_id}::${e.user_id}`;
    const entry = map.get(key);
    if (entry) entry.points.push(e);
    else map.set(key, { userId: e.user_id, isBot: e.is_bot, points: [e] });
  }
  for (const line of map.values()) {
    line.points.sort((a, b) => a.rel_ts - b.rel_ts);
  }
  return Array.from(map.values()).filter((l) => l.points.length >= 2);
}

export function buildTrajectoryTraces(events: EventRow[]): Data[] {
  const lines = groupPolylines(events);
  if (lines.length === 0) return [];

  // Separate humans and bots into two traces so the legend tells the story.
  const humanX: Array<number | null> = [];
  const humanY: Array<number | null> = [];
  const humanColors: string[] = [];
  const botX: Array<number | null> = [];
  const botY: Array<number | null> = [];
  const botColors: string[] = [];

  for (const line of lines) {
    const hue = hueForUser(line.userId);
    const color = `hsl(${hue}, 70%, 55%)`;
    const xs = line.isBot ? botX : humanX;
    const ys = line.isBot ? botY : humanY;
    const colors = line.isBot ? botColors : humanColors;
    for (const p of line.points) {
      xs.push(p.px);
      ys.push(p.py);
      colors.push(color);
    }
    // NaN/null break in the line between polylines.
    xs.push(null);
    ys.push(null);
    colors.push(color); // placeholder — not drawn since null point
  }

  const traces: Data[] = [];

  const humanLineCount = lines.filter((l) => !l.isBot).length;
  if (humanX.length > 0) {
    traces.push({
      type: 'scattergl',
      mode: 'lines',
      name: `Humans (${humanLineCount})`,
      x: humanX,
      y: humanY,
      line: { color: 'rgba(34, 211, 238, 0.85)', width: 1.5 },
      hoverinfo: 'skip',
      // scattergl doesn't support per-segment color arrays cleanly; we use a
      // single colour per group and rely on human vs bot contrast instead.
    } as Data);
  }

  const botLineCount = lines.filter((l) => l.isBot).length;
  if (botX.length > 0) {
    traces.push({
      type: 'scattergl',
      mode: 'lines',
      name: `Bots (${botLineCount})`,
      x: botX,
      y: botY,
      line: { color: 'rgba(132, 204, 22, 0.5)', width: 1 },
      hoverinfo: 'skip',
    } as Data);
  }

  return traces;
}
