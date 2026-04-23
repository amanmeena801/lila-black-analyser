import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// DuckDB-WASM ships workers and .wasm assets that Vite must treat as binary
// entries. We opt them into optimizeDeps.exclude so Vite doesn't pre-bundle
// and then fail to resolve their pthread imports.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  worker: {
    format: 'es',
  },
  test: {
    // Default to Node for pure-logic tests (coords, queries…). Component tests
    // that need the DOM override with a ``@vitest-environment jsdom`` pragma
    // and jsdom gets pulled in as a dev dep at that point.
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
