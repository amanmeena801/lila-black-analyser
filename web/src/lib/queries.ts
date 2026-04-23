/**
 * Typed query helpers. Every UI panel calls into one of these functions —
 * this is the single place the DB schema meets the app.
 */

import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { connect, registerParquet } from './duckdb';
import { MAP_CONFIG } from './mapConfig';
import type {
  EventRow,
  EventType,
  FilterSpec,
  KillCombo,
  MapId,
  Manifest,
  MatchMeta,
  PairRow,
  PairSpec,
} from './types';

const DATA_BASE = '/data';

/** Slug used in the parquet filename. Matches pipeline/config::MAP_SLUG. */
const MAP_SLUG: Record<MapId, string> = {
  AmbroseValley: 'ambrose_valley',
  GrandRift: 'grand_rift',
  Lockdown: 'lockdown',
};

export async function loadManifest(): Promise<Manifest> {
  const res = await fetch(`${DATA_BASE}/manifest.json`, { cache: 'force-cache' });
  if (!res.ok) {
    throw new Error(`Failed to load manifest.json: ${res.status}`);
  }
  return (await res.json()) as Manifest;
}

function eventsFileName(map: MapId): string {
  return `events_${MAP_SLUG[map]}.parquet`;
}

function pairsFileName(map: MapId): string {
  return `pairs_${MAP_SLUG[map]}.parquet`;
}

async function ensureMapRegistered(map: MapId): Promise<string> {
  const file = eventsFileName(map);
  await registerParquet(`${DATA_BASE}/${file}`, file);
  return file;
}

async function ensurePairsRegistered(map: MapId): Promise<string> {
  const file = pairsFileName(map);
  await registerParquet(`${DATA_BASE}/${file}`, file);
  return file;
}

async function ensureMatchesRegistered(): Promise<string> {
  const file = 'matches_index.parquet';
  await registerParquet(`${DATA_BASE}/${file}`, file);
  return file;
}

// --------------------------------------------------------------------------- //
// Filter → SQL                                                                //
// --------------------------------------------------------------------------- //

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildWhere(spec: FilterSpec): string {
  const clauses: string[] = [`map_id = ${sqlQuote(spec.map)}`];

  if (spec.day) clauses.push(`day = DATE ${sqlQuote(spec.day)}`);
  if (spec.matchId) clauses.push(`match_id = ${sqlQuote(spec.matchId)}`);
  if (spec.eventTypes && spec.eventTypes.length > 0) {
    const list = spec.eventTypes.map(sqlQuote).join(', ');
    clauses.push(`event IN (${list})`);
  }
  if (spec.isBot !== undefined) {
    clauses.push(`is_bot = ${spec.isBot ? 'TRUE' : 'FALSE'}`);
  }

  // Time windowing — match-mode takes precedence when a match is selected.
  if (spec.matchId) {
    if (spec.relTsRange) {
      const [lo, hi] = spec.relTsRange;
      clauses.push(`rel_ts BETWEEN ${lo} AND ${hi}`);
    } else if (spec.relTsMax !== undefined) {
      clauses.push(`rel_ts <= ${spec.relTsMax}`);
    }
  } else if (spec.normalizedProgress !== undefined) {
    // Aggregate mode: normalize each match by its own duration.
    const p = Math.max(0, Math.min(1, spec.normalizedProgress));
    clauses.push(`rel_ts <= duration_ms * ${p}`);
  }

  return clauses.join(' AND ');
}

// --------------------------------------------------------------------------- //
// Public API                                                                  //
// --------------------------------------------------------------------------- //

export async function queryEvents(spec: FilterSpec): Promise<EventRow[]> {
  const file = await ensureMapRegistered(spec.map);
  const con = await connect();
  try {
    const where = buildWhere(spec);
    const sql = `
      SELECT user_id, match_id, map_id, x, y, z, ts, event,
             is_bot, CAST(day AS VARCHAR) AS day,
             duration_ms, rel_ts, px, py
      FROM read_parquet('${file}')
      WHERE ${where}
    `;
    const result = await con.query(sql);
    return result.toArray().map(toEventRow);
  } finally {
    await con.close();
  }
}

export async function countEvents(spec: FilterSpec): Promise<number> {
  const file = await ensureMapRegistered(spec.map);
  const con = await connect();
  try {
    const where = buildWhere(spec);
    const sql = `SELECT COUNT(*)::INT AS n FROM read_parquet('${file}') WHERE ${where}`;
    const result = await con.query(sql);
    const row = result.toArray()[0];
    return row ? Number(row.n) : 0;
  } finally {
    await con.close();
  }
}

// --------------------------------------------------------------------------- //
// Kill Feed (pairs)                                                           //
// --------------------------------------------------------------------------- //

function buildPairWhere(spec: PairSpec): string {
  const clauses: string[] = [`map_id = ${sqlQuote(spec.map)}`];
  if (spec.day) clauses.push(`day = DATE ${sqlQuote(spec.day)}`);
  if (spec.matchId) clauses.push(`match_id = ${sqlQuote(spec.matchId)}`);
  if (spec.focusKillerId) clauses.push(`killer_id = ${sqlQuote(spec.focusKillerId)}`);

  // Time windowing — use killer_rel_ts as the driving timestamp so the
  // slider semantics match the other views.
  if (spec.matchId) {
    if (spec.relTsMax !== undefined) {
      clauses.push(`killer_rel_ts <= ${spec.relTsMax}`);
    }
  } else if (spec.normalizedProgress !== undefined) {
    const p = Math.max(0, Math.min(1, spec.normalizedProgress));
    clauses.push(`killer_rel_ts <= duration_ms * ${p}`);
  }
  return clauses.join(' AND ');
}

export async function queryPairs(spec: PairSpec): Promise<PairRow[]> {
  const file = await ensurePairsRegistered(spec.map);
  const con = await connect();
  try {
    const where = buildPairWhere(spec);
    const sql = `
      SELECT match_id, map_id, CAST(day AS VARCHAR) AS day,
             killer_id, victim_id, killer_is_bot, victim_is_bot, combo,
             killer_ts, victim_ts, dt_ms,
             killer_rel_ts, victim_rel_ts, duration_ms,
             killer_x, killer_z, victim_x, victim_z,
             killer_px, killer_py, victim_px, victim_py, dist
      FROM read_parquet('${file}')
      WHERE ${where}
      ORDER BY killer_ts
    `;
    const result = await con.query(sql);
    return result.toArray().map(toPairRow);
  } finally {
    await con.close();
  }
}

/** Killer-centric summary for a single match. Used by the Focus-player dropdown. */
export interface KillerSummary {
  killer_id: string;
  killer_is_bot: boolean;
  kills: number;
  kills_of_humans: number;
  kills_of_bots: number;
}

export async function listKillersInMatch(
  map: MapId,
  matchId: string,
): Promise<KillerSummary[]> {
  const file = await ensurePairsRegistered(map);
  const con = await connect();
  try {
    const sql = `
      SELECT killer_id,
             ANY_VALUE(killer_is_bot) AS killer_is_bot,
             COUNT(*) AS kills,
             SUM(CASE WHEN NOT victim_is_bot THEN 1 ELSE 0 END) AS kills_of_humans,
             SUM(CASE WHEN     victim_is_bot THEN 1 ELSE 0 END) AS kills_of_bots
      FROM read_parquet('${file}')
      WHERE map_id = ${sqlQuote(map)} AND match_id = ${sqlQuote(matchId)}
      GROUP BY killer_id
      ORDER BY kills DESC, killer_id
    `;
    const result = await con.query(sql);
    return result.toArray().map((r: Record<string, unknown>) => ({
      killer_id: String(r.killer_id),
      killer_is_bot: Boolean(r.killer_is_bot),
      kills: Number(r.kills),
      kills_of_humans: Number(r.kills_of_humans),
      kills_of_bots: Number(r.kills_of_bots),
    }));
  } finally {
    await con.close();
  }
}

export async function listMatches(map: MapId, day?: string): Promise<MatchMeta[]> {
  const file = await ensureMatchesRegistered();
  const con = await connect();
  try {
    const clauses: string[] = [`map_id = ${sqlQuote(map)}`];
    if (day) clauses.push(`day = DATE ${sqlQuote(day)}`);
    const sql = `
      SELECT match_id, map_id, CAST(day AS VARCHAR) AS day,
             match_start_ts, match_end_ts, duration_ms,
             event_count, human_count, bot_count,
             kills, killed, bot_kills, bot_killed, storm_kills, loot
      FROM read_parquet('${file}')
      WHERE ${clauses.join(' AND ')}
      ORDER BY day, match_id
    `;
    const result = await con.query(sql);
    return result.toArray().map(toMatchMeta);
  } finally {
    await con.close();
  }
}

// --------------------------------------------------------------------------- //
// Row shape helpers                                                           //
// --------------------------------------------------------------------------- //

function toEventRow(r: Record<string, unknown>): EventRow {
  return {
    user_id: String(r.user_id),
    match_id: String(r.match_id),
    map_id: r.map_id as MapId,
    x: Number(r.x),
    y: Number(r.y),
    z: Number(r.z),
    ts: Number(r.ts),
    event: String(r.event) as EventType,
    is_bot: Boolean(r.is_bot),
    day: String(r.day),
    duration_ms: Number(r.duration_ms),
    rel_ts: Number(r.rel_ts),
    px: Number(r.px),
    py: Number(r.py),
  };
}

function toPairRow(r: Record<string, unknown>): PairRow {
  return {
    match_id: String(r.match_id),
    map_id: r.map_id as MapId,
    day: String(r.day),
    killer_id: String(r.killer_id),
    victim_id: String(r.victim_id),
    killer_is_bot: Boolean(r.killer_is_bot),
    victim_is_bot: Boolean(r.victim_is_bot),
    combo: r.combo as KillCombo,
    killer_ts: Number(r.killer_ts),
    victim_ts: Number(r.victim_ts),
    dt_ms: Number(r.dt_ms),
    killer_rel_ts: Number(r.killer_rel_ts),
    victim_rel_ts: Number(r.victim_rel_ts),
    duration_ms: Number(r.duration_ms),
    killer_x: Number(r.killer_x),
    killer_z: Number(r.killer_z),
    victim_x: Number(r.victim_x),
    victim_z: Number(r.victim_z),
    killer_px: Number(r.killer_px),
    killer_py: Number(r.killer_py),
    victim_px: Number(r.victim_px),
    victim_py: Number(r.victim_py),
    dist: Number(r.dist),
  };
}

function toMatchMeta(r: Record<string, unknown>): MatchMeta {
  return {
    match_id: String(r.match_id),
    map_id: r.map_id as MapId,
    day: String(r.day),
    match_start_ts: Number(r.match_start_ts),
    match_end_ts: Number(r.match_end_ts),
    duration_ms: Number(r.duration_ms),
    event_count: Number(r.event_count),
    human_count: Number(r.human_count),
    bot_count: Number(r.bot_count),
    kills: Number(r.kills),
    killed: Number(r.killed),
    bot_kills: Number(r.bot_kills),
    bot_killed: Number(r.bot_killed),
    storm_kills: Number(r.storm_kills),
    loot: Number(r.loot),
  };
}

/** Exported for test access; the normal public API is the functions above. */
export const __test = { buildWhere, buildPairWhere };

// Keep Connection import used (TS strict config).
export type { AsyncDuckDBConnection };

// Expose the coord system so legends & axis labels can size themselves.
export { MAP_CONFIG };
