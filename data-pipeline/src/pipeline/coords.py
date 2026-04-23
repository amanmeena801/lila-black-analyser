"""World-to-minimap coordinate transform.

This module is the single source of truth for the transform on the Python
side. A mirror lives at ``web/src/lib/coords.ts``; the two are kept in sync by
``tests/test_coords.py``, which exports canonical input/output pairs to
``fixtures/coord_cases.json`` for the frontend tests to consume.
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import MAP_CONFIG


@dataclass(frozen=True, slots=True)
class PixelCoord:
    """Result of projecting a world coordinate onto the minimap image."""

    px: float
    py: float


def world_to_pixel(map_id: str, x: float, z: float) -> PixelCoord:
    """Project a world ``(x, z)`` onto the 1024×1024 minimap pixel space.

    Parameters
    ----------
    map_id:
        One of ``AmbroseValley`` / ``GrandRift`` / ``Lockdown``.
    x, z:
        World coordinates. ``y`` is elevation and is ignored on purpose.

    Returns
    -------
    PixelCoord
        ``(px, py)`` in image pixel space. Origin is top-left; ``py`` is flipped.

    Raises
    ------
    KeyError
        If ``map_id`` is unknown.
    """
    cfg = MAP_CONFIG[map_id]
    u = (x - cfg.origin_x) / cfg.scale
    v = (z - cfg.origin_z) / cfg.scale
    return PixelCoord(px=u * cfg.image_px, py=(1.0 - v) * cfg.image_px)
