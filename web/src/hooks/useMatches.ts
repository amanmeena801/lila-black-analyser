/**
 * List all matches for the selected map (optionally filtered by day). Drives
 * the Match dropdown in the filter sidebar.
 */

import { useEffect, useState } from 'react';

import { listMatches } from '@/lib/queries';
import type { MapId, MatchMeta } from '@/lib/types';

interface UseMatchesResult {
  matches: MatchMeta[];
  loading: boolean;
  error: Error | undefined;
}

export function useMatches(map: MapId, day?: string): UseMatchesResult {
  const [matches, setMatches] = useState<MatchMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    listMatches(map, day)
      .then((rows) => {
        if (!cancelled) setMatches(rows);
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
  }, [map, day]);

  return { matches, loading, error };
}
