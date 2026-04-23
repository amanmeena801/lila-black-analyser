"""Smoke tests for the enrichment SQL.

We build a tiny synthetic in-memory raw_events table and run the real
``build_events`` / ``build_matches_index`` against it.
"""

from __future__ import annotations

import duckdb
import pytest

from pipeline.enrich import build_events, build_matches_index


@pytest.fixture()
def con() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(":memory:")
    # Minimal fixture: one match on AmbroseValley, two users (1 human, 1 bot)
    con.execute(
        """
        CREATE TABLE raw_events (
            user_id    VARCHAR,
            match_id   VARCHAR,
            map_id     VARCHAR,
            x          DOUBLE,
            y          DOUBLE,
            z          DOUBLE,
            ts         TIMESTAMP,
            event      BLOB,
            day_folder VARCHAR
        );
        INSERT INTO raw_events VALUES
          ('f4e072fa-b7af-4761-b567-1d95b7ad0108', 'm1.nakama-0', 'AmbroseValley',
             -301.45, 124.97, -355.55, TIMESTAMP '2026-02-10 12:00:00.000',
             'Position'::BLOB, 'February_10'),
          ('f4e072fa-b7af-4761-b567-1d95b7ad0108', 'm1.nakama-0', 'AmbroseValley',
             -300.0,  125.0,  -350.0,  TIMESTAMP '2026-02-10 12:00:00.500',
             'Kill'::BLOB,     'February_10'),
          ('1440', 'm1.nakama-0', 'AmbroseValley',
             -280.85, 121.62, -323.35, TIMESTAMP '2026-02-10 12:00:00.250',
             'BotPosition'::BLOB, 'February_10');
        """
    )
    return con


def test_build_events_derives_expected_columns(con: duckdb.DuckDBPyConnection) -> None:
    build_events(con)
    cols = {c[0] for c in con.execute("DESCRIBE events").fetchall()}
    for required in {
        "user_id", "match_id", "map_id", "x", "y", "z", "ts", "event",
        "is_bot", "day", "match_start_ts", "match_end_ts",
        "duration_ms", "rel_ts", "px", "py",
    }:
        assert required in cols, f"missing column {required}"

    # Human vs bot derivation
    is_bot_rows = con.execute(
        "SELECT user_id, is_bot FROM events ORDER BY user_id"
    ).fetchall()
    assert dict(is_bot_rows) == {
        "1440": True,
        "f4e072fa-b7af-4761-b567-1d95b7ad0108": False,
    }

    # `.nakama-0` suffix is stripped from match_id
    (match_id,) = con.execute("SELECT DISTINCT match_id FROM events").fetchone() or (None,)
    assert match_id == "m1"

    # rel_ts is 0 for the first event in the match and increasing
    rel_values = [r[0] for r in con.execute(
        "SELECT rel_ts FROM events ORDER BY ts"
    ).fetchall()]
    assert rel_values[0] == 0
    assert rel_values == sorted(rel_values)

    # Duration = end - start for all rows in the same match
    durs = {r[0] for r in con.execute("SELECT DISTINCT duration_ms FROM events").fetchall()}
    assert durs == {500}

    # event column is now text, not bytes
    events = {r[0] for r in con.execute("SELECT DISTINCT event FROM events").fetchall()}
    assert events == {"Position", "Kill", "BotPosition"}


def test_matches_index_counts(con: duckdb.DuckDBPyConnection) -> None:
    build_events(con)
    build_matches_index(con)
    row = con.execute(
        "SELECT event_count, human_count, bot_count, kills FROM matches"
    ).fetchone()
    assert row == (3, 1, 1, 1)
