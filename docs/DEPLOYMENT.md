# Deployment

The site is a fully-static SPA hosted on Netlify. DuckDB-WASM fetches parquet
files from the same origin at runtime, so there is no backend to operate.

---

## Architecture

```
┌────────────────┐       ┌──────────────────────────┐
│  Browser       │──GET──▶  Netlify CDN             │
│  React + Vite  │       │    /index.html           │
│  DuckDB-WASM   │──GET──▶    /assets/*.js|wasm     │
│                │──GET──▶    /data/*.parquet       │
│                │──GET──▶    /minimaps/*.png|jpg   │
└────────────────┘       └──────────────────────────┘
```

All data is pre-computed at build time. Netlify never sees the raw
`player_data/` dump; the only artifacts it serves are what's committed to the
repo under `web/public/`.

## Build pipeline

Netlify runs the command in [`netlify.toml`](../netlify.toml):

```sh
corepack enable && cd web && pnpm install --frozen-lockfile && pnpm build
```

This is intentionally Python-free. The JSON/parquet artifacts must be
re-generated locally before any release that changes pipeline logic:

```sh
make pipeline       # regenerates web/public/data/*.parquet + manifest.json
git add web/public/data
git commit -m "Refresh pipeline artifacts"
git push origin main
```

## Why we commit the parquet

The artifact set is ~2MB total. Committing them:

- keeps Netlify builds fast (< 60s, all in JS land);
- avoids installing Python + DuckDB on the build server;
- gives us an exact, reviewable record of what shipped to any given deploy.

If the dataset grows beyond a few tens of MB, switch to:
1. Netlify's "file-based" Large Media, or
2. An object-store stage that syncs `web/public/data/` during the build.

## First-time Netlify setup

1. Connect the repo to a new Netlify site.
2. Build settings auto-populate from `netlify.toml`; no overrides needed.
3. Set production branch to `main`.
4. Verify the first deploy:
   - Check `/data/manifest.json` returns `{ "schema_version": 1, ... }`
   - Open the site, switch between maps — the three parquet fetches in the
     Network tab should all 200 with `Cache-Control: max-age=31536000, immutable`.

## Rollback

Netlify's deploy-list is the source of truth. Use "Publish deploy" on any
previous green deploy to roll back instantly; the parquet artifacts are
versioned along with the site, so data and code are always consistent.

## Local parity

To preview exactly what Netlify ships:

```sh
make build            # = pipeline + vite build
cd web && pnpm preview   # serves web/dist on :4173
```

## CI

GitHub Actions ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml))
runs on every push and PR:

- `data-pipeline`: ruff + mypy + pytest
- `web`: tsc + eslint + vitest + vite build

CI never deploys. Netlify is the only path to production.
