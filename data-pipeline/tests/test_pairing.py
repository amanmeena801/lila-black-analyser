"""Unit tests for :mod:`pipeline.pairing`.

The pairing layer is a heuristic — we don't try to prove correctness on
real-world data, but we do pin down the invariants the Kill Feed UI relies
on:

* every matched row represents a *distinct* killer_id/victim_id pair
  (self-pairs are rejected),
* ties are broken by temporal then spatial proximity,
* no victim is claimed by two killers and vice versa,
* the ``combo`` column encodes the four actor-type permutations exactly.
"""

from __future__ import annotations

import duckdb
import pytest

from pipeline.pairing import build_pairs

EVENTS_DDL = """
CREATE OR REPLACE TABLE events (
    user_id       VARCHAR,
    match_id      VARCHAR,
    map_id        VARCHAR,
    x             DOUBLE,
    y             DOUBLE,
    z             DOUBLE,
    ts            BIGINT,
    event         VARCHAR,
    is_bot        BOOLEAN,
    day           DATE,
    match_start_ts BIGINT,
    match_end_ts   BIGINT,
    duration_ms   BIGINT,
    rel_ts        BIGINT,
    px            DOUBLE,
    py            DOUBLE
);
"""


def _insert(
    con: duckdb.DuckDBPyConnection,
    *,
    user_id: str,
    match_id: str,
    event: str,
    ts: int,
    x: float = 0.0,
    z: float = 0.0,
    is_bot: bool = False,
    map_id: str = "AmbroseValley",
    duration_ms: int = 300_000,
) -> None:
    con.execute(
        """
        INSERT INTO events VALUES (
            ?, ?, ?, ?, 0.0, ?, ?, ?, ?, DATE '2026-02-10',
            0, ?, ?, ?, 0.0, 0.0
        )
        """,
        [
            user_id,
            match_id,
            map_id,
            x,
            z,
            ts,
            event,
            is_bot,
            duration_ms,
            duration_ms,
            ts,  # rel_ts — treat ts as already relative for the test fixture
        ],
    )


@pytest.fixture()
def con() -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(":memory:")
    conn.execute(EVENTS_DDL)
    return conn


def test_clean_one_to_one_pair(con: duckdb.DuckDBPyConnection) -> None:
    """A single Kill and matching Killed within the window → one pair."""
    _insert(con, user_id="alice", match_id="m1", event="Kill",
            ts=1_000, x=10, z=10, is_bot=False)
    _insert(con, user_id="bob", match_id="m1", event="Killed",
            ts=1_050, x=12, z=11, is_bot=False)

    build_pairs(con)
    rows = con.execute(
        "SELECT killer_id, victim_id, combo, dt_ms FROM pairs"
    ).fetchall()
    assert len(rows) == 1
    killer_id, victim_id, combo, dt_ms = rows[0]
    assert killer_id == "alice"
    assert victim_id == "bob"
    assert combo == "H->H"
    assert dt_ms == 50


def test_self_pairing_rejected(con: duckdb.DuckDBPyConnection) -> None:
    """Two events from the same user cannot pair even if they satisfy the window."""
    _insert(con, user_id="alice", match_id="m1", event="Kill", ts=1_000)
    _insert(con, user_id="alice", match_id="m1", event="Killed", ts=1_020)

    build_pairs(con)
    (n,) = con.execute("SELECT COUNT(*) FROM pairs").fetchone()
    assert n == 0


def test_ambiguous_kills_prefer_nearest(con: duckdb.DuckDBPyConnection) -> None:
    """When one victim is in-window with two killers, the spatially closer one wins."""
    # Two killer candidates, same match, same ts; victim is much nearer to `near_killer`.
    _insert(con, user_id="near_killer", match_id="m1", event="Kill",
            ts=1_000, x=100, z=100)
    _insert(con, user_id="far_killer", match_id="m1", event="BotKill",
            ts=1_000, x=500, z=500)
    _insert(con, user_id="victim", match_id="m1", event="Killed",
            ts=1_020, x=101, z=101)

    build_pairs(con)
    rows = con.execute(
        "SELECT killer_id, victim_id FROM pairs"
    ).fetchall()
    # Exactly one winner; it must be the closer killer.
    assert rows == [("near_killer", "victim")]


def test_out_of_window_not_paired(con: duckdb.DuckDBPyConnection) -> None:
    """Killer and victim 5 s apart → no pair emitted."""
    _insert(con, user_id="alice", match_id="m1", event="Kill", ts=1_000)
    _insert(con, user_id="bob", match_id="m1", event="Killed", ts=6_500)

    build_pairs(con)
    (n,) = con.execute("SELECT COUNT(*) FROM pairs").fetchone()
    assert n == 0


def test_each_killer_and_victim_appears_once(con: duckdb.DuckDBPyConnection) -> None:
    """Two kills, two victims — each side is consumed by exactly one pair."""
    # Two distinct killers, two distinct victims. Times chosen so the greedy
    # score assigns each killer to its temporally nearer victim.
    _insert(con, user_id="k1", match_id="m1", event="Kill", ts=1_000, x=0, z=0)
    _insert(con, user_id="k2", match_id="m1", event="Kill", ts=2_000, x=0, z=0)
    _insert(con, user_id="v1", match_id="m1", event="Killed", ts=1_040, x=0, z=0)
    _insert(con, user_id="v2", match_id="m1", event="Killed", ts=2_060, x=0, z=0)

    build_pairs(con)
    rows = con.execute(
        "SELECT killer_id, victim_id FROM pairs ORDER BY killer_id"
    ).fetchall()
    assert rows == [("k1", "v1"), ("k2", "v2")]

    # One-to-one — counts match across both sides.
    (ku,) = con.execute("SELECT COUNT(DISTINCT killer_id) FROM pairs").fetchone()
    (vu,) = con.execute("SELECT COUNT(DISTINCT victim_id) FROM pairs").fetchone()
    assert ku == 2 and vu == 2


def test_combo_encodes_actor_permutations(con: duckdb.DuckDBPyConnection) -> None:
    """Verify all four H/B combos round-trip through the pairing layer."""
    fixtures = [
        # (combo, killer_is_bot, victim_is_bot, killer_event, victim_event)
        ("H->H", False, False, "Kill", "Killed"),
        ("H->B", False, True,  "BotKill", "BotKilled"),
        ("B->H", True,  False, "BotKill", "Killed"),
        ("B->B", True,  True,  "BotKill", "BotKilled"),
    ]
    for i, (_combo, k_bot, v_bot, k_event, v_event) in enumerate(fixtures):
        mid = f"match_{i}"
        _insert(con, user_id=f"k{i}", match_id=mid, event=k_event,
                ts=1_000, x=0, z=0, is_bot=k_bot)
        _insert(con, user_id=f"v{i}", match_id=mid, event=v_event,
                ts=1_050, x=5, z=5, is_bot=v_bot)

    build_pairs(con)
    got = dict(
        con.execute("SELECT match_id, combo FROM pairs ORDER BY match_id").fetchall()
    )
    expected = {f"match_{i}": combo for i, (combo, *_rest) in enumerate(fixtures)}
    assert got == expected


def test_different_matches_do_not_cross_pair(con: duckdb.DuckDBPyConnection) -> None:
    """Killer in m1 and victim in m2 must never pair, even with perfect ts overlap."""
    _insert(con, user_id="alice", match_id="m1", event="Kill", ts=1_000)
    _insert(con, user_id="bob", match_id="m2", event="Killed", ts=1_000)

    build_pairs(con)
    (n,) = con.execute("SELECT COUNT(*) FROM pairs").fetchone()
    assert n == 0
