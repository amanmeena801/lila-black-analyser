# LILA BLACK — Visual Level Analyser

Interactive, browser-based tool for level designers to explore 5 days of **LILA BLACK** gameplay telemetry — heatmaps, kill/death distributions, movement paths and storm deaths on top of each map's minimap, with a time slider to scrub through any match.

See [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md) for the full design.

---

## Layout

```
.
├── data-pipeline/   Python build-time ETL: raw parquet → enriched per-map parquet
├── web/             React + Vite + DuckDB-WASM SPA (hosted on Netlify)
├── docs/            Design doc + ADRs
├── data/raw/        Gitignored. Drop the unzipped player_data/ here.
└── scripts/         Build/verify helpers
```

## Prerequisites

- Python 3.11+
- Node 20+ and pnpm 9+
- The `player_data/` folder (unzip `player_data.zip` into `data/raw/`)

## First-time setup

```bash
make setup            # pip install data-pipeline deps + pnpm install web deps
```

## Run locally

```bash
make pipeline         # processes data/raw/player_data → web/public/data/*.parquet + manifest.json
make dev              # starts the Vite dev server at http://localhost:5173
```

## Production build (what Netlify runs)

```bash
make build            # pipeline + vite build → web/dist/
```

## Tests

```bash
make test             # pytest + vitest
make lint             # ruff + eslint
make typecheck        # mypy + tsc --noEmit
```

## Deployment

Pushes to `main` auto-deploy on Netlify. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
