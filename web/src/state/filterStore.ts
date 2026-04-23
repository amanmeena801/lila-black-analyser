/**
 * Single source of truth for every filter on the page.
 *
 * One store, flat shape, no derived state kept here — derivation is left to
 * selectors and hooks so the store stays trivially serialisable (useful when
 * we wire up URL-state sharing in a later phase).
 */

import { create } from 'zustand';

import type { EventType, FilterSpec, MapId, PairSpec, ViewMode } from '@/lib/types';

/** Default event type multiselect for each view mode. */
export const DEFAULT_EVENT_TYPES: Record<ViewMode, EventType[]> = {
  loot: ['Loot'],
  kills: ['Kill', 'BotKill'],
  deaths: ['Killed', 'BotKilled', 'BotKill'],
  movement: ['Position', 'BotPosition'],
  storm: ['KilledByStorm'],
  // Kill Feed uses a separate pairs.parquet — the event filter is unused.
  killfeed: [],
  // Heatmap views reuse the scatter event sets but render via buildHeatmapTrace.
  kills_heatmap: ['Kill', 'BotKill'],
  deaths_heatmap: ['Killed', 'BotKilled', 'KilledByStorm'],
  traffic: ['Position', 'BotPosition'],
};

export interface FilterState {
  map: MapId;
  day: string | undefined;
  matchId: string | undefined;
  view: ViewMode;
  showHumans: boolean;
  showBots: boolean;
  /** Slider value in match-mode; ms from match start. Undefined = full match. */
  relTsMax: number | undefined;
  /** Slider value in aggregate-mode; 0..1 of each match's duration. */
  normalizedProgress: number | undefined;
  /** True while the play button is advancing the slider. */
  isPlaying: boolean;
  /**
   * Match-mode only: focus the Kill Feed on a single killer. Undefined =
   * show every killer in the selected match. Ignored outside ``killfeed``
   * view and in aggregate mode.
   */
  focusKillerId: string | undefined;

  setMap(m: MapId): void;
  setDay(d: string | undefined): void;
  setMatchId(id: string | undefined): void;
  setView(v: ViewMode): void;
  setShowHumans(v: boolean): void;
  setShowBots(v: boolean): void;
  setRelTsMax(ms: number | undefined): void;
  setNormalizedProgress(p: number | undefined): void;
  setIsPlaying(v: boolean): void;
  setFocusKillerId(id: string | undefined): void;

  reset(): void;
}

const DEFAULTS: Omit<
  FilterState,
  | 'setMap'
  | 'setDay'
  | 'setMatchId'
  | 'setView'
  | 'setShowHumans'
  | 'setShowBots'
  | 'setRelTsMax'
  | 'setNormalizedProgress'
  | 'setIsPlaying'
  | 'setFocusKillerId'
  | 'reset'
> = {
  map: 'AmbroseValley',
  day: undefined,
  matchId: undefined,
  view: 'loot',
  showHumans: true,
  showBots: true,
  relTsMax: undefined,
  normalizedProgress: undefined,
  isPlaying: false,
  focusKillerId: undefined,
};

export const useFilterStore = create<FilterState>((set) => ({
  ...DEFAULTS,

  setMap: (m) =>
    set({ map: m, matchId: undefined, relTsMax: undefined, focusKillerId: undefined }),
  setDay: (d) => set({ day: d, matchId: undefined, focusKillerId: undefined }),
  setMatchId: (id) =>
    set({
      matchId: id,
      relTsMax: undefined,
      normalizedProgress: undefined,
      focusKillerId: undefined,
    }),
  setView: (v) => set({ view: v }),
  setShowHumans: (v) => set({ showHumans: v }),
  setShowBots: (v) => set({ showBots: v }),
  setRelTsMax: (ms) => set({ relTsMax: ms }),
  setNormalizedProgress: (p) => set({ normalizedProgress: p }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setFocusKillerId: (id) => set({ focusKillerId: id }),

  reset: () => set({ ...DEFAULTS }),
}));

/**
 * Derive the FilterSpec that the query layer expects from raw UI state.
 * Kept as a pure function so it can be tested without the store.
 */
export function toFilterSpec(state: FilterState): FilterSpec {
  const eventTypes = DEFAULT_EVENT_TYPES[state.view];

  let isBot: boolean | undefined;
  if (state.showHumans && !state.showBots) isBot = false;
  else if (!state.showHumans && state.showBots) isBot = true;

  return {
    map: state.map,
    day: state.day,
    matchId: state.matchId,
    eventTypes,
    isBot,
    relTsMax: state.matchId ? state.relTsMax : undefined,
    normalizedProgress: state.matchId ? undefined : state.normalizedProgress,
  };
}

/**
 * Derive the PairSpec used by the Kill Feed view.
 *
 * Mirrors :func:`toFilterSpec` structurally so time-slider wiring is identical,
 * but drops the event-type filter (pairs.parquet already contains only
 * reconstructed kills) and picks up ``focusKillerId`` in match mode.
 */
export function toPairSpec(state: FilterState): PairSpec {
  return {
    map: state.map,
    day: state.day,
    matchId: state.matchId,
    focusKillerId: state.matchId ? state.focusKillerId : undefined,
    relTsMax: state.matchId ? state.relTsMax : undefined,
    normalizedProgress: state.matchId ? undefined : state.normalizedProgress,
  };
}
