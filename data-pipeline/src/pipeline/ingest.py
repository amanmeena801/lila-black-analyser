"""Discover raw parquet files on disk and load them into DuckDB.

The raw dataset is ~1,243 files organised as ``player_data/February_XX/``.
Each file is a parquet table with a single-player journey. We materialise
the full dataset into one DuckDB table named ``raw_events`` so later
enrichment can run in SQL.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import duckdb

from .config import DAY_FOLDERS

log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class RawFile:
    path: Path
    day_folder: str  # e.g. "February_10"


def discover_files(source_root: Path) -> list[RawFile]:
    """Walk the raw data root, return every parquet file with its day folder.

    Files without an extension are parquet by convention in this dataset.
    """
    if not source_root.is_dir():
        raise FileNotFoundError(f"Source root not found: {source_root}")

    files: list[RawFile] = []
    for day_folder in DAY_FOLDERS:
        day_dir = source_root / day_folder
        if not day_dir.is_dir():
            log.warning("Day folder missing, skipping: %s", day_dir)
            continue
        for entry in sorted(day_dir.iterdir()):
            if entry.is_file():
                files.append(RawFile(path=entry, day_folder=day_folder))

    if not files:
        raise RuntimeError(f"No raw files discovered under {source_root}")

    log.info("Discovered %d raw files across %d day folders", len(files), len(DAY_FOLDERS))
    return files


def load_raw_events(con: duckdb.DuckDBPyConnection, files: list[RawFile]) -> None:
    """Load every raw file into a single ``raw_events`` DuckDB table.

    We emit a ``day_folder`` column up front so :mod:`enrich` can derive the
    ``day`` date without re-parsing paths.
    """
    if not files:
        raise ValueError("load_raw_events called with no files")

    # Build a UNION ALL across day folders so each slice carries its folder name.
    unions: list[str] = []
    for folder in DAY_FOLDERS:
        folder_files = [f for f in files if f.day_folder == folder]
        if not folder_files:
            continue
        paths_sql = ", ".join(f"'{p.path.as_posix()}'" for p in folder_files)
        unions.append(
            f"SELECT '{folder}' AS day_folder, * FROM read_parquet([{paths_sql}])"
        )

    sql = f"CREATE OR REPLACE TABLE raw_events AS {' UNION ALL '.join(unions)};"
    con.execute(sql)

    (count,) = con.execute("SELECT COUNT(*) FROM raw_events").fetchone() or (0,)
    log.info("Loaded %d raw event rows into raw_events", count)
