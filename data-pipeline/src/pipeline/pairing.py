"""Derive a heuristic ``pairs`` table that reconstructs killer→victim edges.

The raw schema emits *one* ``user_id`` per event (the actor). A kill therefore
shows up twice — once on the killer as ``Kill``/``BotKill`` and once on the
victim as ``Killed``/``BotKilled`` — without a shared join key. We pair the
two sides by ``match_id`` + small temporal tolerance + spatial proximity.

This is intentionally a *heuristic* layer (see ``docs/DATA_ANOMALIES.md``): if
two kills happen within the same second near each other, the pairing may
mis-attribute. The result is good enough for the Kill Feed UI, but must not
be confused with ground-truth attribution.

Tunables
--------
``TIME_WINDOW_MS``
    Max absolute difference between killer-side ``ts`` and victim-side ``ts``.
    2 s is generous for network jitter; widen if the UI shows lots of
    "??? unknown victim" rows.
``DISTANCE_WEIGHT``
    How aggressively world-space distance breaks ties between candidates that
    arrive within ``TIME_WINDOW_MS``. Units are ms-per-world-unit so
    ``0.1`` means "10 m apart is as bad as 1 ms off".

Output schema (``pairs_{slug}.parquet``)
----------------------------------------
One row per matched ``(killer_event, victim_event)``::

    match_id, map_id, day,
    killer_id, victim_id,
    killer_is_bot, victim_is_bot,
    combo,                            -- 'H->H' | 'H->B' | 'B->H' | 'B->B'
    killer_ts, victim_ts, dt_ms,
    killer_rel_ts, victim_rel_ts, duration_ms,
    killer_x, killer_z, victim_x, victim_z,
    killer_px, killer_py, victim_px, victim_py,
    dist                              -- sqrt((dx)^2 + (dz)^2), world units

Self-pairs (``killer_id = victim_id``) are rejected — a player cannot kill
themselves in this game.
"""

from __future__ import annotations

import logging
from pathlib import Path

import duckdb

from .config import MAP_SLUG

log = logging.getLogger(__name__)

TIME_WINDOW_MS: int = 2000
DISTANCE_WEIGHT: float = 0.1


PAIRS_COLUMNS = (
    "match_id",
    "map_id",
    "day",
    "killer_id",
    "victim_id",
    "killer_is_bot",
    "victim_is_bot",
    "combo",
    "killer_ts",
    "victim_ts",
    "dt_ms",
    "killer_rel_ts",
    "victim_rel_ts",
    "duration_ms",
    "killer_x",
    "killer_z",
    "victim_x",
    "victim_z",
    "killer_px",
    "killer_py",
    "victim_px",
    "victim_py",
    "dist",
)


def build_pairs(
    con: duckdb.DuckDBPyConnection,
    *,
    time_window_ms: int = TIME_WINDOW_MS,
    distance_weight: float = DISTANCE_WEIGHT,
) -> None:
    """Create the ``pairs`` table by self-joining ``events``.

    Strategy: cross-join killer rows with candidate victim rows in the same
    match within ``time_window_ms``. Score each candidate pair by
    ``dt_ms + dist * distance_weight`` (lower = better). Keep only rows that
    are simultaneously the best candidate from both the killer's and the
    victim's perspective — a cheap bipartite-matching approximation that
    avoids double-counting without requiring an optimisation solver.
    """
    sql = f"""
    CREATE OR REPLACE TABLE pairs AS
    WITH
    killer_events AS (
        SELECT
            rowid AS kr,
            match_id, map_id, day, user_id, is_bot,
            ts, rel_ts, duration_ms,
            x, z, px, py, event
        FROM events
        WHERE event IN ('Kill', 'BotKill')
    ),
    victim_events AS (
        SELECT
            rowid AS vr,
            match_id, user_id, is_bot,
            ts, rel_ts,
            x, z, px, py, event
        FROM events
        WHERE event IN ('Killed', 'BotKilled')
    ),
    candidates AS (
        SELECT
            k.match_id, k.map_id, k.day,
            k.kr, v.vr,
            k.user_id   AS killer_id,
            v.user_id   AS victim_id,
            k.is_bot    AS killer_is_bot,
            v.is_bot    AS victim_is_bot,
            k.ts        AS killer_ts,
            v.ts        AS victim_ts,
            ABS(k.ts - v.ts) AS dt_ms,
            k.rel_ts    AS killer_rel_ts,
            v.rel_ts    AS victim_rel_ts,
            k.duration_ms,
            k.x AS killer_x, k.z AS killer_z, k.px AS killer_px, k.py AS killer_py,
            v.x AS victim_x, v.z AS victim_z, v.px AS victim_px, v.py AS victim_py,
            sqrt(power(k.x - v.x, 2) + power(k.z - v.z, 2)) AS dist
        FROM killer_events k
        JOIN victim_events v
          ON k.match_id = v.match_id
         AND ABS(k.ts - v.ts) <= {time_window_ms}
         AND k.user_id <> v.user_id
    ),
    scored AS (
        SELECT
            *,
            dt_ms + dist * {distance_weight} AS score,
            CASE
                WHEN     killer_is_bot AND     victim_is_bot THEN 'B->B'
                WHEN     killer_is_bot AND NOT victim_is_bot THEN 'B->H'
                WHEN NOT killer_is_bot AND     victim_is_bot THEN 'H->B'
                ELSE 'H->H'
            END AS combo,
            row_number() OVER (PARTITION BY kr ORDER BY dt_ms + dist * {distance_weight}, vr) AS k_rank,
            row_number() OVER (PARTITION BY vr ORDER BY dt_ms + dist * {distance_weight}, kr) AS v_rank
        FROM candidates
    )
    SELECT
        match_id, map_id, day,
        killer_id, victim_id,
        killer_is_bot, victim_is_bot, combo,
        killer_ts, victim_ts, dt_ms,
        killer_rel_ts, victim_rel_ts, duration_ms,
        killer_x, killer_z, victim_x, victim_z,
        killer_px, killer_py, victim_px, victim_py,
        dist
    FROM scored
    WHERE k_rank = 1 AND v_rank = 1;
    """
    con.execute(sql)
    (n,) = con.execute("SELECT COUNT(*) FROM pairs").fetchone() or (0,)
    log.info(
        "Built pairs table with %d rows (window=%dms, distance_weight=%s)",
        n,
        time_window_ms,
        distance_weight,
    )


def export_per_map_pairs(
    con: duckdb.DuckDBPyConnection, out_dir: Path
) -> dict[str, int]:
    """Write one ``pairs_{slug}.parquet`` per map. Returns {map_id: row_count}."""
    out_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}
    cols = ", ".join(PAIRS_COLUMNS)

    for map_id, slug in MAP_SLUG.items():
        path = out_dir / f"pairs_{slug}.parquet"
        con.execute(
            f"""
            COPY (
                SELECT {cols}
                FROM pairs
                WHERE map_id = '{map_id}'
                ORDER BY match_id, killer_ts
            )
            TO '{path.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD);
            """
        )
        (n,) = con.execute(
            f"SELECT COUNT(*) FROM pairs WHERE map_id = '{map_id}'"
        ).fetchone() or (0,)
        counts[map_id] = n
        log.info("Wrote %s (%d rows)", path.name, n)

    return counts
