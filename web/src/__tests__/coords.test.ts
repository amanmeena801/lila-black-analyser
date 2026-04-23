/**
 * Cross-language contract test for the world-to-pixel transform.
 *
 * The Python pipeline writes the canonical cases to
 * ``data-pipeline/fixtures/coord_cases.json`` (see ``test_coords.py``), and
 * this suite replays every case through the TypeScript implementation. If
 * either side drifts — e.g. someone tweaks MAP_CONFIG in one language but
 * forgets the other — at least one assertion here fails.
 *
 * Tolerances are intentionally tight (1e-6). The transform is deterministic;
 * any real mismatch is a bug.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { worldToPixel } from '@/lib/coords';
import type { MapId } from '@/lib/types';

interface CoordCase {
  map_id: MapId;
  x: number;
  z: number;
  px: number;
  py: number;
}

interface CoordFixture {
  schema: string;
  cases: CoordCase[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  __dirname,
  '../../../data-pipeline/fixtures/coord_cases.json',
);

const fixture: CoordFixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

describe('worldToPixel (cross-language fixture)', () => {
  it('uses the expected fixture schema', () => {
    expect(fixture.schema).toBe('coord_cases_v1');
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  it.each(fixture.cases)(
    '$map_id (x=$x, z=$z) -> (px=$px, py=$py)',
    (c) => {
      const actual = worldToPixel(c.map_id, c.x, c.z);
      expect(actual.px).toBeCloseTo(c.px, 6);
      expect(actual.py).toBeCloseTo(c.py, 6);
    },
  );

  it('throws on an unknown map', () => {
    expect(() =>
      // @ts-expect-error — deliberately passing an invalid MapId
      worldToPixel('NotARealMap', 0, 0),
    ).toThrow(/Unknown map/);
  });
});
