/**
 * Load and memoise `/data/manifest.json`. The manifest drives the filter
 * sidebar (maps, days, event types, match counts).
 */

import { useEffect, useState } from 'react';

import { loadManifest } from '@/lib/queries';
import type { Manifest } from '@/lib/types';

interface UseManifestResult {
  manifest: Manifest | undefined;
  loading: boolean;
  error: Error | undefined;
}

export function useManifest(): UseManifestResult {
  const [manifest, setManifest] = useState<Manifest | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadManifest()
      .then((m) => {
        if (!cancelled) setManifest(m);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { manifest, loading, error };
}
