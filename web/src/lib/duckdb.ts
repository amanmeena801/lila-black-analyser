/**
 * DuckDB-WASM bootstrap.
 *
 * We ship our per-map parquet files as static assets and query them from the
 * browser with DuckDB-WASM. The bundle is selected automatically based on
 * whether the browser supports wasm-exceptions (faster) or not (MVP fallback).
 *
 * Call ``getDuckDb()`` from any code path; it memoises the heavy init work.
 * ``registerParquet()`` makes a remote parquet URL available as a virtual
 * file that ``read_parquet(...)`` queries can target.
 */

import * as duckdb from '@duckdb/duckdb-wasm';

// Vite resolves these `?url` imports to final bundled asset URLs.
import duckdb_wasm_mvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: { mainModule: duckdb_wasm_mvp, mainWorker: mvp_worker },
  eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker },
};

let dbPromise: Promise<duckdb.AsyncDuckDB> | undefined;

export function getDuckDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = initDuckDb();
  }
  return dbPromise;
}

async function initDuckDb(): Promise<duckdb.AsyncDuckDB> {
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  if (!bundle.mainWorker) {
    throw new Error('DuckDB bundle resolved without a worker URL');
  }
  const worker = new Worker(bundle.mainWorker, { type: 'module' });
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

const registered = new Map<string, Promise<void>>();

/**
 * Make a parquet available to DuckDB under a stable virtual filename.
 * Idempotent per (url, name) pair.
 */
export function registerParquet(url: string, name: string): Promise<void> {
  const key = `${name}::${url}`;
  const existing = registered.get(key);
  if (existing) return existing;

  const task = (async () => {
    const db = await getDuckDb();
    await db.registerFileURL(name, url, duckdb.DuckDBDataProtocol.HTTP, false);
  })();
  registered.set(key, task);
  return task;
}

/** Get a fresh connection. Callers should `close()` when done. */
export async function connect(): Promise<duckdb.AsyncDuckDBConnection> {
  const db = await getDuckDb();
  return db.connect();
}
