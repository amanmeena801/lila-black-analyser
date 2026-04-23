# Architecture — one page

## What I built and why

A single web page: open the link, pick a map, and see heatmaps and kill
markers on top of the minimap. No login, no server to babysit. The whole
thing runs in the browser after one small data download.

I picked this shape because designers shouldn't have to install anything,
the five days of data (~50 MB) fits comfortably in a browser tab, and
hosting is free on Netlify with no backend to operate. If the dataset ever
grows past a few hundred MB this decision would need revisiting — today
it's the lever that makes the tool feel snappy.

## How data gets on screen

Raw dumps → cleaned once ahead of time → shipped with the website →
queried live in the browser.

1. **Clean-up step (Python, runs once before each deploy).** Reads the raw
   event files, fixes the known quirks (humans vs bots, match start/end,
   units), converts world coordinates into minimap pixel coordinates, and
   writes one compact file per map.
2. **Publish step (Netlify).** Every push to `main` bakes a new website and
   parks the cleaned files on a global CDN.
3. **Browser.** Picking a map downloads just that map's file (~10 MB).
   After that, every filter change — event type, day, time slider — is an
   in-memory lookup. No round-trips. That's why the UI feels "live" even
   though nothing is running on a server anywhere.

## Coordinate mapping — the tricky bit

Events arrive in world coordinates (meters). The minimap is a flat
1024×1024 picture. I needed to line them up per map.

The approach is the simplest thing that actually works: each map gets
three numbers — a world origin, a world scale, and the image size — and
the formula is a linear stretch plus a y-flip. I calibrated the numbers by
hand: on each map, pick two easily identifiable landmarks (airstrip
corners, building edges), read their world coordinates out of a sample
match's `Position` events, and solve for the origin + scale that lands
them on the right pixels. I then locked in a small shared test fixture
with ~10 known `(x, z) → (px, py)` pairs so the Python and TypeScript
sides both check against the same truth table and can't drift silently.

The gotcha: minimap images go y-down, world coordinates go y-up. That sign
flip is the single most common source of "why are all the kills on the
wrong side of the map" bugs. It's called out in comments on both sides and
covered in the fixtures.

## Assumptions where the data was ambiguous

| What was unclear | What I assumed / did |
|---|---|
| The `ts` column's real-world unit (ms? frames? ticks?) | Doesn't matter — I only use `ts − match_start_ts`, so the slider shows "match time" without claiming seconds |
| Match durations vary 24–68× on every map | Built a time slider, not an early/mid/late enum |
| `user_id` mixes UUIDs (humans) and numeric IDs (bots) | Anything all-numeric = bot |
| `Kill` records the killer's spot; `BotKill` records the bot victim's spot | Pipeline pairs them up so "kill zones" and "death zones" each mean exactly one thing |
| No explicit "match started" / "ended" events | Took the first and last event in each match |
| Very short matches (< 30 ms) look like broken rounds | Kept them in — designers might want to see hot-drop deaths; it's one filter away to exclude |
| Map names spelled inconsistently across files | Canonicalised once at ingest |

Full list is in `docs/DATA_ANOMALIES.md`.

## Major tradeoffs

| Decision | Alternative | Why this one |
|---|---|---|
| Run the query engine inside the browser | Spin up a backend API | Zero servers to operate; filter changes feel instant; the dataset fits in memory today |
| Commit the cleaned data files to git | Regenerate them on every Netlify build | Builds stay Python-free and under 60s; every deploy is a reviewable data snapshot |
| One all-in-one chart library | Specialised GL libs like deck.gl | Covers every v1 view with a single dependency; revisit when point counts go 10× |
| Time slider | Fixed early / mid / late buckets | Match durations vary too much — a slider is honest, presets give back the convenience |
| Pre-compute kill ↔ death pairings at build time | Join them on the fly in the browser | Cheap to do once; wasteful to redo on every UI click |
| Own the map's zoom/pan state in the app | Let the chart library manage its own | Gave us pinch, two-finger pan, click-drag pan, and +/−/reset buttons that all agree with each other |
