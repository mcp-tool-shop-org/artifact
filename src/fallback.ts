/**
 * Deterministic fallback driver — no Ollama required.
 * Uses seeded hashing + truth atoms for repo-specific, varied output.
 * Respects history to avoid repetition.
 */

import type { DecisionPacket, RepoContext, HistoryStore, Tier, TruthAtom, SelectedHook, InferenceProfile } from './types.js';
import { TIERS, FORMAT_FAMILIES } from './constants.js';
import { recentTiers, recentFormats, recentAtomIds } from './history.js';

const CONSTRAINT_DECK = [
  'one-page', 'black-and-white', 'SVG-only', 'monospace-only',
  'uses-core-loop', 'uses-failure-mode', 'uses-real-invariant', 'uses-two-opposing-forces',
  'museum-placard', 'field-manual', 'heist-plan', 'lab-notebook',
  'before-after', 'quest', 'threat-mitigation', 'recipe',
];

/** Simple deterministic hash from a string. */
export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Pick N items from an array using a seed, avoiding items in the exclude set. */
export function seededPick<T>(arr: T[], n: number, seed: number, exclude: Set<string> = new Set()): T[] {
  const available = arr.filter(item => !exclude.has(String(item)));
  if (available.length === 0) return arr.slice(0, n);
  const result: T[] = [];
  let s = seed;
  const maxIter = available.length * 10;
  let iter = 0;
  while (result.length < n && result.length < available.length && iter++ < maxIter) {
    s = ((s * 1103515245 + 12345) & 0x7fffffff);
    const idx = s % available.length;
    const pick = available[idx];
    if (!result.includes(pick)) result.push(pick);
  }
  // If LCG cycle missed some items, fill sequentially
  if (result.length < n) {
    for (const item of available) {
      if (result.length >= n) break;
      if (!result.includes(item)) result.push(item);
    }
  }
  return result;
}

/** Pick the best atom for a given type, avoiding recently used IDs */
export function pickAtom(atoms: TruthAtom[], type: string, usedIds: Set<string>, seed: number): TruthAtom | null {
  const candidates = atoms.filter(a => a.type === type && !usedIds.has(a.id));
  if (candidates.length === 0) {
    // Fall back to any of that type
    const any = atoms.filter(a => a.type === type);
    if (any.length === 0) return null;
    return any[seed % any.length];
  }
  return candidates[seed % candidates.length];
}

/** Pick hooks from truth atoms — deterministic, biased toward high-value types */
export function pickHooks(atoms: TruthAtom[], seed: number, usedIds: Set<string>): SelectedHook[] {
  const hookTypes: Array<{ atomType: string; role: string }> = [
    { atomType: 'invariant', role: 'invariant_hook' },
    { atomType: 'core_object', role: 'name_hook' },
    { atomType: 'cli_flag', role: 'mechanic_hook' },
    { atomType: 'error_string', role: 'failure_hook' },
    { atomType: 'anti_goal', role: 'constraint_hook' },
    { atomType: 'guarantee', role: 'constraint_hook' },
  ];

  const hooks: SelectedHook[] = [];
  for (const { atomType, role } of hookTypes) {
    if (hooks.length >= 3) break;
    const atom = pickAtom(atoms, atomType, usedIds, seed + hooks.length);
    if (atom) {
      hooks.push({ atom_id: atom.id, role });
    }
  }
  return hooks;
}

/** Weighted tier selection using profile weights */
export function weightedTierSelect(
  weights: Record<Tier, number>,
  seed: number,
  excludeTiers: Set<string>,
): Tier {
  const candidates: Array<[Tier, number]> = [];
  for (const [tier, weight] of Object.entries(weights) as Array<[Tier, number]>) {
    if (!excludeTiers.has(tier)) candidates.push([tier, weight]);
  }
  if (candidates.length === 0) {
    const sorted = Object.entries(weights).sort(([, a], [, b]) => b - a);
    return sorted[0][0] as Tier;
  }
  const total = candidates.reduce((s, [, w]) => s + w, 0);
  const r = (seed % 1000) / 1000;
  let cumulative = 0;
  for (const [tier, weight] of candidates) {
    cumulative += weight / total;
    if (r <= cumulative) return tier;
  }
  return candidates[candidates.length - 1][0];
}

/** Deterministic fallback: rotate tiers, seed formats + constraints, ground in truth atoms. */
export function driveFallback(ctx: RepoContext, history: HistoryStore, profile?: InferenceProfile): DecisionPacket {
  const dateStr = new Date().toISOString().slice(0, 10);
  const seed = hash(ctx.repo_name + dateStr);
  const atoms = ctx.truth_bundle.atoms;
  const usedAtomIds = new Set(recentAtomIds(history));

  // Pick tier: use profile weights if available, else pure rotation
  const usedTiers = new Set(recentTiers(history));
  let tier: Tier;
  if (profile) {
    tier = weightedTierSelect(profile.recommended_tier_weights, seed, usedTiers);
  } else {
    const availTiers = TIERS.filter(t => !usedTiers.has(t));
    tier = availTiers.length > 0
      ? availTiers[seed % availTiers.length]
      : TIERS[seed % TIERS.length];
  }

  // Pick formats from that tier, avoiding recent
  const usedFormats = new Set(recentFormats(history));
  const formats = seededPick(FORMAT_FAMILIES[tier], 3, seed, usedFormats);

  // Pick constraints — bias toward repo-specific ones if invariants exist
  let constraints = seededPick(CONSTRAINT_DECK, 2, seed + 7);
  const hasInvariants = atoms.some(a => a.type === 'invariant');
  if (hasInvariants && !constraints.includes('uses-real-invariant')) {
    constraints = ['uses-real-invariant', ...constraints.slice(0, 1)];
  }

  // Pick hooks from atoms
  const selectedHooks = pickHooks(atoms, seed, usedAtomIds);

  // Build must_include from actual atoms
  const mustInclude: string[] = [];
  const taglineAtom = atoms.find(a => a.type === 'repo_tagline');
  if (taglineAtom) mustInclude.push(`repo identity: "${taglineAtom.value}"`);
  const cliAtom = atoms.find(a => a.type === 'cli_command');
  if (cliAtom) mustInclude.push(`CLI command: ${cliAtom.value}`);
  const invariantAtom = atoms.find(a => a.type === 'invariant');
  if (invariantAtom) mustInclude.push(`invariant: ${invariantAtom.value}`);
  if (mustInclude.length === 0) {
    mustInclude.push('one repo-specific invariant (from README/docs)', 'one concrete object the repo produces');
  }

  // Build freshness payload from real atoms
  const weirdAtom = pickAtom(atoms, 'invariant', usedAtomIds, seed)
    ?? pickAtom(atoms, 'error_string', usedAtomIds, seed)
    ?? pickAtom(atoms, 'cli_flag', usedAtomIds, seed);
  const changeAtom = pickAtom(atoms, 'recent_change', usedAtomIds, seed);
  const edgeAtom = pickAtom(atoms, 'sharp_edge', usedAtomIds, seed)
    ?? pickAtom(atoms, 'anti_goal', usedAtomIds, seed);

  return {
    repo_name: ctx.repo_name,
    tier,
    format_candidates: formats,
    constraints,
    must_include: mustInclude,
    ban_list: [],
    freshness_payload: {
      weird_detail: weirdAtom?.value ?? 'unknown — no invariant/error atoms found',
      recent_change: changeAtom?.value ?? 'unknown — no recent_change atoms found',
      sharp_edge: edgeAtom?.value ?? 'unknown — no sharp_edge atoms found',
    },
    selected_hooks: selectedHooks,
    callouts: {
      veto: '',
      twist: invariantAtom ? `Ground in: "${invariantAtom.value.slice(0, 80)}"` : '',
      pick: `${tier} → ${formats[0]}`,
      risk: '',
    },
    driver_meta: {
      host: null,
      model: null,
      mode: 'fallback',
      timestamp: new Date().toISOString(),
    },
  };
}
