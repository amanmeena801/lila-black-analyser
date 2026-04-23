"""Command-line entry point for the build-time pipeline.

Usage
-----
    python -m pipeline.cli build --source ../data/raw/player_data --out ../web/public/data
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

import duckdb

from . import enrich, export, ingest, pairing

log = logging.getLogger("pipeline")


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="pipeline", description="LILA BLACK data pipeline")
    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="Run the full build-time pipeline")
    build.add_argument(
        "--source",
        required=True,
        type=Path,
        help="Root of raw data (contains February_XX folders).",
    )
    build.add_argument(
        "--out",
        required=True,
        type=Path,
        help="Output directory for per-map parquet + manifest.json.",
    )
    build.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable DEBUG-level logging.",
    )
    return parser.parse_args(argv)


def _configure_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        level=level,
    )


def cmd_build(source: Path, out: Path) -> int:
    log.info("Source: %s", source.resolve())
    log.info("Output: %s", out.resolve())

    files = ingest.discover_files(source)

    con = duckdb.connect(":memory:")
    ingest.load_raw_events(con, files)
    enrich.build_events(con)
    enrich.build_matches_index(con)
    pairing.build_pairs(con)

    event_counts = export.export_per_map_events(con, out)
    export.export_matches_index(con, out)
    pair_counts = pairing.export_per_map_pairs(con, out)
    manifest = export.build_manifest(con, event_counts, pair_counts)
    export.write_manifest(manifest, out)

    total = sum(event_counts.values())
    pairs_total = sum(pair_counts.values())
    log.info(
        "Done. Total enriched events: %d across %d maps (%d killer→victim pairs)",
        total,
        len(event_counts),
        pairs_total,
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    _configure_logging(args.verbose)

    if args.command == "build":
        return cmd_build(args.source, args.out)

    log.error("Unknown command: %s", args.command)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
