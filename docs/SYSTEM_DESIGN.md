# LILA BLACK — Visual Level Analyser

**System Design Document (v0.2)**
Author: Aman Meena · Date: 2026-04-21
Changes from v0.1: (1) retargeted for **Netlify static hosting**, (2) expanded **project structure** for professional, review-friendly code, (3) replaced `match_phase` enum with a **data-driven time slider** after confirming match durations are not fixed per map.

---

## 1. Overview & Goals

The Visual Level Analyser is an internal web tool for **level designers** to turn raw gameplay telemetry (parquet event logs) into actionable spatial insight about how players behave on each map.

**Primary goals**

1. Render player behavior as visual overlays on top of each map's minimap image.
2. Let designers slice the data by **map, day, match (session), event type, and in-match time**, all without writing code.
3. Ship as a **static site hosted on Netlify** — no backend servers to run.

**Non-goals for v1**

- Real-time / live match ingestion.
- Multi-user auth, sharing, saved dashboards in a DB.
- Statistical significance testing, ML-driven pattern detection.

---

## 2. Users & Primary Use Cases

**Primary user:** Level Designer — non-engineer, no SQL / Python expected.

**Representative questions the tool must answer in < 10 seconds:**

- "Show me all loot pickups on Ambrose Valley for Feb 10 as a heatmap."
- "For match `b71aaad8…`, scrub the timeline and show me every death up to time T."
- "Where do bots hang out versus where humans move on Grand Rift?"
- "Where does the storm kill people on Lockdown, and when during the match?"

---

## 3. Data Finding That Shapes the Design

**Question:** Does each map have a fixed gameplay duration?
**Answer (from scanning all 1,243 files):** No. Match durations vary 24–68× on every map.

| Map | Matches | Min (ts-ms) | P10 | Median | P90 | Max | Max/Min |
|---|---|---|---|---|---|---|---|
| AmbroseValley | 566 | 13 | 141 | 362 | 720 | 890 | **68.5×** |
| GrandRift | 59 | 30 | 165 | 422 | 689 | 732 | **24.4×** |
| Lockdown | 171 | 32 | 127 | 448 | 749 | 825 | **25.8×** |

Durations spread continuously across every bucket (not clustered at a canonical value).

**Implication:** the v0.1 "early / mid / late phase enum" was the wrong abstraction. The correct UX is a **dynamic time slider whose range is the actual duration of the currently selected match** (or, when aggregating across matches, a normalized 0–100% progress slider).

> *Note on units:* The stored `ts` column displays as absolute timestamps anchored near 1970-01-21 (≈1.77 billion ms). Within any single match the delta is consistent — call it "ts-ms units". We use `rel_ts = ts − match_start_ts` as the canonical in-match time for every view. The exact real-world unit doesn't matter for a visual slider.

---

## 4. Data Model

### 4.1 Source data

- ~89K events, 1,243 parquet files, 5 days (Feb 10–14 2026). Total ~50 MB on disk.
- Filename encodes `{user_id}_{match_id}.nakama-0`. UUID = human, numeric = bot.
- `event` column is `bytes` → decoded to UTF-8.
- `ts` is per-match absolute (see §3).

### 4.2 Canonical enriched schema (output of the data pipeline)

| Column | Type | Origin | Notes |
|---|---|---|---|
| `user_id` | VARCHAR | raw | |
| `match_id` | VARCHAR | raw (suffix stripped) | display-friendly |
| `map_id` | VARCHAR | raw | `AmbroseValley` / `GrandRift` / `Lockdown` |
| `x`, `y`, `z` | FLOAT | raw | world coords |
| `ts` | INT64 (ms) | raw | |
| `event` | VARCHAR | decoded | one of 8 types |
| `is_bot` | BOOLEAN | derived | `user_id` matches `^\d+$` |
| `day` | DATE | derived | from source folder |
| `match_start_ts`, `match_end_ts` | INT64 | derived per match | |
| `rel_ts` | INT32 (ms) | derived | `ts - match_start_ts` |
| `duration_ms` | INT32 | derived per match | `match_end - match_start` |
| `px`, `py` | FLOAT | derived | minimap pixel coords (§6.3) |

All derived columns are computed **once** by the Python pipeline and baked into the artifacts shipped to the browser. The frontend never recomputes them.

---

## 5. Hosting Architecture (Netlify)

### 5.1 Constraints this imposes

Netlify serves **static assets** from a CDN, plus lightweight **Netlify Functions** (AWS Lambda) for serverless endpoints. Practical constraints:

- No long-running backend (rules out Streamlit / FastAPI / persistent DuckDB).
- Functions have cold-start latency and a ~6 MB response-size cap — not where we want to put interactive querying.
- Best fit: **ship pre-processed data as static files on the CDN; do all querying client-side.**

### 5.2 Architecture chosen

```
 ┌──────────────────────────────────────────────────────────────┐
 │  Browser (React SPA)                                         │
 │  ├─ UI (React + Tailwind) — filters, canvas, slider, stats   │
 │  ├─ DuckDB-WASM        — SQL over parquet in-memory          │
 │  ├─ Plotly.js          — minimap overlay (heatmap/scatter/   │
 │  │                        trajectory)                        │
 │  └─ Filter store (Zustand) — single source of UI truth       │
 └──────────────────────────────┬───────────────────────────────┘
                  https (static assets over Netlify CDN)
 ┌──────────────────────────────▼───────────────────────────────┐
 │  Netlify static bucket  (deployed on every git push to main) │
 │  /minimaps/*                                                 │
 │  /data/manifest.json                                         │
 │  /data/events_ambrose_valley.parquet                         │
 │  /data/events_grand_rift.parquet                             │
 │  /data/events_lockdown.parquet                               │
 │  /data/matches_index.parquet                                 │
 │  /assets/*.js, /assets/*.css                                 │
 └──────────────────────────────▲───────────────────────────────┘
                                │ netlify build
 ┌──────────────────────────────┴───────────────────────────────┐
 │  Build-time data pipeline (Python)                           │
 │  scan parquet folders → enrich → export per-map parquet      │
 │  + manifest.json (days, matches, counts) to web/public/data  │
 └──────────────────────────────────────────────────────────────┘
```

**Why DuckDB-WASM on the client**

- Our dataset (~50 MB total, ~10–25 MB per map after projection) fits comfortably in browser memory.
- It gives us the same SQL API we'd use server-side, so query code is identical between pipeline tests and runtime.
- First load fetches the selected map's parquet; further filtering is instant (no round-trips).
- Aggressive Netlify CDN caching for the parquet files — once downloaded, the app is snappy.

### 5.3 Build & deploy flow (`netlify.toml`)

```toml
[build]
  base = "."
  publish = "web/dist"
  command = "make build"        # runs: (1) python pipeline, (2) vite build

[build.environment]
  NODE_VERSION = "20"
  PYTHON_VERSION = "3.11"

[[headers]]
  for = "/data/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
    Content-Type = "application/octet-stream"

[[headers]]
  for = "/minimaps/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

A root-level `Makefile` orchestrates: `make pipeline` → `make web` → `make build`. Keeps the Netlify build command a single line.

---

## 6. Core Modules

### 6.1 Data Pipeline (Python, build-time)

- **Input:** `data/raw/player_data/February_*/*.nakama-0` + `minimaps/*`.
- **Output:** `web/public/data/*.parquet` + `manifest.json`.
- **Steps:**
  1. Walk each day folder, enumerate files.
  2. Read parquet via `duckdb.read_parquet` (no `pyarrow` dep needed).
  3. Decode `event` (bytes→str); derive `is_bot`, `day`.
  4. Per-match aggregate pass: compute `match_start_ts`, `match_end_ts`, `duration_ms`, `rel_ts`.
  5. Vectorized `(x, z) → (px, py)` using §6.3.
  6. Partition by `map_id`, write one parquet per map.
  7. Emit a small `manifest.json`:
     ```json
     {
       "generated_at": "2026-04-21T12:00:00Z",
       "maps": {
         "AmbroseValley": {"events": 52000, "matches": 566, "days": ["2026-02-10", ...]},
         ...
       },
       "event_types": ["Position", "BotPosition", "Kill", ...]
     }
     ```
- **Determinism:** pipeline is idempotent, hash-checks outputs to skip unchanged files.

### 6.2 Query Layer (DuckDB-WASM, client)

A thin TypeScript wrapper exposing a single typed function:

```ts
type FilterSpec = {
  map: MapId;
  day?: string;          // 'YYYY-MM-DD'
  matchId?: string;
  eventTypes?: EventType[];
  isBot?: boolean;
  relTsMax?: number;     // slider value — include events with rel_ts <= this
  relTsRange?: [number, number]; // optional two-handle slider
};

async function queryEvents(spec: FilterSpec): Promise<EventRow[]>;
async function listMatches(map: MapId, day?: string): Promise<MatchMeta[]>;
```

All UI panels consume this API. Adding a filter is one clause in a SQL template.

### 6.3 Coordinate Transform (shared, typed)

Lives in *two* places that must stay in sync — covered by `tests/test_coords.py` that exports canonical test cases as JSON, then consumed by `web/src/lib/coords.test.ts`:

```
MAP_CONFIG = {
  AmbroseValley: { scale: 900,  origin_x: -370, origin_z: -473, image_px: 1024 },
  GrandRift:     { scale: 581,  origin_x: -290, origin_z: -290, image_px: 1024 },
  Lockdown:      { scale: 1000, origin_x: -500, origin_z: -500, image_px: 1024 },
}

function worldToPixel(map, x, z) {
  u = (x - origin_x) / scale
  v = (z - origin_z) / scale
  return { px: u * image_px, py: (1 - v) * image_px }
}
```

### 6.4 Time Slider Engine (REPLACES §5.4 phase engine from v0.1)

Two modes driven by filter state:

- **Match mode** (a single match is selected)
  - Slider range: `[0, duration_ms]` of that match (read from `matches_index`).
  - Slider value `T`: the UI renders only events where `rel_ts ≤ T`.
  - Optional **range mode** (dual handles `[T_lo, T_hi]`) for "show me the mid-game segment".
  - Optional **play/pause** button that advances `T` at 2× or 10× speed for animation.
- **Aggregate mode** (no match selected — one day or all days)
  - Slider is a **normalized 0–100% progress bar** across each match's duration.
  - A value of `0.3` means "events in each match where `rel_ts / duration_ms ≤ 0.3`".
  - This lets you ask "show loot in the first third of every Feb 10 match" without matches of different lengths distorting the result.

The old phase buckets (`early / mid / late`) become simple convenience presets on the slider (33% / 66% / 100%), not a hard-coded data column.

### 6.5 Visualization Layer

| Layer | Library | Used for |
|---|---|---|
| `HeatmapLayer` | `plotly.js` 2D density / histogram2d | Loot density, movement density |
| `ScatterLayer` | `plotly.js` scattergl | Kills, deaths, storm kills |
| `TrajectoryLayer` | `plotly.js` line shapes | Per-player paths when a single match is selected |

All layers are pure components that take a filtered `EventRow[]` + `MapId` and render into a single `MapCanvas`. The minimap PNG is an `<img>` background; overlays are plotted in pixel coordinates.

### 6.6 UI Layer (React)

Single-page layout. State lives in a **Zustand** store (`filterStore`) so the sidebar, canvas, and slider all read from one source of truth. No prop drilling.

---

## 7. Feature Design (requirement-by-requirement)

### 7.1 Loot Heatmap per map

- **Filter:** `event = 'Loot'` + selected map + day/match + `rel_ts ≤ slider`.
- **Render:** `HeatmapLayer` with perceptual colormap, ~40% alpha over the minimap.

### 7.2 Kill Distribution — Human and Bot

Where kills *originated* (killer position).

- **Events:** `Kill` (human→human), `BotKill` (human→bot).
- **UI toggles:** two layers with distinct colors; each can be switched on/off.
- **Render:** `ScatterLayer` default; `HeatmapLayer` when density is high.

### 7.3 Killed Positions — Human and Bot

Where players / bots *died*.

- **Events:** `Killed` (human died to human), `BotKilled` (human died to bot), plus `BotKill` rows (the bot's position when it died to a human).
- **UI:** four toggleable layers, distinct shapes/colors.

### 7.4 Player Movement — Human and Bot

- **Events:** `Position` (humans), `BotPosition` (bots).
- **Modes:**
  - **Density heatmap** — default, good for day-scale aggregates.
  - **Trajectories** — per-player polylines, only enabled when one match is selected.

### 7.5 Storm Deaths

- **Events:** `KilledByStorm`.
- **Render:** distinct-color scatter; point size optionally scaled to `rel_ts` so you see the storm's progression.
- **Bonus chart:** storm-kill count vs. `rel_ts` below the map (line chart).

### 7.6 Time-windowed insight (the slider in action)

With a single match selected:

- Drag slider left → see only early-game events (first N ms of match). Shows hot-drop chokepoints, initial deaths.
- Drag slider right toward the end → late-game events — final-circle fights, storm deaths, extractions.
- Use range mode to isolate the mid-game segment.
- Hit play → animate the match as events appear over time.

With no match selected: use normalized 0–100% slider to ask the same questions across a whole day's matches simultaneously.

---

## 8. Filters & Scopes

| Filter | Required | Notes |
|---|---|---|
| Map | Yes | Loads that map's parquet on selection |
| Day | No | `all` by default |
| Match | No | Requires a map; unlocks trajectories + absolute-time slider |
| Event types | Yes, multi-select | Sensible default per view |
| Human / Bot | Yes | Where applicable |
| Time slider | Yes | Absolute ms (match mode) or 0–100% (aggregate mode) |

---

## 9. Project Structure (clean, review-friendly)

```
lila-black-analyser/
├── README.md                     ← what, why, how to run
├── Makefile                      ← one entry: `make dev`, `make build`
├── netlify.toml                  ← build + headers + redirects
├── .gitignore
├── .editorconfig
├── .github/
│   └── workflows/
│       └── ci.yml                ← lint + typecheck + tests + build
│
├── docs/
│   ├── SYSTEM_DESIGN.md          ← this file
│   ├── DATA_SCHEMA.md            ← parquet schema + derived columns
│   ├── DEPLOYMENT.md             ← Netlify setup, env vars, cache rules
│   └── ADRs/                     ← architecture decision records
│       ├── 0001-netlify-static.md
│       ├── 0002-duckdb-wasm.md
│       └── 0003-time-slider-vs-phase.md
│
├── data-pipeline/                ← Python, runs at build time only
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── README.md
│   ├── src/
│   │   └── pipeline/
│   │       ├── __init__.py
│   │       ├── config.py         ← MAP_CONFIG, paths, constants
│   │       ├── ingest.py         ← scan folders, read parquet
│   │       ├── enrich.py         ← decode, is_bot, rel_ts, px/py
│   │       ├── export.py         ← write per-map parquet + manifest
│   │       └── cli.py            ← `python -m pipeline build`
│   ├── tests/
│   │   ├── test_ingest.py
│   │   ├── test_enrich.py
│   │   └── test_coords.py        ← exports coord fixtures for web tests
│   └── fixtures/
│       └── coord_cases.json      ← shared with web/
│
├── web/                          ← React SPA
│   ├── index.html
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── eslint.config.js
│   ├── .prettierrc
│   ├── public/
│   │   ├── minimaps/
│   │   │   ├── AmbroseValley.png
│   │   │   ├── GrandRift.png
│   │   │   └── Lockdown.jpg
│   │   └── data/                 ← output of data-pipeline (gitignored)
│   │       ├── manifest.json
│   │       ├── events_ambrose_valley.parquet
│   │       ├── events_grand_rift.parquet
│   │       ├── events_lockdown.parquet
│   │       └── matches_index.parquet
│   └── src/
│       ├── main.tsx              ← entry
│       ├── App.tsx               ← top-level layout
│       ├── lib/
│       │   ├── mapConfig.ts      ← mirrors pipeline/config.py
│       │   ├── coords.ts         ← worldToPixel
│       │   ├── duckdb.ts         ← duckdb-wasm bootstrap
│       │   ├── queries.ts        ← typed queryEvents / listMatches
│       │   └── types.ts          ← EventRow, MatchMeta, FilterSpec
│       ├── hooks/
│       │   ├── useEvents.ts
│       │   ├── useMatches.ts
│       │   └── useMinimap.ts
│       ├── components/
│       │   ├── layout/
│       │   │   ├── FilterSidebar.tsx
│       │   │   ├── StatsPanel.tsx
│       │   │   └── Topbar.tsx
│       │   ├── map/
│       │   │   ├── MapCanvas.tsx
│       │   │   └── Legend.tsx
│       │   ├── timeline/
│       │   │   └── TimeSlider.tsx
│       │   └── viz/
│       │       ├── HeatmapLayer.tsx
│       │       ├── ScatterLayer.tsx
│       │       └── TrajectoryLayer.tsx
│       ├── state/
│       │   └── filterStore.ts    ← Zustand
│       ├── styles/
│       │   └── index.css
│       └── __tests__/
│           ├── coords.test.ts
│           └── queries.test.ts
│
└── scripts/
    └── verify-build.sh            ← post-build smoke checks
```

### Conventions

- **Python:** `ruff` (lint + format), `mypy --strict`, `pytest`.
- **TypeScript:** `eslint` + `typescript-eslint`, `prettier`, `vitest`.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`).
- **Branches:** short-lived feature branches, PRs squashed to main.
- **Code review:** every PR has a checklist: tests pass, types clean, no TODOs without issues, no data-pipeline breakage.
- **ADRs** (`docs/ADRs/`): one per substantial decision so future-you understands *why*, not just *what*.
- **No dead files:** anything unused is deleted, not commented out.

---

## 10. UI Wireframe

```
┌────────────────────────────────────────────────────────────────────────┐
│  LILA BLACK — Visual Level Analyser                        [deploy-id] │
├─────────────────────┬────────────────────────────────────┬─────────────┤
│  FILTERS            │         MAP CANVAS                 │  STATS      │
│  ───────            │   (minimap PNG + overlay)          │  ─────      │
│  Map:   [Ambrose ▾] │                                    │ Events: N   │
│  Day:   [Feb 10  ▾] │     ┌──────────────────────┐       │ Matches: M  │
│  Match: [All     ▾] │     │                      │       │ Humans:  …  │
│                     │     │   heatmap/scatter/   │       │ Bots:    …  │
│  View:              │     │     trajectory       │       │             │
│   (•) Loot          │     │                      │       │ Top killer  │
│   ( ) Kills         │     │                      │       │ Top looter  │
│   ( ) Deaths        │     └──────────────────────┘       │             │
│   ( ) Movement      │                                    │ Match dur:  │
│   ( ) Storm         │     Legend                         │  462 ms     │
│                     │                                    │             │
│  [x] Humans [x]Bots │                                    │ Slider at:  │
│                     │                                    │  T = 210 ms │
│  [Export PNG]       │                                    │  (45% of    │
│                     │                                    │   match)    │
├─────────────────────┴────────────────────────────────────┴─────────────┤
│  TIME  [▶]  0 ms ──●────────────────────────── 462 ms      [■ range]   │
│              ↑ slider shows "events up to T = 210 ms"                   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Performance

- Dataset fits in-memory; all filtering happens in DuckDB-WASM — query latency is sub-100 ms for our scale.
- Per-map parquet size: 10–25 MB (gzip-over-the-wire via Netlify, cached for a year).
- **Heatmap guard:** if a query returns > 50K points, `HeatmapLayer` switches to coarser `histogram2d` instead of KDE.
- **Trajectory guard:** per-user polylines are only drawn when a single match is selected (max ~50 users per match).
- **React perf:** filter store is segmented so the slider doesn't re-render the stats panel.

---

## 12. Extensibility

- **New map:** add an entry to `MAP_CONFIG` (pipeline + web) + a minimap image. No code changes.
- **New event type:** no schema change — it shows up in the multiselect automatically via `manifest.json`.
- **Cohort view (future):** track one `user_id` across matches — trivial SQL once the pipeline is in place.
- **Diff view (future):** "Feb 10 vs Feb 14 loot heatmap side-by-side."
- **URL state:** filter store serializes to query params → shareable links.

---

## 13. Implementation Phases

| Phase | Scope | Outcome |
|---|---|---|
| P0 — Repo + pipeline (½ day) | Scaffold monorepo, write `data-pipeline` end-to-end, produce artifacts | `web/public/data/*.parquet` + manifest exist |
| P1 — Web shell (½ day) | Vite + React + Tailwind scaffold, filter store, DuckDB-WASM bootstrap, map loader | Map loads, filter sidebar wires up, empty canvas |
| P2 — Static views (1 day) | Heatmap + scatter layers; Loot, Kills, Deaths, Movement, Storm views | All 5 requirements visually working |
| P3 — Time slider (½ day) | Match-mode absolute slider + aggregate-mode normalized slider + play button | Time-based insights live |
| P4 — Polish & deploy (½ day) | Stats panel, legends, export PNG, Netlify deploy, CI | Public URL on Netlify |
| P5 (future) | Cohort view, diff view, URL state, saved views | Deepened analysis |

---

## 14. Open Questions

1. Is **one match per deep-link URL** important for shareable bookmarks in v1, or can that slide to v2?
2. Interactive hover tooltips (user_id, event, rel_ts) on every point — is Plotly.js good enough, or do we want deck.gl for larger datasets later?
3. Should the aggregate-mode time slider be **normalized 0–100%** (my recommendation) or use **absolute ts-ms** (forcing all matches to align at t=0)? The first is fairer; the second is simpler to explain.
4. Any private / PII concerns with shipping user_id UUIDs as static CDN files? (Internally fine; worth flagging.)
5. Do we want a dark theme? Level designers often prefer it.
