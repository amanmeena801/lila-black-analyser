# LILA BLACK — Visual Level Analyser

An internal web tool for the LILA BLACK level-design team. It transforms
five days of raw gameplay telemetry into spatial insights about each map,
accessible through a browser without requiring SQL knowledge or engineering
support.

**Live deployment:** <https://gamelevelanalyser.netlify.app/>

---

## Purpose

Level designers depend on post-match data to validate and iterate on their
designs. Previously, that data existed only as parquet dumps that required
engineering assistance to query. This tool removes that dependency by
providing a self-serve interface in which designers can interrogate the
same telemetry directly on top of each map's minimap.

The tool supports the following workflows:

- Visualising where players kill and die on each map, as heatmaps or as
  individual event markers.
- Identifying loot distribution — where players pick items up, and which
  regions of the map are under-utilised.
- Observing player traffic density to surface the corridors and routes
  players rely on.
- Scrubbing any individual match from initial drop to final circle using a
  time slider, with optional 2× or 10× playback.
- Inspecting killer-to-victim pairings through a Kill Feed side panel,
  rendered as connection lines across the map.
- Switching between the three maps (Ambrose Valley, Grand Rift, Lockdown)
  and five days of data (February 10–14) without reloading.

All views render on top of each map's native minimap and support
pinch-zoom and two-finger pan.

## Repository contents

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — a one-page overview of the
  system, data flow, coordinate mapping, assumptions, and major
  engineering tradeoffs. Written to be approachable for a product
  audience.
- **[INSIGHTS.md](INSIGHTS.md)** — three findings derived from the data
  using the tool itself, each mapped to concrete level-design actions and
  the metrics they would affect.
- **[docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md)** — the complete
  long-form design document.
- **[docs/DATA_ANOMALIES.md](docs/DATA_ANOMALIES.md)** — a catalogue of
  irregularities in the raw data and how the pipeline resolves them.
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — Netlify build
  configuration, caching policy, and first-time setup instructions.

## Using the hosted application

Open <https://gamelevelanalyser.netlify.app/>. No installation, account,
or backend is required. Selecting a map downloads approximately 10 MB of
pre-processed data into the browser, cached aggressively on the CDN;
subsequent interactions are local and instantaneous.

## Running locally

For engineers working against a fresh data dump or iterating on the tool:

```sh
make setup            # Installs Python and Node dependencies
make pipeline         # Processes data/raw/player_data into cleaned per-map artifacts
make dev              # Starts the Vite dev server at http://localhost:5173
```

### Prerequisites

- Python 3.11 or later
- Node 20 or later
- pnpm 9 or later (available via `corepack enable`)
- The raw `player_data/` directory, extracted from `player_data.zip` into
  `data/raw/`

### Environment variables

None are required. The application is fully self-contained. A `.env`
pattern is reserved in `.gitignore` for future extensions.

### Tests, linting, type checking

```sh
make test             # pytest + vitest
make lint             # ruff + eslint
make typecheck        # mypy + tsc
```

GitHub Actions executes all three on every push and pull request.

### Production build

```sh
make build            # Runs the pipeline and produces web/dist/
cd web && pnpm preview   # Serves the production build at http://localhost:4173
```

## Technology stack

React with TypeScript and Vite for the single-page application, Plotly.js
for map overlay rendering, DuckDB-WASM for client-side parquet queries,
Tailwind CSS for styling, Zustand for state management, Python 3.11 with
DuckDB for the build-time ETL, Netlify for hosting, and GitHub Actions for
continuous integration. Rationale for each choice is documented in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Deployment

The `main` branch deploys automatically to Netlify on every push. Cleaned
data artifacts (approximately 2 MB in aggregate) are committed to the
repository so that Netlify builds remain Python-free and complete in under
60 seconds. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the complete
rationale and first-time configuration guidance.

## Repository layout

```
.
├── ARCHITECTURE.md      One-page system overview
├── INSIGHTS.md          Three data-backed findings
├── README.md            This document
├── Makefile             Single entry point: setup | pipeline | dev | build | test
├── netlify.toml         Build command, cache headers, SPA fallback
├── data-pipeline/       Python build-time ETL
├── web/                 React SPA deployed by Netlify
├── data/raw/            Gitignored — destination for the raw player_data/ dump
├── docs/                Extended design documentation, ADRs, and anomalies
└── scripts/             Build and verification helpers
```
