# Architecture — one-page overview

## What was built, and why

The level analyser is a single web app. A designer opens the URL, selects a map,
and sees heatmaps and kill markers rendered on top of the minimap. No
login is required and no backend service is operated; the application
runs in the browser after a one-time data download.

This shape was chosen for three reasons. First, level designers should
not have to install software to consult the data. Second, the five days
of telemetry (~50 MB) fits comfortably in a modern browser. Third,
static hosting on Netlify is free, instant to deploy, and has no
operational footprint. Should the dataset grow beyond several hundred
megabytes, this decision would warrant review; at the current scale it
is the primary driver of the tool's responsiveness.

## How data reaches the screen

The flow is three stages: raw data is cleaned once, ahead of time; the
resulting artifacts are published with the website; the browser queries
them locally on demand.

1. **Pre-processing (Python, build-time).** The pipeline reads the raw
   event files, normalises known data quirks (humans versus bots,
   inferred match start and end times, unit handling), converts world
   coordinates into minimap pixel coordinates, and writes one compact
   artifact per map.
2. **Publication (Netlify).** Every push to `main` triggers a build that
   rebuilds the site and distributes the cleaned artifacts on Netlify's
   global CDN with immutable caching.
3. **In-browser querying.** Selecting a map triggers a one-time download
   of approximately 10 MB for that map. All subsequent filter changes —
   event type, day, match, time slider — are resolved in memory without
   network round-trips. This is what allows the interface to remain
   responsive despite the absence of a backend.

## Coordinate mapping

Events are recorded in world coordinates (metres on the `x` and `z`
axes). Each minimap is a 1024×1024 image. The analyser must place every
event accurately on every map.

The approach is deliberately minimal: each map is described by three
constants — a world-space origin, a world-space scale, and the image
dimensions — and the transform is a linear stretch combined with a
vertical flip. Calibration was performed empirically: on each map, two
or more recognisable landmarks (runway corners, large buildings, map
boundaries) were identified both in a sample of `Position` events and on
the minimap image. The origin and scale were then solved to place those
landmarks at their correct pixel coordinates. A shared fixture of known
`(x, z) → (px, py)` cases is consumed by both the Python pipeline and
the TypeScript web client, guaranteeing that the two implementations
cannot diverge without failing CI.

One point deserves explicit mention: minimap images use a y-down
convention, whereas world coordinates use y-up. The vertical flip is the
most common source of silent mapping errors and is called out in
comments on both sides of the codebase, as well as covered by the
shared fixture.

## Assumptions made where the data was ambiguous

| Ambiguity in the raw data | Resolution |
|---|---|
| The `ts` column's real-world unit (milliseconds, ticks, or frames) is not documented | The tool uses `ts − match_start_ts` only, labelled "match time" on the slider, making the absolute unit irrelevant to the user |
| Match durations vary by a factor of 24–68 within a single map | The time slider operates on per-match duration, rather than a fixed early/mid/late enum |
| `user_id` mixes UUID strings (humans) and numeric strings (bots) with no explicit flag | A regex-based classifier derives an `is_bot` boolean during ingest |
| `Kill` records the killer's position; `BotKill` records the bot victim's position — the two events are not symmetrical | The pipeline joins them into explicit killer-to-victim pairs, so kill-zone and death-zone views each have unambiguous semantics |
| No explicit match-start or match-end events exist in the data | The first and last event per match are used to derive `match_start_ts`, `match_end_ts`, and `duration_ms` |
| A small number of matches have durations under 30 ms, likely representing incomplete rounds | These are retained — they may reveal hot-drop mortality — but can be filtered out in one click when the signal matters |
| Map names appear inconsistently across file paths (e.g. `GrandRift` vs `Grand_Rift`) | Canonicalised to PascalCase at ingest; filename slugs are handled separately |

A complete catalogue of anomalies and their handling is documented in
[`docs/DATA_ANOMALIES.md`](docs/DATA_ANOMALIES.md).

## Major tradeoffs

| Decision | Alternative considered | Rationale |
|---|---|---|
| Query the data in the browser with DuckDB-WASM | Operate a backend API | Eliminates server operation and cold-start latency; the dataset fits in memory; filter changes remain instantaneous |
| Commit cleaned data artifacts to the repository | Regenerate them on every Netlify build | Keeps the build Python-free and under 60 seconds; every deployment is an auditable snapshot of the data that shipped |
| Use a single general-purpose charting library (Plotly) | Adopt specialised WebGL libraries such as deck.gl | Covers every view requirement with a single dependency; worth revisiting only if point counts grow by an order of magnitude |
| Provide a continuous time slider | Use fixed early / mid / late phase buckets | Match durations vary too much for fixed buckets to be meaningful; presets at 33% / 66% / 100% restore the convenience |
| Pre-compute killer-to-victim pairings in the pipeline | Compute them on demand in the browser | Pairing is an `O(n²)` within-match self-join; performing it once at build time is far more efficient than repeating it on every filter change |
| Manage map viewport state inside the React application | Rely on the charting library's internal drag-pan state | A single controlled viewport lets pinch-zoom, two-finger pan, click-drag, and explicit zoom controls share one consistent state |
