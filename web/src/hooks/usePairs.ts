/**
 * Run a PairSpec through the Kill Feed query and expose the rows.
 *
 * Structurally identical to :func:`useEvents` — same debounce, same
 * cancellation semantics — so the time slider drives both views
 * consistently. Keep them in sync if one changes.
 */

import { useEffect, useRef, useState } from 'react';

import { queryPairs } from '@/lib/queries';
import type { PairRow, PairSpec } from '@/lib/types';

interface UsePairsResult {
  pairs: PairRow[];
  loading: boolean;
  error: Error | undefined;
}

const DEBOUNCE_MS = 60;

export function usePairs(spec: PairSpec): UsePairsResult {
  const [pairs, setPairs] = useState<PairRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const key = JSON.stringify(spec);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      queryPairs(spec)
        .then((rows) => {
          if (!cancelled) setPairs(rows);
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { pairs, loading, error };
}
