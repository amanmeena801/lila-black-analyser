/**
 * Shared colour palette for map overlays. Defined once so heatmap / scatter /
 * trajectory traces stay visually coherent and legend colours don't drift
 * when components are edited independently.
 */

import type { EventType, KillCombo } from '@/lib/types';

export const EVENT_COLOR: Record<EventType, string> = {
  Loot: '#facc15',
  Kill: '#ef4444',
  BotKill: '#fb923c',
  Killed: '#a855f7',
  BotKilled: '#c084fc',
  Position: '#22d3ee',
  BotPosition: '#84cc16',
  KilledByStorm: '#38bdf8',
};

/** Heatmap gradient — dark → yellow → white, tuned for dark minimap tiles. */
export const HEATMAP_COLORSCALE: Array<[number, string]> = [
  [0.0, 'rgba(0,0,0,0)'],
  [0.15, 'rgba(59,130,246,0.35)'],
  [0.4, 'rgba(250,204,21,0.7)'],
  [0.8, 'rgba(248,113,113,0.9)'],
  [1.0, 'rgba(255,255,255,1)'],
];

/**
 * Kill Feed combo colours. H = human, B = bot. Chosen to be distinguishable
 * against the dark minimap tile and from the existing event palette so the
 * four views don't get visually confused.
 */
export const COMBO_COLOR: Record<KillCombo, string> = {
  'H->H': '#ef4444', // red — human-vs-human
  'H->B': '#fb923c', // orange — human kills bot
  'B->H': '#a855f7', // purple — bot kills human
  'B->B': '#84cc16', // lime — bot-vs-bot
};

/** Human-readable label for each combo, used in legends and the feed list. */
export const COMBO_LABEL: Record<KillCombo, string> = {
  'H->H': 'Human → Human',
  'H->B': 'Human → Bot',
  'B->H': 'Bot → Human',
  'B->B': 'Bot → Bot',
};
