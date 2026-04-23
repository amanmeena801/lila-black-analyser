# Data Pipeline

Build-time ETL that turns the raw `.nakama-0` parquet files into web-ready artifacts (per-map enriched parquet + a small `manifest.json`) consumed by the React SPA via DuckDB-WASM.

## Run

From the repo root:

```bash
make pipeline
```

Or directly:

```bash
cd data-pipeline
python -m pipeline.cli build \
  --source ../data/raw/player_data \
  --out ../web/public/data
```

## What it emits

| File | Purpose |
|---|---|
| `web/public/data/manifest.json` | Catalogue: maps, days, match counts, event types, duration bounds |
| `web/public/data/events_ambrose_valley.parquet` | Enriched events, one file per map |
| `web/public/data/events_grand_rift.parquet` | … |
| `web/public/data/events_lockdown.parquet` | … |
| `web/public/data/matches_index.parquet` | One row per match: map, day, duration, event counts |

## Enrichment applied

- `event` decoded from bytes → string.
- `is_bot` derived from `user_id` (numeric-only = bot).
- `day` derived from source folder (`February_10` → `2026-02-10`).
- `match_start_ts`, `match_end_ts`, `duration_ms`, `rel_ts` computed per match.
- `(px, py)` pre-computed via `worldToPixel` (see `pipeline/config.py`).

## Tests

```bash
pytest        # all tests
pytest -k coords       # only coord conversion tests
```

`tests/test_coords.py` additionally writes `fixtures/coord_cases.json`, which the TypeScript tests in `web/src/__tests__/coords.test.ts` consume to guarantee the two implementations stay in sync.
