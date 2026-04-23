/**
 * Thin wrapper around react-plotly.js that injects the minimap PNG as a
 * background image and locks the axes to image pixel space (0..1024, y
 * inverted). Every view mode — heatmap, scatter, trajectory — uses the same
 * layout so they share legends, pan/zoom and hover behaviour.
 *
 * View-state (the visible ``xRange`` / ``yRange`` slice of the 1024×1024
 * image) is owned by React rather than by Plotly's internal drag state so we
 * can drive it from three input paths:
 *
 *   - a physical button bar (zoom-in, zoom-out, reset),
 *   - trackpad **pinch** → browsers surface this as ``wheel + ctrlKey`` on
 *     desktop, so we scale around the cursor when that flag is set,
 *   - trackpad two-finger scroll + mouse wheel → pan the viewport by the
 *     CSS-pixel delta, converted to image units via the current span,
 *   - mouse click-drag → handled natively by Plotly's ``dragmode: 'pan'``,
 *     whose ``relayout`` events we sync back into our state.
 *
 * The component is dumb about traces on purpose: it takes an array of Plotly
 * traces plus the minimap URL and renders them. Trace construction lives in
 * ``./traces/*``; view selection lives in ``MapCanvas.tsx``. Keeps unit
 * testing of trace logic independent of React.
 */

import type { Data, Layout, PlotRelayoutEvent } from 'plotly.js-dist-min';
import Plot from 'react-plotly.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_X_RANGE,
  DEFAULT_Y_RANGE,
  IMAGE_PX,
  clampZoom,
  panInvertedRange,
  panRange,
  rangesEqual,
  scaleAnchored,
  type Range,
} from './viewport';

interface Props {
  imageUrl: string;
  traces: Data[];
  /** Rendered side length in CSS pixels. Coord system is always 1024×1024. */
  size: number;
  /** Show the Plotly legend strip. Off for heatmap (it has a colorbar). */
  showLegend?: boolean;
}

const BUTTON_ZOOM_FACTOR = 1.4;
const WHEEL_PINCH_SENSITIVITY = 0.01;

export function PlotlyCanvas({ imageUrl, traces, size, showLegend = true }: Props) {
  const [xRange, setXRange] = useState<Range>(DEFAULT_X_RANGE);
  const [yRange, setYRange] = useState<Range>(DEFAULT_Y_RANGE);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Reset to full extent whenever the underlying minimap changes — each map
  // is a fresh coord frame from the user's mental model, even though the
  // numeric range is identical.
  useEffect(() => {
    setXRange(DEFAULT_X_RANGE);
    setYRange(DEFAULT_Y_RANGE);
  }, [imageUrl]);

  // ------------------------------------------------------------------------- //
  // Zoom & pan helpers                                                        //
  // ------------------------------------------------------------------------- //

  /**
   * Scale the viewport around an anchor expressed as ``(fx, fy)`` in
   * normalized CSS space (0..1). ``factor < 1`` zooms in, ``> 1`` zooms out.
   * Anchor stays pinned to the same image pixel across the transform.
   */
  const zoomAround = useCallback((factor: number, fx: number, fy: number) => {
    setXRange(([lo, hi]) => clampZoom(scaleAnchored([lo, hi], factor, fx)));
    setYRange(([lo, hi]) => clampZoom(scaleAnchored([lo, hi], factor, fy)));
  }, []);

  const zoomIn = useCallback(() => zoomAround(1 / BUTTON_ZOOM_FACTOR, 0.5, 0.5), [zoomAround]);
  const zoomOut = useCallback(() => zoomAround(BUTTON_ZOOM_FACTOR, 0.5, 0.5), [zoomAround]);
  const resetView = useCallback(() => {
    setXRange(DEFAULT_X_RANGE);
    setYRange(DEFAULT_Y_RANGE);
  }, []);

  // ------------------------------------------------------------------------- //
  // Wheel handler — pinch vs. pan, attached non-passively                      //
  // ------------------------------------------------------------------------- //

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    function onWheel(ev: WheelEvent) {
      // preventDefault requires passive:false; addEventListener below opts in.
      ev.preventDefault();
      const rect = el!.getBoundingClientRect();
      const fx = (ev.clientX - rect.left) / rect.width;
      const fy = (ev.clientY - rect.top) / rect.height;

      if (ev.ctrlKey) {
        // Trackpad pinch surfaces as ``wheel + ctrlKey``. The metaKey branch
        // could add ⌘+wheel as a mouse-user zoom shortcut, but we keep mouse
        // wheel exclusively for panning per the product requirement.
        const factor = Math.exp(ev.deltaY * WHEEL_PINCH_SENSITIVITY);
        zoomAround(factor, fx, fy);
      } else {
        // Two-finger scroll on trackpad / mouse-wheel → pan. The viewport
        // module knows how to handle the inverted y-range correctly.
        setXRange((r) => panRange(r, ev.deltaX, rect.width));
        setYRange((r) => panInvertedRange(r, ev.deltaY, rect.height));
      }
    }

    // passive:false is required for preventDefault to stop the browser from
    // scrolling the whole page while the user zooms/pans the minimap.
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAround]);

  // ------------------------------------------------------------------------- //
  // Plotly → React state sync (drag-pan, box-zoom, double-click autoscale)     //
  // ------------------------------------------------------------------------- //

  const onRelayout = useCallback((ev: Readonly<PlotRelayoutEvent>) => {
    const e = ev as Record<string, unknown>;
    // Auto-reset (double-click or modebar "Reset axes").
    if (e['xaxis.autorange'] || e['yaxis.autorange']) {
      setXRange(DEFAULT_X_RANGE);
      setYRange(DEFAULT_Y_RANGE);
      return;
    }
    const xLo = e['xaxis.range[0]'];
    const xHi = e['xaxis.range[1]'];
    if (typeof xLo === 'number' && typeof xHi === 'number') {
      setXRange([xLo, xHi]);
    } else if (Array.isArray(e['xaxis.range'])) {
      const r = e['xaxis.range'] as [number, number];
      setXRange([r[0], r[1]]);
    }
    const yLo = e['yaxis.range[0]'];
    const yHi = e['yaxis.range[1]'];
    if (typeof yLo === 'number' && typeof yHi === 'number') {
      setYRange([yLo, yHi]);
    } else if (Array.isArray(e['yaxis.range'])) {
      const r = e['yaxis.range'] as [number, number];
      setYRange([r[0], r[1]]);
    }
  }, []);

  // ------------------------------------------------------------------------- //
  // Layout                                                                    //
  // ------------------------------------------------------------------------- //

  const layout = useMemo<Partial<Layout>>(
    () => ({
      width: size,
      height: size,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      showlegend: showLegend,
      // Left-click drag = pan (mouse path for the pan requirement).
      dragmode: 'pan',
      legend: {
        x: 0.01,
        y: 0.99,
        bgcolor: 'rgba(24,24,27,0.7)',
        bordercolor: '#3f3f46',
        borderwidth: 1,
        font: { color: '#e4e4e7', size: 11 },
      },
      xaxis: {
        range: xRange,
        visible: false,
        fixedrange: false,
        constrain: 'domain',
      },
      yaxis: {
        range: yRange,
        visible: false,
        fixedrange: false,
        scaleanchor: 'x',
        scaleratio: 1,
        constrain: 'domain',
      },
      images: [
        {
          source: imageUrl,
          xref: 'x',
          yref: 'y',
          x: 0,
          y: 0,
          sizex: IMAGE_PX,
          sizey: IMAGE_PX,
          sizing: 'stretch',
          opacity: 0.75,
          layer: 'below',
        },
      ],
      hoverlabel: {
        bgcolor: '#18181b',
        bordercolor: '#52525b',
        font: { family: 'ui-monospace, monospace', size: 11, color: '#e4e4e7' },
      },
    }),
    [imageUrl, size, showLegend, xRange, yRange],
  );

  const isZoomed = !rangesEqual(xRange, DEFAULT_X_RANGE) || !rangesEqual(yRange, DEFAULT_Y_RANGE);
  const zoomPct = Math.round((IMAGE_PX / Math.abs(xRange[1] - xRange[0])) * 100);

  return (
    <div
      ref={wrapperRef}
      className="relative"
      style={{ width: size, height: size, touchAction: 'none' }}
    >
      <Plot
        data={traces}
        layout={layout}
        onRelayout={onRelayout}
        config={{
          displaylogo: false,
          responsive: false,
          // Disable Plotly's own wheel-zoom — we handle wheel ourselves so
          // pinch (ctrl+wheel) and two-finger pan can coexist.
          scrollZoom: false,
          // Remove modebar buttons we've replaced with our own UI.
          modeBarButtonsToRemove: [
            'select2d',
            'lasso2d',
            'autoScale2d',
            'toggleSpikelines',
            'zoom2d',
            'zoomIn2d',
            'zoomOut2d',
            'resetScale2d',
            'pan2d',
          ],
          displayModeBar: false,
          toImageButtonOptions: { format: 'png', filename: 'lila-black-overlay' },
        }}
        useResizeHandler={false}
        style={{ width: size, height: size }}
      />

      <ZoomControls
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onReset={resetView}
        zoomPct={zoomPct}
        canReset={isZoomed}
      />
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Zoom controls                                                               //
// --------------------------------------------------------------------------- //

interface ZoomControlsProps {
  onZoomIn(): void;
  onZoomOut(): void;
  onReset(): void;
  /** Integer zoom percentage: 100 = fit, 200 = 2×, etc. */
  zoomPct: number;
  /** Dims the reset button when the viewport is already at full extent. */
  canReset: boolean;
}

function ZoomControls({ onZoomIn, onZoomOut, onReset, zoomPct, canReset }: ZoomControlsProps) {
  return (
    <div
      className="pointer-events-none absolute right-2 top-2 flex flex-col items-end gap-1"
      // Tooltip discoverability — the three inputs we support.
      title="Scroll to pan · Ctrl + scroll / pinch to zoom · Drag to pan"
    >
      <div className="pointer-events-auto overflow-hidden rounded border border-surface-600 bg-surface-800/90 shadow">
        <ZoomButton label="Zoom in" onClick={onZoomIn}>
          +
        </ZoomButton>
        <div className="h-px bg-surface-700" />
        <ZoomButton label="Zoom out" onClick={onZoomOut}>
          −
        </ZoomButton>
        <div className="h-px bg-surface-700" />
        <ZoomButton label="Reset view" onClick={onReset} disabled={!canReset}>
          ⤾
        </ZoomButton>
      </div>
      <span className="pointer-events-none rounded bg-surface-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
        {zoomPct}%
      </span>
    </div>
  );
}

interface ZoomButtonProps {
  label: string;
  onClick(): void;
  disabled?: boolean;
  children: React.ReactNode;
}

function ZoomButton({ label, onClick, disabled = false, children }: ZoomButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center text-zinc-200 transition hover:bg-surface-700 disabled:cursor-not-allowed disabled:text-zinc-600 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

