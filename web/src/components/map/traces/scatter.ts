/**
 * Scatter traces — one trace per event type so the Plotly legend doubles as
 * the map legend. Used by Kills / Deaths / Storm views.
 *
 * We use ``scattergl`` (WebGL) so 50k+ points stay interactive without
 * tripping the DuckDB query cap.
 */

import type { Data } from 'plotly.js-dist-min';

import type { EventRow, EventType } from '@/lib/types';
import { EVENT_COLOR } from './palette';

/** Group events by type, preserving first-seen order. */
function groupByEvent(events: EventRow[]): Map<EventType, EventRow[]> {
  const out = new Map<EventType, EventRow[]>();
  for (const e of events) {
    const bucket = out.get(e.event);
    if (bucket) bucket.push(e);
    else out.set(e.event, [e]);
  }
  return out;
}

export function buildScatterTraces(events: EventRow[]): Data[] {
  const groups = groupByEvent(events);
  const traces: Data[] = [];

  for (const [eventType, rows] of groups) {
    const x = new Array(rows.length);
    const y = new Array(rows.length);
    const ids = new Array(rows.length);
    const rel = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      x[i] = rows[i].px;
      y[i] = rows[i].py;
      ids[i] = rows[i].user_id;
      rel[i] = rows[i].rel_ts;
    }

    traces.push({
      type: 'scattergl',
      mode: 'markers',
      name: `${eventType} (${rows.length.toLocaleString()})`,
      x,
      y,
      customdata: ids.map((id, i) => [id, rel[i]]),
      hovertemplate:
        `${eventType}<br>user %{customdata[0]}<br>` +
        `t=%{customdata[1]}ms<br>(%{x:.0f}, %{y:.0f})<extra></extra>`,
      marker: {
        color: EVENT_COLOR[eventType],
        size: 5,
        opacity: 0.8,
        line: { color: 'rgba(0,0,0,0.3)', width: 0.5 },
      },
    } as Data);
  }

  return traces;
}
