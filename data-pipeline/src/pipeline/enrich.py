"""Derive the columns the frontend needs, all in SQL for speed and clarity.

Input:  ``raw_events`` (produced by :mod:`ingest`)
Output: ``events`` (enriched) and ``matches`` (one row per match)

Derived columns on ``events``:

* ``event``            — decoded bytes → string
* ``is_bot``           — numeric ``user_id`` = bot, UUID = human
* ``day``              — ``DATE`` derived from the source folder name
* ``match_id_clean``   — ``match_id`` with the ``.nakama-0`` suffix stripped
* ``match_start_ts``   — min(ts) per match, as epoch-ms BIGINT
* ``match_end_ts``     — max(ts) per match, as epoch-ms BIGINT
* ``duration_ms``      — ``match_end_ts - match_start_ts``
* ``rel_ts``           — ``epoch_ms(ts) - match_start_ts``
* ``px``, ``py``       — minimap pixel coords (vectorised equivalent of :mod:`coords`)
"""

from __future__ import annotations

import logging

import duckdb

from .config import DAY_FOLDERS, MAP_CONFIG

log = logging.getLogger(__name__)


def _day_case_sql() -> str:
    """Build a CASE expression translating day_folder → DATE."""
    whens = "\n        ".join(
        f"WHEN day_folder = '{folder}' THEN DATE '{d.isoformat()}'"
        for folder, d in DAY_FOLDERS.items()
    )
    return f"CASE\n        {whens}\n    END"


def _pixel_case_sql(component: str) -> str:
    """Build a CASE expression for `px` or `py` using each map's config."""
    branches: list[str] = []
    for map_id, cfg in MAP_CONFIG.items():
        if component == "px":
            expr = f"((x - ({cfg.origin_x})) / {cfg.scale}) * {cfg.image_px}"
        elif component == "py":
            expr = f"(1.0 - ((z - ({cfg.origin_z})) / {cfg.scale})) * {cfg.image_px}"
        else:
            raise ValueError(f"Unknown component: {component}")
        branches.append(f"WHEN map_id = '{map_id}' THEN {expr}")
    return "CASE\n        " + "\n        ".join(branches) + "\n    END"


def build_events(con: duckdb.DuckDBPyConnection) -> None:
    """Create the enriched ``events`` table from ``raw_events``."""
    sql = f"""
    CREATE OR REPLACE TABLE events AS
    WITH decoded AS (
        SELECT
            user_id,
            REPLACE(match_id, '.nakama-0', '') AS match_id,
            map_id,
            CAST(x AS DOUBLE) AS x,
            CAST(y AS DOUBLE) AS y,
            CAST(z AS DOUBLE) AS z,
            epoch_ms(ts) AS ts_ms,
            CAST(event AS VARCHAR) AS event,
            regexp_matches(user_id, '^\\d+$') AS is_bot,
            {_day_case_sql()} AS day
        FROM raw_events
    ),
    match_bounds AS (
        SELECT
            match_id,
            MIN(ts_ms) AS match_start_ts,
            MAX(ts_ms) AS match_end_ts
        FROM decoded
        GROUP BY match_id
    )
    SELECT
        d.user_id,
        d.match_id,
        d.map_id,
        d.x, d.y, d.z,
        d.ts_ms AS ts,
        d.event,
        d.is_bot,
        d.day,
        m.match_start_ts,
        m.match_end_ts,
        (m.match_end_ts - m.match_start_ts)    AS duration_ms,
        (d.ts_ms - m.match_start_ts)           AS rel_ts,
        {_pixel_case_sql('px')}                AS px,
        {_pixel_case_sql('py')}                AS py
    FROM decoded d
    JOIN match_bounds m USING (match_id);
    """
    con.execute(sql)
    (n,) = con.execute("SELECT COUNT(*) FROM events").fetchone() or (0,)
    log.info("Built events table with %d rows", n)


def build_matches_index(con: duckdb.DuckDBPyConnection) -> None:
    """One row per (match_id, map_id, day) with summary stats."""
    sql = """
    CREATE OR REPLACE TABLE matches AS
    SELECT
        match_id,
        ANY_VALUE(map_id)                     AS map_id,
        ANY_VALUE(day)                        AS day,
        MIN(match_start_ts)                   AS match_start_ts,
        MAX(match_end_ts)                     AS match_end_ts,
        MAX(duration_ms)                      AS duration_ms,
        COUNT(*)                              AS event_count,
        COUNT(DISTINCT user_id) FILTER (WHERE NOT is_bot) AS human_count,
        COUNT(DISTINCT user_id) FILTER (WHERE is_bot)     AS bot_count,
        SUM(CASE WHEN event = 'Kill'          THEN 1 ELSE 0 END) AS kills,
        SUM(CASE WHEN event = 'Killed'        THEN 1 ELSE 0 END) AS killed,
        SUM(CASE WHEN event = 'BotKill'       THEN 1 ELSE 0 END) AS bot_kills,
        SUM(CASE WHEN event = 'BotKilled'     THEN 1 ELSE 0 END) AS bot_killed,
        SUM(CASE WHEN event = 'KilledByStorm' THEN 1 ELSE 0 END) AS storm_kills,
        SUM(CASE WHEN event = 'Loot'          THEN 1 ELSE 0 END) AS loot
    FROM events
    GROUP BY match_id;
    """
    con.execute(sql)
    (n,) = con.execute("SELECT COUNT(*) FROM matches").fetchone() or (0,)
    log.info("Built matches index with %d rows", n)
