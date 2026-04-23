/**
 * Unit tests for the zoom/pan range math in the map viewport. The PlotlyCanvas
 * component itself is too intertwined with react-plotly to unit-test cleanly
 * (plotly.js embeds CSS that blows up under Node), but the pure range helpers
 * are where correctness actually lives — if the anchor math drifts, pinch
 * zoom will "slide" under the cursor.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_X_RANGE,
  DEFAULT_Y_RANGE,
  clampZoom,
  panInvertedRange,
  panRange,
  rangesEqual,
  scaleAnchored,
  type Range,
} from '@/components/map/viewport';

describe('scaleAnchored', () => {
  it('keeps the center pinned when anchor is 0.5', () => {
    const [lo, hi] = scaleAnchored([0, 1024], 0.5, 0.5);
    expect((lo + hi) / 2).toBeCloseTo(512);
    expect(hi - lo).toBeCloseTo(512);
  });

  it('keeps the left edge pinned when anchor is 0', () => {
    const [lo, hi] = scaleAnchored([0, 1024], 0.5, 0);
    expect(lo).toBeCloseTo(0);
    expect(hi).toBeCloseTo(512);
  });

  it('keeps the right edge pinned when anchor is 1', () => {
    const [lo, hi] = scaleAnchored([0, 1024], 0.5, 1);
    expect(lo).toBeCloseTo(512);
    expect(hi).toBeCloseTo(1024);
  });

  it('handles inverted ranges (y-axis) symmetrically', () => {
    const inv: Range = [1024, 0];
    const f = 0.25;
    const factor = 0.5;
    const [lo, hi] = scaleAnchored(inv, factor, f);

    const anchorBefore = inv[0] + f * (inv[1] - inv[0]);
    const anchorAfter = lo + f * (hi - lo);
    expect(anchorAfter).toBeCloseTo(anchorBefore);
    expect(Math.abs(hi - lo)).toBeCloseTo(1024 * factor);
  });

  it('zooming out then in returns to the original range', () => {
    const start: Range = [100, 700];
    const anchor = 0.3;
    const zoomedOut = scaleAnchored(start, 2, anchor);
    const back = scaleAnchored(zoomedOut, 0.5, anchor);
    expect(back[0]).toBeCloseTo(start[0]);
    expect(back[1]).toBeCloseTo(start[1]);
  });
});

describe('clampZoom', () => {
  it('leaves ranges in the valid span band alone', () => {
    expect(clampZoom([0, 1024])).toEqual([0, 1024]);
    expect(clampZoom([1024, 0])).toEqual([1024, 0]);
  });

  it('clamps extreme zoom-in to MIN_SPAN around the same center', () => {
    const [lo, hi] = clampZoom([511, 513]); // span 2, under MIN_SPAN=16
    expect((lo + hi) / 2).toBeCloseTo(512);
    expect(Math.abs(hi - lo)).toBe(16);
  });

  it('clamps extreme zoom-out to MAX_SPAN', () => {
    const [lo, hi] = clampZoom([-5000, 5000]); // span 10000, above MAX_SPAN=4096
    expect((lo + hi) / 2).toBeCloseTo(0);
    expect(Math.abs(hi - lo)).toBe(4096);
  });

  it('preserves inverted sign when clamping', () => {
    const [lo, hi] = clampZoom([513, 511]); // inverted tiny span
    expect(lo > hi).toBe(true);
    expect(Math.abs(hi - lo)).toBe(16);
  });
});

describe('rangesEqual', () => {
  it('is true for identical ranges', () => {
    expect(rangesEqual([0, 1024], [0, 1024])).toBe(true);
    expect(rangesEqual(DEFAULT_X_RANGE, [0, 1024])).toBe(true);
    expect(rangesEqual(DEFAULT_Y_RANGE, [1024, 0])).toBe(true);
  });

  it('is false for any componentwise difference', () => {
    expect(rangesEqual([0, 1024], [1, 1024])).toBe(false);
    expect(rangesEqual([0, 1024], [0, 1023])).toBe(false);
  });
});

describe('panRange', () => {
  it('shifts both bounds by the equivalent image-space delta', () => {
    // Move 100 CSS px out of 1000 → 10% of a 1024-wide range = ~102.4.
    const [lo, hi] = panRange([0, 1024], 100, 1000);
    expect(lo).toBeCloseTo(102.4);
    expect(hi).toBeCloseTo(1126.4);
  });

  it('pans less aggressively as the viewport zooms in', () => {
    const zoomed: Range = [400, 600];
    const [lo, hi] = panRange(zoomed, 100, 1000);
    // Span is 200 → 10% pan = 20 in image units.
    expect(lo).toBeCloseTo(420);
    expect(hi).toBeCloseTo(620);
  });

  it('is reversible — pan +d then -d returns to origin', () => {
    const start: Range = [123, 789];
    const after = panRange(panRange(start, 250, 768), -250, 768);
    expect(after[0]).toBeCloseTo(start[0]);
    expect(after[1]).toBeCloseTo(start[1]);
  });
});

describe('panInvertedRange', () => {
  it('for deltaY > 0 shifts inverted yRange toward higher py', () => {
    // Default yRange = [1024, 0]. Scroll down (deltaY=100) on a 768-tall
    // canvas should show content BELOW → both bounds should increase.
    const [lo, hi] = panInvertedRange([1024, 0], 100, 768);
    expect(lo).toBeGreaterThan(1024);
    expect(hi).toBeGreaterThan(0);
    // The shift magnitude should match the scaled delta.
    expect(lo - 1024).toBeCloseTo((100 / 768) * 1024, 4);
    expect(hi - 0).toBeCloseTo((100 / 768) * 1024, 4);
  });

  it('for deltaY < 0 shifts inverted yRange toward lower py', () => {
    const [lo, hi] = panInvertedRange([1024, 0], -100, 768);
    expect(lo).toBeLessThan(1024);
    expect(hi).toBeLessThan(0);
  });

  it('preserves the inverted shape (lo stays > hi)', () => {
    const [lo, hi] = panInvertedRange([1024, 0], 500, 768);
    expect(lo).toBeGreaterThan(hi);
  });
});
