"""Canonical coordinate-conversion cases.

These cases exercise the world→pixel transform for each map. When the suite
runs, it also writes ``fixtures/coord_cases.json`` next to the test file so
the TypeScript tests (``web/src/__tests__/coords.test.ts``) can read exactly
the same inputs/outputs and prove the two implementations agree.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.config import MAP_CONFIG
from pipeline.coords import world_to_pixel

FIXTURE_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "coord_cases.json"


# Hand-picked plus corner cases per map. Each case is (map_id, x, z).
# Expected pixel values are recomputed from MAP_CONFIG in ``_recompute`` so the
# config file stays the single source of truth (rather than duplicating
# floating-point literals that drift).
CASES: list[tuple[str, float, float]] = [
    # AmbroseValley: scale=900, origin=(-370,-473), image=1024
    ("AmbroseValley", -370, -473),       # origin → top-left (0, 1024)
    ("AmbroseValley", 530, 427),         # far corner → bottom-right (1024, 0)
    ("AmbroseValley", -301.45, -355.55), # README example
    # GrandRift: scale=581, origin=(-290,-290), image=1024
    ("GrandRift", -290, -290),
    ("GrandRift", 291, 291),
    # Lockdown: scale=1000, origin=(-500,-500), image=1024
    ("Lockdown", -500, -500),
    ("Lockdown", 500, 500),
    ("Lockdown", 0, 0),                  # centre (512, 512)
]


def _recompute(map_id: str, x: float, z: float) -> tuple[float, float]:
    """Recompute expected px/py from MAP_CONFIG, so this file stays the source of truth."""
    cfg = MAP_CONFIG[map_id]
    u = (x - cfg.origin_x) / cfg.scale
    v = (z - cfg.origin_z) / cfg.scale
    return u * cfg.image_px, (1.0 - v) * cfg.image_px


@pytest.mark.parametrize("map_id, x, z", CASES)
def test_world_to_pixel_matches_expected(map_id: str, x: float, z: float) -> None:
    expected_px, expected_py = _recompute(map_id, x, z)
    result = world_to_pixel(map_id, x, z)
    assert result.px == pytest.approx(expected_px, abs=1e-6)
    assert result.py == pytest.approx(expected_py, abs=1e-6)


def test_unknown_map_raises() -> None:
    with pytest.raises(KeyError):
        world_to_pixel("Atlantis", 0, 0)


def test_export_fixture_for_web_tests() -> None:
    """Write the canonical cases out so the TS suite can consume identical IO."""
    cases = []
    for map_id, x, z in CASES:
        px, py = _recompute(map_id, x, z)
        cases.append({"map_id": map_id, "x": x, "z": z, "px": px, "py": py})

    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE_PATH.write_text(
        json.dumps({"schema": "coord_cases_v1", "cases": cases}, indent=2) + "\n",
        encoding="utf-8",
    )
    assert FIXTURE_PATH.exists()
