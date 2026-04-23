# LILA BLACK — Visual Level Analyser
# Single entry point for common developer tasks. Keep this thin —
# delegate to per-subproject scripts rather than inlining logic here.

.PHONY: help setup pipeline dev build test lint typecheck clean

help:
	@echo "Targets:"
	@echo "  setup        install Python + Node deps"
	@echo "  pipeline     run data pipeline (raw parquet -> web/public/data)"
	@echo "  dev          run Vite dev server"
	@echo "  build        run pipeline + vite build (what Netlify runs)"
	@echo "  test         pytest + vitest"
	@echo "  lint         ruff + eslint"
	@echo "  typecheck    mypy + tsc --noEmit"
	@echo "  clean        remove build artifacts and generated data"

setup:
	cd data-pipeline && pip install -r requirements.txt
	cd web && pnpm install

pipeline:
	cd data-pipeline && python -m pipeline.cli build \
	  --source ../data/raw/player_data \
	  --out ../web/public/data

dev:
	cd web && pnpm dev

build: pipeline
	cd web && pnpm build

test:
	cd data-pipeline && pytest -q
	cd web && pnpm test --run

lint:
	cd data-pipeline && ruff check src tests
	cd web && pnpm lint

typecheck:
	cd data-pipeline && mypy src
	cd web && pnpm typecheck

clean:
	rm -rf web/dist web/public/data
	find data-pipeline -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
