"""Emit the web-ready artifacts consumed by the React SPA via DuckDB-WASM.

Outputs:

* ``events_{slug}.parquet``   — one file per map, containing the enriched events
* ``matches_index.parquet``   — one row per match across all maps
* ``manifest.json``           — tiny catalogue used by the frontend to populate
                                the filter sidebar (maps, days, event types,
                                match counts, duration bounds)
"""

from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path
from typing import Any

import duckdb

from .config import EVENT_TYPES, MAP_CONFIG, MAP_SLUG

log = logging.getLogger(__name__)


# Columns emitted in the per-map parquet. Keep this list tight — every column
# costs bytes over the wire. `match_start_ts` / `match_end_ts` are dropped
# because the client can read them from `matches_index.parquet` on demand.
EVENT_EXPORT_COLUMNS = (
    "user_id",
    "match_id",
    "map_id",
    "x",
    "y",
    "z",
    "ts",
    "event",
    "is_bot",
    "day",
    "duration_ms",
    "rel_ts",
    "px",
    "py",
)


def export_per_map_events(con: duckdb.DuckDBPyConnection, out_dir: Path) -> dict[str, int]:
    """Write one parquet file per map. Returns {map_id: row_count}."""
    out_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    cols = ", ".join(EVENT_EXPORT_COLUMNS)

    for map_id, slug in MAP_SLUG.items():
        path = out_dir / f"events_{slug}.parquet"
        con.execute(
            f"""
            COPY (
                SELECT {cols}
                FROM events
                WHERE map_id = '{map_id}'
                ORDER BY match_id, rel_ts
            )
            TO '{path.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD);
            """
        )
        (n,) = con.execute(
            f"SELECT COUNT(*) FROM events WHERE map_id = '{map_id}'"
        ).fetchone() or (0,)
        counts[map_id] = n
        log.info("Wrote %s (%d rows)", path.name, n)

    return counts


def export_matches_index(con: duckdb.DuckDBPyConnection, out_dir: Path) -> int:
    path = out_dir / "matches_index.parquet"
    con.execute(
        f"""
        COPY (SELECT * FROM matches ORDER BY map_id, day, match_id)
        TO '{path.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD);
        """
    )
    (n,) = con.execute("SELECT COUNT(*) FROM matches").fetchone() or (0,)
    log.info("Wrote %s (%d rows)", path.name, n)
    return n


def build_manifest(
    con: duckdb.DuckDBPyConnection,
    event_counts: dict[str, int],
    pair_counts: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Collect everything the frontend needs to hydrate the filter sidebar."""
    maps_info: dict[str, Any] = {}
    pair_counts = pair_counts or {}

    for map_id in MAP_CONFIG:
        # Days active + match count for this map
        days_rows = con.execute(
            "SELECT DISTINCT day FROM events WHERE map_id = ? ORDER BY day",
            [map_id],
        ).fetchall()
        match_rows = con.execute(
            "SELECT COUNT(DISTINCT match_id) FROM events WHERE map_id = ?",
            [map_id],
        ).fetchone()
        dur_rows = con.execute(
            """
            SELECT MIN(duration_ms), MAX(duration_ms), MEDIAN(duration_ms)
            FROM matches WHERE map_id = ?
            """,
            [map_id],
        ).fetchone()

        cfg = MAP_CONFIG[map_id]
        maps_info[map_id] = {
            "slug": MAP_SLUG[map_id],
            "events": event_counts.get(map_id, 0),
            "pairs": pair_counts.get(map_id, 0),
            "matches": match_rows[0] if match_rows else 0,
            "days": [d[0].isoformat() for d in days_rows if isinstance(d[0], date)],
            "duration_ms": {
                "min": int(dur_rows[0]) if dur_rows and dur_rows[0] is not None else 0,
                "max": int(dur_rows[1]) if dur_rows and dur_rows[1] is not None else 0,
                "median": int(dur_rows[2]) if dur_rows and dur_rows[2] is not None else 0,
            },
            "image": f"/minimaps/{map_id}.{'jpg' if map_id == 'Lockdown' else 'png'}",
            "coord_system": {
                "scale": cfg.scale,
                "origin_x": cfg.origin_x,
                "origin_z": cfg.origin_z,
                "image_px": cfg.image_px,
            },
        }

    return {
        "schema_version": 1,
        "event_types": list(EVENT_TYPES),
        "maps": maps_info,
    }


def write_manifest(manifest: dict[str, Any], out_dir: Path) -> Path:
    path = out_dir / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    log.info("Wrote %s", path.name)
    return path
