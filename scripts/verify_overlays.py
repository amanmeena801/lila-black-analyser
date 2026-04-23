"""Cross-check the parquet the browser will fetch against independent
recomputation from raw (x, z) columns and the canonical MAP_CONFIG.

Runs the same filter/aggregation logic the UI runs (one 'virtual overlay' per
ViewMode) and asserts plausibility invariants:

    * manifest event counts match the parquet row counts
    * re-applying the world_to_pixel transform from (x, z) lands within
      1e-6 of the pre-computed (px, py) in the parquet
    * every ViewMode returns a non-empty set for at least one map (otherwise
      the UI would silently show a blank canvas)
    * match-mode time windowing returns the expected monotonic row count
      across normalized progress quantiles

Exits non-zero on any failure. Intended to be run after ``make pipeline``,
alongside ``verify_artifacts.py``.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data-pipeline" / "src"))
from pipeline.config import MAP_CONFIG  # noqa: E402
from pipeline.coords import world_to_pixel  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "web" / "public" / "data"

# Mirror of DEFAULT_EVENT_TYPES in web/src/state/filterStore.ts. Keep in sync.
VIEW_EVENT_TYPES: dict[str, list[str]] = {
    "loot": ["Loot"],
    "kills": ["Kill", "BotKill"],
    "deaths": ["Killed", "BotKilled", "BotKill"],
    "movement": ["Position", "BotPosition"],
    "storm": ["KilledByStorm"],
}


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    manifest = json.loads((OUT / "manifest.json").read_text())

    overall_coverage: dict[str, int] = {v: 0 for v in VIEW_EVENT_TYPES}

    for map_id, info in manifest["maps"].items():
        parquet = OUT / f"events_{info['slug']}.parquet"
        con = duckdb.connect(":memory:")

        # 1. Manifest counts match reality.
        rows = con.execute(
            f"SELECT COUNT(*) FROM read_parquet('{parquet}')"
        ).fetchone()
        assert rows is not None
        if rows[0] != info["events"]:
            fail(f"{map_id}: manifest={info['events']} parquet={rows[0]}")

        # 2. Re-derive (px, py) on a random 1000-row sample and compare.
        sample = con.execute(
            f"""
            SELECT x, z, px, py
            FROM read_parquet('{parquet}')
            USING SAMPLE 1000 ROWS
            """
        ).fetchall()
        max_err = 0.0
        for x, z, px, py in sample:
            expected = world_to_pixel(map_id, float(x), float(z))
            err = max(abs(expected.px - float(px)), abs(expected.py - float(py)))
            max_err = max(max_err, err)
        if max_err > 1e-6:
            fail(f"{map_id}: coord drift between (x,z) and stored (px,py), max_err={max_err}")
        print(f"  {map_id}: coord recompute max_err={max_err:.2e} (over 1000-row sample)")

        # 3. Every ViewMode's event filter returns something for at least one
        #    map. Accumulate counts across maps and assert at the end.
        for view, event_types in VIEW_EVENT_TYPES.items():
            placeholders = ", ".join(f"'{e}'" for e in event_types)
            n = con.execute(
                f"""
                SELECT COUNT(*) FROM read_parquet('{parquet}')
                WHERE event IN ({placeholders})
                """
            ).fetchone()
            assert n is not None
            overall_coverage[view] += n[0]

        # 4. Match-mode time windowing monotonicity:
        #    pick the longest match on this map and check that the number of
        #    events satisfying rel_ts <= duration * q grows monotonically for
        #    q ∈ {0, 0.25, 0.5, 0.75, 1.0}.
        match_row = con.execute(
            f"""
            SELECT match_id, duration_ms
            FROM read_parquet('{parquet}')
            GROUP BY match_id, duration_ms
            ORDER BY duration_ms DESC
            LIMIT 1
            """
        ).fetchone()
        if match_row is None:
            continue
        match_id, duration_ms = match_row
        if duration_ms <= 0:
            continue

        prev = -1
        for q in (0.0, 0.25, 0.5, 0.75, 1.0):
            hi = duration_ms * q
            (n,) = con.execute(
                f"""
                SELECT COUNT(*) FROM read_parquet('{parquet}')
                WHERE match_id = '{match_id}' AND rel_ts <= {hi}
                """
            ).fetchone()
            if n < prev:
                fail(
                    f"{map_id}: match {match_id[:8]} rel_ts<={hi:.0f}ms "
                    f"has {n} rows but previous quantile had {prev}"
                )
            prev = n

        # 5. Bounding-box sanity — the coordinate transform assumes all in-game
        #    positions fall inside the map's `scale`-wide square. Anything
        #    farther off would render outside the minimap image.
        cfg = MAP_CONFIG[map_id]
        oob = con.execute(
            f"""
            SELECT COUNT(*) FROM read_parquet('{parquet}')
            WHERE x < {cfg.origin_x - cfg.scale} OR x > {cfg.origin_x + 2*cfg.scale}
               OR z < {cfg.origin_z - cfg.scale} OR z > {cfg.origin_z + 2*cfg.scale}
            """
        ).fetchone()
        assert oob is not None
        if oob[0] > 0:
            fail(f"{map_id}: {oob[0]} rows far outside the map's coord system")

    # 3 (continued): every view must have data across the full dataset.
    for view, count in overall_coverage.items():
        if count == 0:
            fail(f"view '{view}' would render an empty canvas on every map")
        print(f"  view '{view}': {count:,} rows across all maps")

    print("OK: overlay data verified.")


if __name__ == "__main__":
    main()
