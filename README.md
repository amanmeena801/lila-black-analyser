# LILA BLACK — Visual Game Level Analyser

An interactive, browser-based tool for level designers to explore five days of
**LILA BLACK** gameplay telemetry - heatmaps of kills, deaths, traffic, and
loot; kill-to-kill trajectories; storm-death progression — rendered on top of
each map's minimap, with a time slider to scrub through any match.

**Live deployment:** <https://gamelevelanalyser.netlify.app/>

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite 5 | Fast iteration, strict types, trivial static hosting |
| Styling | Tailwind CSS 3 | Utility-first — no CSS file to shepherd |
| State | Zustand | Tiny, hook-based; one filter store feeds every view |
| Visualization | Plotly.js (`scattergl` + `histogram2d`) | GL-accelerated scatter/heatmap with built-in pan/zoom |
| In-browser query | DuckDB-WASM | Full SQL against Parquet in the browser — no backend |
| Data artifacts | Apache Parquet + `manifest.json` | Columnar, compressible, streamable |
| Build-time ETL | Python 3.11 + DuckDB | One tool for parsing raw dumps and emitting Parquet |
| Hosting | Netlify (static + CDN) | Free, immutable deploys, cache headers via `netlify.toml` |
| CI | GitHub Actions | `ruff + mypy + pytest` for Python; `tsc + eslint + vitest + vite build` for web |

Full design notes live in [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md).
The one-page overview is [`ARCHITECTURE.md`](ARCHITECTURE.md).
Findings from using the tool are in [`INSIGHTS.md`](INSIGHTS.md).

---

## Repository layout

```
.
├── ARCHITECTURE.md      One-page overview of how the tool fits together
├── INSIGHTS.md          Three data-backed findings about the game
├── README.md            This file
├── Makefile             Single entry-point: `make setup | pipeline | dev | build | test`
├── netlify.toml         Build command + cache headers + SPA fallback
├── data-pipeline/       Python build-time ETL (raw parquet → enriched per-map parquet)
├── web/                 React + Vite + DuckDB-WASM SPA (what Netlify ships)
├── data/raw/            Gitignored — drop the unzipped `player_data/` dump here
├── docs/                Extended design doc, ADRs, deployment + anomalies notes
└── scripts/             Build / verify helpers
```

---

## Prerequisites

- Python 3.11 or later
- Node 20 or later, pnpm 9 or later (`corepack enable` will install it)
- The raw `player_data/` folder (unzip `player_data.zip` into `data/raw/`)

## Environment variables

None are required. The build is fully self-contained; Netlify reads the
commands and Node/pnpm versions from `netlify.toml`. `.env` files are
gitignored in case downstream users want to add secrets later.

## First-time setup

```bash
make setup            # pip install data-pipeline deps + pnpm install web deps
```

## Run locally

```bash
make pipeline         # data/raw/player_data → web/public/data/*.parquet + manifest.json
make dev              # starts the Vite dev server at http://localhost:5173
```

The pipeline is idempotent, so re-running it is cheap. You only need to re-run
it after raw data or pipeline logic changes. For day-to-day UI work, `make
dev` alone is enough once the artifacts exist.

## Production build (what Netlify runs)

```bash
make build            # pipeline + typecheck + vite build → web/dist
cd web && pnpm preview   # serves web/dist on http://localhost:4173
```

## Tests, lint, typecheck

```bash
make test             # pytest + vitest
make lint             # ruff + eslint
make typecheck        # mypy + tsc --noEmit
```

GitHub Actions runs all three on every push and pull request.

## Deployment

Pushes to `main` auto-deploy to Netlify. The parquet + `manifest.json`
artifacts are committed to the repo (~2 MB total) so Netlify never has to run
the Python pipeline — see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the
rationale and for a first-time Netlify setup walkthrough.
