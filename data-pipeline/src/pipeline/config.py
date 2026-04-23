"""Static configuration: map coordinate systems, event catalogue, folder naming.

Any constant that is also consumed by the frontend is mirrored in
``web/src/lib/mapConfig.ts``. The invariants are enforced by the shared
coordinate-fixture test (``tests/test_coords.py``).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

# --------------------------------------------------------------------------- #
# Map coordinate systems                                                      #
# --------------------------------------------------------------------------- #


@dataclass(frozen=True, slots=True)
class MapConfig:
    """Parameters that map in-game world coordinates onto the 1024-px minimap."""

    scale: float
    origin_x: float
    origin_z: float
    image_px: int = 1024


MAP_CONFIG: dict[str, MapConfig] = {
    "AmbroseValley": MapConfig(scale=900, origin_x=-370, origin_z=-473),
    "GrandRift": MapConfig(scale=581, origin_x=-290, origin_z=-290),
    "Lockdown": MapConfig(scale=1000, origin_x=-500, origin_z=-500),
}


# Slug used in output filenames and URL paths. Keep lowercase-snake for CDN hygiene.
MAP_SLUG: dict[str, str] = {
    "AmbroseValley": "ambrose_valley",
    "GrandRift": "grand_rift",
    "Lockdown": "lockdown",
}


# --------------------------------------------------------------------------- #
# Event catalogue                                                             #
# --------------------------------------------------------------------------- #

EVENT_TYPES: tuple[str, ...] = (
    "Position",
    "BotPosition",
    "Kill",
    "Killed",
    "BotKill",
    "BotKilled",
    "KilledByStorm",
    "Loot",
)


# --------------------------------------------------------------------------- #
# Source-folder → calendar date                                               #
# --------------------------------------------------------------------------- #

DAY_FOLDERS: dict[str, date] = {
    "February_10": date(2026, 2, 10),
    "February_11": date(2026, 2, 11),
    "February_12": date(2026, 2, 12),
    "February_13": date(2026, 2, 13),
    "February_14": date(2026, 2, 14),
}
