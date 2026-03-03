/**
 * Deterministic fallback driver — no Ollama required.
 * Uses seeded hashing to produce varied but repeatable results.
 * Respects history to avoid repetition.
 */

import type { DecisionPacket, RepoContext, HistoryStore, Tier } from './types.js';
import { TIERS, FORMAT_FAMILIES } from './curator.js';
import { recentTiers, recentFormats } from './history.js';

const CONSTRAINT_DECK = [
  'one-page', 'black-and-white', 'SVG-only', 'monospace-only',
  'uses-core-loop', 'uses-failure-mode', 'uses-real-invariant', 'uses-two-opposing-forces',
  'museum-placard', 'field-manual', 'heist-plan', 'lab-notebook',
  'before-after', 'quest', 'threat-mitigation', 'recipe',
];

/** Simple deterministic hash from a string. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Pick N items from an array using a seed, avoiding items in the exclude set. */
function seededPick<T>(arr: T[], n: number, seed: number, exclude: Set<string> = new Set()): T[] {
  const available = arr.filter(item => !exclude.has(String(item)));
  if (available.length === 0) return arr.slice(0, n);
  const result: T[] = [];
  let s = seed;
  while (result.length < n && result.length < available.length) {
    s = ((s * 1103515245 + 12345) & 0x7fffffff);
    const idx = s % available.length;
    const pick = available[idx];
    if (!result.includes(pick)) result.push(pick);
  }
  return result;
}

/** Deterministic fallback: rotate tiers, seed formats + constraints from repo name + date. */
export function driveFallback(ctx: RepoContext, history: HistoryStore): DecisionPacket {
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const seed = hash(ctx.repo_name + dateStr);

  // Pick tier: rotate through, avoiding recent
  const usedTiers = new Set(recentTiers(history));
  const availTiers = TIERS.filter(t => !usedTiers.has(t));
  const tier: Tier = availTiers.length > 0
    ? availTiers[seed % availTiers.length]
    : TIERS[seed % TIERS.length];

  // Pick formats from that tier, avoiding recent
  const usedFormats = new Set(recentFormats(history));
  const formats = seededPick(FORMAT_FAMILIES[tier], 3, seed, usedFormats);

  // Pick constraints
  const constraints = seededPick(CONSTRAINT_DECK, 2, seed + 7);

  return {
    repo_name: ctx.repo_name,
    tier,
    format_candidates: formats,
    constraints,
    must_include: [
      'one repo-specific invariant (from README/docs)',
      'one concrete object the repo produces',
      'one constraint the repo obeys',
    ],
    ban_list: [],
    freshness_payload: {
      weird_detail: 'unknown — Phase 2 will extract',
      recent_change: 'unknown — Phase 2 will extract',
      sharp_edge: 'unknown — Phase 2 will extract',
    },
    driver_meta: {
      host: null,
      model: null,
      mode: 'fallback',
      timestamp: new Date().toISOString(),
    },
  };
}
