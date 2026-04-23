/**
 * World-to-minimap coordinate transform.
 *
 * Mirror of ``data-pipeline/src/pipeline/coords.py``. The shared fixture at
 * ``data-pipeline/fixtures/coord_cases.json`` is the cross-language contract;
 * the ``coords.test.ts`` suite asserts this implementation produces identical
 * output for every canonical case.
 *
 * The pipeline pre-computes ``px``/``py`` for every event, so this function
 * is mostly used for legends, hovers and ad-hoc plotting (e.g. placing map
 * labels). It is kept here so a future tool can skip the pipeline and still
 * render correctly.
 */

import { MAP_CONFIG } from './mapConfig';
import type { MapId } from './types';

export interface PixelCoord {
  px: number;
  py: number;
}

export function worldToPixel(mapId: MapId, x: number, z: number): PixelCoord {
  const cfg = MAP_CONFIG[mapId];
  if (!cfg) {
    throw new Error(`Unknown map: ${mapId}`);
  }
  const u = (x - cfg.origin_x) / cfg.scale;
  const v = (z - cfg.origin_z) / cfg.scale;
  return {
    px: u * cfg.image_px,
    py: (1 - v) * cfg.image_px, // y flipped: image origin is top-left
  };
}
