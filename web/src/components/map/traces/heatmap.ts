/**
 * Heatmap trace — 2D histogram binned over the 1024×1024 minimap. Used for
 * the "Loot heatmap" view where density is the signal and individual events
 * don't carry meaning on their own.
 *
 * We use ``histogram2d`` rather than a pre-binned ``heatmap`` trace so Plotly
 * can rebin on client resize/zoom without us re-running SQL.
 */

import type { Data } from 'plotly.js-dist-min';

import type { EventRow } from '@/lib/types';
import { HEATMAP_COLORSCALE } from './palette';

/** Bin count per axis. 48 = ~21px bins, which reads well at CANVAS_PX=768. */
const BIN_COUNT = 48;

export function buildHeatmapTrace(events: EventRow[]): Data[] {
  if (events.length === 0) return [];

  const x = new Array(events.length);
  const y = new Array(events.length);
  for (let i = 0; i < events.length; i++) {
    x[i] = events[i].px;
    y[i] = events[i].py;
  }

  return [
    {
      type: 'histogram2d',
      x,
      y,
      autobinx: false,
      autobiny: false,
      xbins: { start: 0, end: 1024, size: 1024 / BIN_COUNT },
      ybins: { start: 0, end: 1024, size: 1024 / BIN_COUNT },
      colorscale: HEATMAP_COLORSCALE,
      showscale: true,
      colorbar: {
        thickness: 6,
        len: 0.6,
        x: 1.02,
        tickfont: { color: '#a1a1aa', size: 10 },
        title: { text: 'events', font: { color: '#a1a1aa', size: 10 } },
      },
      hovertemplate: 'px %{x:.0f}, py %{y:.0f}<br>%{z} events<extra></extra>',
      zsmooth: 'best',
      opacity: 0.85,
    } as Data,
  ];
}
