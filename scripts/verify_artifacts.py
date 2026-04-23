"""Post-build smoke checks for the web-ready artifacts.

Run after ``make pipeline``. Exits non-zero if anything looks wrong.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import duckdb

OUT = Path(__file__).resolve().parents[1] / "web" / "public" / "data"

EXPECTED_EVENT_TYPES = {
    "Position", "BotPosition", "Kill", "Killed",
    "BotKill", "BotKilled", "KilledByStorm", "Loot",
}


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    manifest = json.loads((OUT / "manifest.json").read_text())

    for map_id, info in manifest["maps"].items():
        parquet = OUT / f"events_{info['slug']}.parquet"
        if not parquet.exists():
            fail(f"missing parquet for {map_id}: {parquet}")

        con = duckdb.connect(":memory:")
        rows = con.execute(f"SELECT COUNT(*) FROM read_parquet('{parquet}')").fetchone()
        assert rows is not None
        (n,) = rows
        if n != info["events"]:
            fail(f"{map_id}: manifest says {info['events']} rows, parquet has {n}")

        # Columns
        cols = {c[0] for c in con.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{parquet}')"
        ).fetchall()}
        missing = {"user_id", "match_id", "map_id", "x", "y", "z", "ts", "event",
                   "is_bot", "day", "duration_ms", "rel_ts", "px", "py"} - cols
        if missing:
            fail(f"{map_id}: missing columns {missing}")

        # Every event type is one of the canonical 8
        seen = {r[0] for r in con.execute(
            f"SELECT DISTINCT event FROM read_parquet('{parquet}')"
        ).fetchall()}
        unknown = seen - EXPECTED_EVENT_TYPES
        if unknown:
            fail(f"{map_id}: unknown event types: {unknown}")

        # rel_ts is in [0, duration_ms] for every row
        bad = con.execute(
            f"""
            SELECT COUNT(*) FROM read_parquet('{parquet}')
            WHERE rel_ts < 0 OR rel_ts > duration_ms
            """
        ).fetchone()
        assert bad is not None
        if bad[0] != 0:
            fail(f"{map_id}: {bad[0]} rows with rel_ts outside [0, duration_ms]")

        # Pixel coords live in a plausible range (allow ±20% slop beyond [0, 1024])
        px_out = con.execute(
            f"""
            SELECT COUNT(*) FROM read_parquet('{parquet}')
            WHERE px < -200 OR px > 1224 OR py < -200 OR py > 1224
            """
        ).fetchone()
        assert px_out is not None
        off_map = px_out[0]
        pct = 100 * off_map / max(n, 1)
        print(f"  {map_id}: {n} rows · {pct:.1f}% px/py off-map (for info)")

        # is_bot coherence:
        #   HARD invariant: a BotPosition row must belong to a numeric (bot) user_id
        #   SOFT signal:    some numeric-id users emit 'Position' (human) events —
        #     documented dataset quirk (see docs/DATA_ANOMALIES.md). Warn only.
        wrong = con.execute(
            f"""
            SELECT
              SUM(CASE WHEN event = 'BotPosition' AND NOT is_bot THEN 1 ELSE 0 END),
              SUM(CASE WHEN event = 'Position'    AND     is_bot THEN 1 ELSE 0 END)
            FROM read_parquet('{parquet}')
            """
        ).fetchone()
        assert wrong is not None
        bot_pos_on_human, human_pos_on_bot = wrong
        if bot_pos_on_human:
            fail(f"{map_id}: {bot_pos_on_human} BotPosition rows assigned to non-bot user_id")
        if human_pos_on_bot:
            print(
                f"  WARN {map_id}: {human_pos_on_bot} Position rows on numeric-id users "
                "(see docs/DATA_ANOMALIES.md)"
            )

    _verify_pairs(manifest)
    print("OK: all artifacts verified.")


def _verify_pairs(manifest: dict) -> None:
    """Per-map sanity check on the Kill Feed ``pairs_*.parquet`` outputs."""
    for map_id, info in manifest["maps"].items():
        parquet = OUT / f"pairs_{info['slug']}.parquet"
        if not parquet.exists():
            fail(f"missing pairs parquet for {map_id}: {parquet}")

        con = duckdb.connect(":memory:")
        (n,) = con.execute(
            f"SELECT COUNT(*) FROM read_parquet('{parquet}')"
        ).fetchone()
        expected = info.get("pairs")
        if expected is not None and n != expected:
            fail(f"{map_id}: manifest says {expected} pairs, parquet has {n}")

        # Schema contract
        cols = {c[0] for c in con.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{parquet}')"
        ).fetchall()}
        missing = {
            "match_id", "map_id", "day",
            "killer_id", "victim_id", "killer_is_bot", "victim_is_bot", "combo",
            "killer_ts", "victim_ts", "dt_ms",
            "killer_rel_ts", "victim_rel_ts", "duration_ms",
            "killer_x", "killer_z", "victim_x", "victim_z",
            "killer_px", "killer_py", "victim_px", "victim_py", "dist",
        } - cols
        if missing:
            fail(f"{map_id}: pairs missing columns {missing}")

        if n == 0:
            print(f"  {map_id}: 0 pairs (skipping content checks)")
            continue

        # Self-pairs must never appear
        (self_pairs,) = con.execute(
            f"""
            SELECT COUNT(*) FROM read_parquet('{parquet}')
            WHERE killer_id = victim_id
            """
        ).fetchone()
        if self_pairs != 0:
            fail(f"{map_id}: {self_pairs} self-pairs leaked into pairs parquet")

        # combo values must be the canonical four
        combos = {r[0] for r in con.execute(
            f"SELECT DISTINCT combo FROM read_parquet('{parquet}')"
        ).fetchall()}
        unknown = combos - {"H->H", "H->B", "B->H", "B->B"}
        if unknown:
            fail(f"{map_id}: unknown combo values in pairs: {unknown}")

        # Time window invariant — dt_ms must be within the pipeline default (2s)
        (big_dt,) = con.execute(
            f"SELECT COUNT(*) FROM read_parquet('{parquet}') WHERE dt_ms > 2000"
        ).fetchone()
        if big_dt > 0:
            fail(f"{map_id}: {big_dt} pairs exceed TIME_WINDOW_MS of 2000ms")

        print(f"  {map_id}: {n} pairs across {len(combos)} combo(s)")


if __name__ == "__main__":
    main()
