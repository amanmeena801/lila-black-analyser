/**
 * Helper: resolve the currently selected MatchMeta (if any) for the active
 * map/day/match filters. Used by the time slider to know its max range, and
 * by the stats panel.
 */

import { useMatches } from './useMatches';
import type { MatchMeta } from '@/lib/types';
import { useFilterStore } from '@/state/filterStore';

interface UseSelectedMatchResult {
  match: MatchMeta | undefined;
  loading: boolean;
}

export function useSelectedMatch(): UseSelectedMatchResult {
  const map = useFilterStore((s) => s.map);
  const day = useFilterStore((s) => s.day);
  const matchId = useFilterStore((s) => s.matchId);

  const { matches, loading } = useMatches(map, day);
  const match = matchId ? matches.find((m) => m.match_id === matchId) : undefined;
  return { match, loading };
}
