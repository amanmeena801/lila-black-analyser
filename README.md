# LILA BLACK — Visual Level Analyser

An internal tool for the LILA BLACK level-design team. It turns five days
of raw gameplay telemetry into answers about each map — in seconds,
without writing a line of SQL.

**Open it →** <https://gamelevelanalyser.netlify.app/>

---

## Why this exists

Level designers iterate faster when they can see what actually happened on
their maps. Today that answer lives in parquet dumps on someone's laptop,
and getting to a kill heatmap means pinging an engineer. This tool turns
those dumps into a browser page a designer can drive themselves.

In the live tool, a designer can:

- See where players kill and where they die on each map, as a heatmap or
  as individual points.
- See where loot is getting picked up — and, critically, where it isn't.
- Watch traffic density build up over a match to find the corridors
  players actually use.
- Scrub any single match from drop to final circle with a time slider, or
  play it back at 2× / 10× speed.
- Open the Kill Feed panel to see killer → victim pairings drawn as lines
  across the map.
- Flip between the three maps (Ambrose Valley, Grand Rift, Lockdown) and
  five days of data (Feb 10–14) without a reload.

All of it sits on top of the map's own minimap, with pinch-zoom and
two-finger pan.

## What's in this repo

- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** — one-page overview of how the
  tool is built, how the data flows, and the major tradeoffs. Written for
  people who own a product, not a codebase.
- **[INSIGHTS.md](docs/INSIGHTS.md)** — three findings I pulled out of the data
  using the tool itself. Each one ties back to a specific decision a level
  designer could make on their next iteration.
- **[docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md)** — the full, long-form
  design doc if you want the receipts.
- **[docs/DATA_ANOMALIES.md](docs/DATA_ANOMALIES.md)** — every quirk in
  the raw dump and how the pipeline handles it.
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — how Netlify rebuilds the
  site on every push and why the data artifacts are committed to git.

## Using the live tool

Just open <https://gamelevelanalyser.netlify.app/>. Nothing to install, no
login, no backend. The first map you pick downloads ~10 MB of cleaned data
into your browser and caches it for a year; everything after that is
instant.

## Running it on your laptop (for engineers)

If you want to run it locally, say against a fresh data dump:

```sh
make setup            # one-time — installs Python + Node deps
make pipeline         # processes data/raw/player_data → cleaned per-map files
make dev              # opens http://localhost:5173
```

Prereqs: Python 3.11+, Node 20+, pnpm 9+ (a `corepack enable` takes care
of pnpm). Unzip `player_data.zip` into `data/raw/` first.

No environment variables are required. The tool is fully self-contained
— `.env` files are gitignored in case downstream users want to add
secrets later, but v1 doesn't need any.

### Tests, lint, typecheck

```sh
make test             # pytest + vitest
make lint             # ruff + eslint
make typecheck        # mypy + tsc
```

GitHub Actions runs all three on every push and pull request.

### Production build (what Netlify runs)

```sh
make build            # pipeline + vite build → web/dist
cd web && pnpm preview   # serves web/dist at http://localhost:4173
```

## Tech stack (one line)

React + TypeScript + Vite SPA, Plotly.js for the map overlays, DuckDB-WASM
to query Apache Parquet in the browser, Python 3.11 + DuckDB for the
build-time ETL, Tailwind for styling, Zustand for state, Netlify for
hosting, GitHub Actions for CI. Why each one was picked is in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Deployment

Pushes to `main` auto-deploy to Netlify. The cleaned data artifacts (~2 MB
total) are committed to the repo so the build stays Python-free and under
60 seconds — see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the
rationale and a first-time Netlify setup walkthrough.

## Repo layout

```
.
├── ARCHITECTURE.md      One-page overview
├── INSIGHTS.md          Three findings about the game
├── README.md            You are here
├── Makefile             Single entry-point: make setup | pipeline | dev | build | test
├── netlify.toml         Build command + CDN cache headers + SPA fallback
├── data-pipeline/       Python build-time ETL
├── web/                 React SPA (what Netlify ships)
├── data/raw/            Gitignored — drop the unzipped player_data/ here
├── docs/                Extended design doc, ADRs, anomalies, deployment
└── scripts/             Build / verify helpers
```
