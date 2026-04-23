/**
 * Mirror of ``data-pipeline/src/pipeline/config.py::MAP_CONFIG``.
 *
 * Keep the numeric values in lock-step with the Python config. The
 * ``coords.test.ts`` suite consumes ``fixtures/coord_cases.json`` exported by
 * the Python tests and will fail if the two drift.
 */

import type { MapId } from './types';

export interface MapCoordSystem {
  scale: number;
  origin_x: number;
  origin_z: number;
  image_px: number;
}

export const MAP_CONFIG: Record<MapId, MapCoordSystem> = {
  AmbroseValley: { scale: 900, origin_x: -370, origin_z: -473, image_px: 1024 },
  GrandRift: { scale: 581, origin_x: -290, origin_z: -290, image_px: 1024 },
  Lockdown: { scale: 1000, origin_x: -500, origin_z: -500, image_px: 1024 },
};

export const MAP_IDS: MapId[] = ['AmbroseValley', 'GrandRift', 'Lockdown'];

export const MAP_LABELS: Record<MapId, string> = {
  AmbroseValley: 'Ambrose Valley',
  GrandRift: 'Grand Rift',
  Lockdown: 'Lockdown',
};
