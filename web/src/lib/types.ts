/**
 * Shared TypeScript types.
 *
 * Event and map identifiers are mirrored from `data-pipeline/src/pipeline/config.py`.
 * Keep the two in sync — the coord fixture test is the automated check, but
 * string identifiers here are lightweight enough to be reviewed by hand.
 */

export type MapId = 'AmbroseValley' | 'GrandRift' | 'Lockdown';

export type EventType =
  | 'Position'
  | 'BotPosition'
  | 'Kill'
  | 'Killed'
  | 'BotKill'
  | 'BotKilled'
  | 'KilledByStorm'
  | 'Loot';

export type ViewMode =
  | 'loot'
  | 'kills'
  | 'deaths'
  | 'movement'
  | 'storm'
  | 'killfeed'
  | 'kills_heatmap'
  | 'deaths_heatmap'
  | 'traffic';

/** The four actor-type permutations captured by the pairing layer. */
export type KillCombo = 'H->H' | 'H->B' | 'B->H' | 'B->B';

/**
 * A single reconstructed killer→victim edge from ``pairs_*.parquet``.
 * Heuristic — see ``data-pipeline/src/pipeline/pairing.py`` for the
 * reconstruction rules and known limitations.
 */
export interface PairRow {
  match_id: string;
  map_id: MapId;
  day: string;
  killer_id: string;
  victim_id: string;
  killer_is_bot: boolean;
  victim_is_bot: boolean;
  combo: KillCombo;
  killer_ts: number;
  victim_ts: number;
  dt_ms: number;
  killer_rel_ts: number;
  victim_rel_ts: number;
  duration_ms: number;
  killer_x: number;
  killer_z: number;
  victim_x: number;
  victim_z: number;
  killer_px: number;
  killer_py: number;
  victim_px: number;
  victim_py: number;
  dist: number;
}

/** A single enriched event row as produced by the data pipeline. */
export interface EventRow {
  user_id: string;
  match_id: string;
  map_id: MapId;
  x: number;
  y: number;
  z: number;
  ts: number;
  event: EventType;
  is_bot: boolean;
  day: string; // ISO YYYY-MM-DD
  duration_ms: number;
  rel_ts: number;
  px: number;
  py: number;
}

export interface MatchMeta {
  match_id: string;
  map_id: MapId;
  day: string;
  match_start_ts: number;
  match_end_ts: number;
  duration_ms: number;
  event_count: number;
  human_count: number;
  bot_count: number;
  kills: number;
  killed: number;
  bot_kills: number;
  bot_killed: number;
  storm_kills: number;
  loot: number;
}

/** The shape of ``web/public/data/manifest.json``. */
export interface Manifest {
  schema_version: number;
  event_types: EventType[];
  maps: Record<MapId, MapManifestEntry>;
}

export interface MapManifestEntry {
  slug: string;
  events: number;
  /** Reconstructed killer→victim edges. Optional — older manifests may lack it. */
  pairs?: number;
  matches: number;
  days: string[];
  duration_ms: { min: number; max: number; median: number };
  image: string;
  coord_system: { scale: number; origin_x: number; origin_z: number; image_px: number };
}

/** The canonical filter that drives every query in the app. */
export interface FilterSpec {
  map: MapId;
  day?: string | undefined;
  matchId?: string | undefined;
  eventTypes?: EventType[] | undefined;
  isBot?: boolean | undefined;
  /** Include events with ``rel_ts <= relTsMax`` (single-handle slider). */
  relTsMax?: number | undefined;
  /** Alternatively a [lo, hi] range (dual-handle slider). */
  relTsRange?: [number, number] | undefined;
  /**
   * Normalized 0-1 value used in aggregate mode (no match selected).
   * Include events with ``rel_ts / duration_ms <= normalizedProgress``.
   */
  normalizedProgress?: number | undefined;
}

/** Filter for the Kill Feed (pairs) query. Mirrors FilterSpec minus event types. */
export interface PairSpec {
  map: MapId;
  day?: string | undefined;
  matchId?: string | undefined;
  /** Match-mode: restrict to a single killer_id (per-player drill-down). */
  focusKillerId?: string | undefined;
  /** Match-mode: include pairs with ``killer_rel_ts <= relTsMax``. */
  relTsMax?: number | undefined;
  /** Aggregate-mode: include pairs with ``killer_rel_ts/duration_ms <= p``. */
  normalizedProgress?: number | undefined;
}
