/**
 * Pure range math for the map viewport. Split out from ``PlotlyCanvas.tsx``
 * so it can be unit-tested without the plotly.js dependency chain (whose
 * CSS-embedding parser blows up under Node / Vitest).
 */

/** Visible axis interval as ``[lo, hi]``. May be inverted (hi < lo) for y. */
export type Range = [number, number];

export const IMAGE_PX = 1024;
export const DEFAULT_X_RANGE: Range = [0, IMAGE_PX];
/** y inverted so py=0 (image top) is at the top of the plot. */
export const DEFAULT_Y_RANGE: Range = [IMAGE_PX, 0];

export const MIN_SPAN = 16;
export const MAX_SPAN = IMAGE_PX * 4;

/**
 * Rescale ``[lo, hi]`` around an anchor at normalized position ``f`` (0..1)
 * by ``factor``. The anchor point stays pinned under the cursor.
 */
export function scaleAnchored([lo, hi]: Range, factor: number, f: number): Range {
  const span = hi - lo;
  const anchor = lo + f * span;
  const newSpan = span * factor;
  return [anchor - f * newSpan, anchor + (1 - f) * newSpan];
}

/** Clamp the span so we can't zoom into a single pixel or off into infinity. */
export function clampZoom([lo, hi]: Range): Range {
  const span = hi - lo;
  const absSpan = Math.abs(span);
  if (absSpan < MIN_SPAN) {
    const center = (lo + hi) / 2;
    const half = (Math.sign(span) || 1) * (MIN_SPAN / 2);
    return [center - half, center + half];
  }
  if (absSpan > MAX_SPAN) {
    const center = (lo + hi) / 2;
    const half = (Math.sign(span) || 1) * (MAX_SPAN / 2);
    return [center - half, center + half];
  }
  return [lo, hi];
}

export function rangesEqual(a: Range, b: Range): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Translate a range by a CSS-pixel delta, scaled into image units via the
 * current signed span. The sign of the input span is preserved so inverted
 * y-ranges pan correctly.
 */
export function panRange([lo, hi]: Range, deltaCss: number, cssSpan: number): Range {
  const span = hi - lo;
  const d = (deltaCss / cssSpan) * span;
  return [lo + d, hi + d];
}

/**
 * Special case for the inverted y-axis. ``deltaY > 0`` (scroll down) should
 * shift the viewport toward higher ``py``. We flip the signed span so the
 * result matches the pan convention independent of range direction.
 */
export function panInvertedRange([lo, hi]: Range, deltaCss: number, cssSpan: number): Range {
  const flippedSpan = lo - hi;
  const d = (deltaCss / cssSpan) * flippedSpan;
  return [lo + d, hi + d];
}
