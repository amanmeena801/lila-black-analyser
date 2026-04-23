/**
 * Run the current FilterSpec against DuckDB-WASM and return the event rows.
 * Re-fires whenever the spec changes. Debounced lightly so slider scrubs
 * don't spam the DB with overlapping queries.
 */

import { useEffect, useRef, useState } from 'react';

import { queryEvents } from '@/lib/queries';
import type { EventRow, FilterSpec } from '@/lib/types';

interface UseEventsResult {
  events: EventRow[];
  loading: boolean;
  error: Error | undefined;
}

const DEBOUNCE_MS = 60;

export function useEvents(spec: FilterSpec): UseEventsResult {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // We stringify the spec so effect dependency tracking is structural, not
  // referential — otherwise a fresh object every render would spin forever.
  const key = JSON.stringify(spec);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      queryEvents(spec)
        .then((rows) => {
          if (!cancelled) setEvents(rows);
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

  return { events, loading, error };
}
