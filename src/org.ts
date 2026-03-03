/**
 * Org-wide Collection Curation (Phase 4)
 *
 * Turns individual good picks into a cohesive, collectible body of work.
 * Still one repo at a time, still handcrafted — just globally orchestrated.
 *
 * Five engines:
 *   A. Org History Retrieval — what's been done, what's overused
 *   B. Season Selector — curation lens with rules
 *   C. Diversity Scoring + Ban Generator — staleness penalties → dynamic bans
 *   D. Coverage Targets — what the org needs next
 *   E. Signature Move Registry — cohesion without sameness
 *
 * Storage (all at ~/.artifact/org/):
 *   ledger.jsonl    — append-only, one line per drive
 *   season.json     — active season
 *   status.json     — computed snapshot
 *   sig_moves.json  — per-repo move assignments
 */

import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import type {
  Tier, Season, LedgerEntry, OrgStatus, SignatureMove,
  CurationBrief, DecisionPacket, InferenceProfile,
} from './types.js';
import { TIERS } from './constants.js';

// ── Paths ────────────────────────────────────────────────────────

const ORG_DIR = join(homedir(), '.artifact', 'org');
const LEDGER_FILE = join(ORG_DIR, 'ledger.jsonl');
const SEASON_FILE = join(ORG_DIR, 'season.json');
const STATUS_FILE = join(ORG_DIR, 'status.json');
const SIG_MOVES_FILE = join(ORG_DIR, 'sig_moves.json');

async function ensureDir(): Promise<void> {
  await mkdir(ORG_DIR, { recursive: true });
}

// ── Predefined Seasons ───────────────────────────────────────────

const ALL_MOVES: SignatureMove[] = [
  'stamp_seal', 'checksum_box', 'margin_notes',
  'catalog_number', 'card_back_pattern', 'fold_marks',
];

const SEASONS: Record<string, Season> = {
  proof: {
    name: 'Season of Proof',
    started_at: '',
    tier_weights: { Dev: 2, Exec: 1.5, Fun: 0.5 },
    format_bias: ['D5_test_matrix', 'E3_risk_placard', 'D4_api_contract', 'E7_slo_snapshot'],
    constraint_decks_enabled: ['uses-real-invariant', 'uses-failure-mode', 'signal-proof', 'threat-mitigation'],
    ban_list: [],
    signature_moves: ['stamp_seal', 'checksum_box'],
    notes: 'Integrity, verification, guardrails. Make every artifact prove something.',
  },
  field_manuals: {
    name: 'Season of Field Manuals',
    started_at: '',
    tier_weights: { Dev: 2, Exec: 1, Creator: 0.5 },
    format_bias: ['D1_quickstart_card', 'D8_release_checklist', 'D3_debug_tree', 'E1_brief'],
    constraint_decks_enabled: ['one-page', 'monospace-only', 'field-manual', 'recipe'],
    ban_list: [],
    signature_moves: ['fold_marks', 'margin_notes'],
    notes: 'Pocket docs, checklists, operational clarity. If it fits in a back pocket, it ships.',
  },
  play: {
    name: 'Season of Play',
    started_at: '',
    tier_weights: { Fun: 3, Creator: 1.5, Dev: 0.5 },
    format_bias: ['F1_board_game', 'F2_card_deck', 'F5_puzzle_page', 'F6_achievements'],
    constraint_decks_enabled: ['uses-core-loop', 'uses-two-opposing-forces', 'quest', 'dead-serious-one-joke'],
    ban_list: [],
    signature_moves: ['card_back_pattern', 'catalog_number'],
    notes: 'Board/card mechanics, puzzles. Make the repo playable.',
  },
  launch: {
    name: 'Season of Launch',
    started_at: '',
    tier_weights: { Promotion: 3, Exec: 1.5, Creator: 1 },
    format_bias: ['P1_one_slide_pitch', 'P3_launch_post_kit', 'P8_demo_script', 'P2_demo_gif_storyboard'],
    constraint_decks_enabled: ['before-after', 'one-page', 'uses-core-loop'],
    ban_list: [],
    signature_moves: ['stamp_seal', 'margin_notes'],
    notes: 'Promotion artifacts, demo story packs. Ship the pitch, not just the tool.',
  },
  museums: {
    name: 'Season of Museums',
    started_at: '',
    tier_weights: { Fun: 2, Creator: 2, Exec: 1 },
    format_bias: ['F9_museum_placard', 'F10_lore_page', 'C4_cover_poster', 'C5_diagram_pack'],
    constraint_decks_enabled: ['museum-placard', 'black-and-white', 'lab-notebook', 'SVG-only'],
    ban_list: [],
    signature_moves: ['catalog_number', 'stamp_seal'],
    notes: 'Placards, exhibits, archival style. Every repo is a museum piece.',
  },
};

export const SEASON_NAMES = Object.keys(SEASONS);

// ── Season × Inference Weight Merging ────────────────────────────

const ALL_TIERS = TIERS;

/**
 * Merge inference profile weights with active season tier_weights.
 * Season weights are multipliers (e.g., Dev:2 doubles Dev's share).
 * Result is renormalized to sum to 1.0 with a 2% floor.
 */
export function mergeWeightsWithSeason(
  profile: InferenceProfile,
  season: Season | null,
): Record<Tier, number> {
  const merged = { ...profile.recommended_tier_weights };

  if (!season?.tier_weights) return merged;

  for (const tier of ALL_TIERS) {
    const multiplier = season.tier_weights[tier] ?? 1;
    merged[tier] *= multiplier;
  }

  // Renormalize with 2% floor
  const total = Object.values(merged).reduce((s, w) => s + w, 0);
  for (const tier of ALL_TIERS) {
    merged[tier] = Math.max(0.02, merged[tier] / total);
  }
  const total2 = Object.values(merged).reduce((s, w) => s + w, 0);
  for (const tier of ALL_TIERS) {
    merged[tier] = Number((merged[tier] / total2).toFixed(3));
  }

  return merged;
}

// ── Ledger I/O ───────────────────────────────────────────────────

/** Load all ledger entries (JSONL, one per line) */
export async function loadLedger(): Promise<LedgerEntry[]> {
  try {
    const raw = await readFile(LEDGER_FILE, 'utf-8');
    return raw
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as LedgerEntry);
  } catch {
    return [];
  }
}

/** Append a single ledger entry */
export async function appendLedger(entry: LedgerEntry): Promise<void> {
  await ensureDir();
  await appendFile(LEDGER_FILE, JSON.stringify(entry) + '\n', 'utf-8');
}

/** Get last N ledger entries */
export async function ledgerTail(n = 10): Promise<LedgerEntry[]> {
  const all = await loadLedger();
  return all.slice(-n);
}

/** Convert a DecisionPacket to a LedgerEntry */
export function packetToLedger(packet: DecisionPacket): LedgerEntry {
  return {
    repo_name: packet.repo_name,
    tier: packet.tier,
    format_family: packet.format_candidates[0] ?? 'unknown',
    constraints: packet.constraints,
    hooks_used: packet.selected_hooks.map(h => h.role),
    season: packet.season ?? 'none',
    signature_move: (packet.signature_move as SignatureMove) ?? null,
    timestamp: packet.driver_meta.timestamp,
  };
}

// ── Season I/O ───────────────────────────────────────────────────

/** Load the active season, or null if none */
export async function loadSeason(): Promise<Season | null> {
  try {
    const raw = await readFile(SEASON_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Season;
    if (parsed.name) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Set the active season by key */
export async function setSeason(key: string): Promise<Season | null> {
  const template = SEASONS[key];
  if (!template) return null;

  const season: Season = {
    ...template,
    started_at: new Date().toISOString(),
  };

  await ensureDir();
  await writeFile(SEASON_FILE, JSON.stringify(season, null, 2) + '\n', 'utf-8');
  return season;
}

/** End the current season (archive by removing the file) */
export async function endSeason(): Promise<string | null> {
  const current = await loadSeason();
  if (!current) return null;

  const { rm } = await import('node:fs/promises');
  await rm(SEASON_FILE, { force: true });
  return current.name;
}

/** List available seasons */
export function listSeasons(): Array<{ key: string; name: string; notes: string }> {
  return Object.entries(SEASONS).map(([key, s]) => ({
    key,
    name: s.name,
    notes: s.notes,
  }));
}

// ── Signature Move Registry ──────────────────────────────────────

interface SigMoveStore {
  assignments: Record<string, SignatureMove>; // repo_name → move
}

async function loadSigMoves(): Promise<SigMoveStore> {
  try {
    const raw = await readFile(SIG_MOVES_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as SigMoveStore;
    if (parsed.assignments) return parsed;
    return { assignments: {} };
  } catch {
    return { assignments: {} };
  }
}

async function saveSigMoves(store: SigMoveStore): Promise<void> {
  await ensureDir();
  await writeFile(SIG_MOVES_FILE, JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

/** Assign a signature move to a repo — avoids back-to-back repetition */
export async function assignMove(
  repoName: string,
  season: Season | null,
  ledger: LedgerEntry[],
): Promise<SignatureMove> {
  const store = await loadSigMoves();

  // If this repo already has a move, keep it
  if (store.assignments[repoName]) {
    return store.assignments[repoName];
  }

  // Get moves used in last N entries
  const recentMoves = ledger.slice(-6).map(e => e.signature_move).filter(Boolean) as SignatureMove[];
  const lastMove = recentMoves[recentMoves.length - 1];

  // Pool: season-preferred moves, or all if no season
  const pool = season?.signature_moves?.length
    ? season.signature_moves
    : ALL_MOVES;

  // Filter out the last-used move to avoid back-to-back
  let candidates = pool.filter(m => m !== lastMove);
  if (candidates.length === 0) candidates = pool;

  // Pick least-used from candidates
  const usageCounts = new Map<SignatureMove, number>();
  for (const m of ALL_MOVES) usageCounts.set(m, 0);
  for (const e of ledger) {
    if (e.signature_move) {
      usageCounts.set(e.signature_move, (usageCounts.get(e.signature_move) ?? 0) + 1);
    }
  }

  candidates.sort((a, b) => (usageCounts.get(a) ?? 0) - (usageCounts.get(b) ?? 0));
  const chosen = candidates[0];

  // Save assignment
  store.assignments[repoName] = chosen;
  await saveSigMoves(store);

  return chosen;
}

// ── Engine A: Org History Retrieval ──────────────────────────────

interface OrgHistory {
  recent_tiers: string[];
  recent_formats: string[];
  recent_constraints: string[];
  recent_hooks: string[];
  recent_moves: string[];
}

function getOrgHistory(ledger: LedgerEntry[], n = 10): OrgHistory {
  const recent = ledger.slice(-n);
  return {
    recent_tiers: recent.map(e => e.tier),
    recent_formats: recent.map(e => e.format_family),
    recent_constraints: recent.flatMap(e => e.constraints),
    recent_hooks: recent.flatMap(e => e.hooks_used),
    recent_moves: recent.map(e => e.signature_move).filter(Boolean) as string[],
  };
}

// ── Engine C: Diversity Scoring + Ban Generator ─────────────────

interface OrgBan {
  item: string;
  reason: string;
}

export function computeBans(ledger: LedgerEntry[], n = 8): OrgBan[] {
  const recent = ledger.slice(-n);
  if (recent.length < 3) return []; // Not enough history to ban

  const bans: OrgBan[] = [];

  // Format family bans: anything used 2+ times in last N
  const formatCounts = new Map<string, number>();
  for (const e of recent) {
    formatCounts.set(e.format_family, (formatCounts.get(e.format_family) ?? 0) + 1);
  }
  for (const [fmt, count] of formatCounts) {
    if (count >= 2) {
      bans.push({ item: fmt, reason: `used ${count}x in last ${n} repos` });
    }
  }

  // Tier bans: same tier 3+ times in a row
  const lastTiers = recent.slice(-3).map(e => e.tier);
  if (lastTiers.length === 3 && lastTiers.every(t => t === lastTiers[0])) {
    bans.push({ item: lastTiers[0], reason: `${lastTiers[0]} tier used 3x in a row` });
  }

  // Constraint combo bans: same constraint 3+ times in last N
  const constraintCounts = new Map<string, number>();
  for (const e of recent) {
    for (const c of e.constraints) {
      constraintCounts.set(c, (constraintCounts.get(c) ?? 0) + 1);
    }
  }
  for (const [c, count] of constraintCounts) {
    if (count >= 3) {
      bans.push({ item: c, reason: `constraint "${c}" used ${count}x in last ${n} repos` });
    }
  }

  return bans;
}

// ── Engine D: Coverage Targets (Org Gaps) ────────────────────────

const TIER_TARGETS: Record<Tier, number> = {
  Fun: 0.25,
  Dev: 0.30,
  Creator: 0.20,
  Promotion: 0.15,
  Exec: 0.10,
};

/** Max rejected Promotion mandates before we stop mandating */
const PROMOTION_MANDATE_MAX_REJECTIONS = 5;
/** Minimum ledger entries before Promotion mandate activates */
const PROMOTION_MANDATE_MIN_ENTRIES = 8;

/** Path to promotion mandate tracking file */
const PROMOTION_MANDATE_FILE = join(ORG_DIR, 'promotion_mandate.json');

interface PromotionMandateStore {
  rejections: number;
  last_rejection_reason?: string;
}

async function loadMandateStore(): Promise<PromotionMandateStore> {
  try {
    const raw = await readFile(PROMOTION_MANDATE_FILE, 'utf-8');
    return JSON.parse(raw) as PromotionMandateStore;
  } catch {
    return { rejections: 0 };
  }
}

async function saveMandateStore(store: PromotionMandateStore): Promise<void> {
  await ensureDir();
  await writeFile(PROMOTION_MANDATE_FILE, JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

/** Record a mandate rejection (Curator gave a valid reason to skip Promotion) */
export async function recordMandateRejection(reason: string): Promise<void> {
  const store = await loadMandateStore();
  store.rejections += 1;
  store.last_rejection_reason = reason;
  await saveMandateStore(store);
}

/** Record a mandate success (Promotion was selected) — resets the counter */
export async function recordMandateSuccess(): Promise<void> {
  await saveMandateStore({ rejections: 0 });
}

/** Pure logic for promotion mandate — testable without file I/O */
export function shouldMandatePromotionPure(
  ledgerLength: number,
  promotionCount: number,
  rejections: number,
): boolean {
  if (ledgerLength < PROMOTION_MANDATE_MIN_ENTRIES) return false;
  if (promotionCount > 0) return false;
  if (rejections >= PROMOTION_MANDATE_MAX_REJECTIONS) return false;
  return true;
}

/** Check if Promotion mandate should be active */
export async function shouldMandatePromotion(ledger: LedgerEntry[]): Promise<boolean> {
  const promotionCount = ledger.filter(e => e.tier === 'Promotion').length;
  const store = await loadMandateStore();
  return shouldMandatePromotionPure(ledger.length, promotionCount, store.rejections);
}

/** Soft recency penalties — advisory, not bans */
function computeRecencyPenalties(ledger: LedgerEntry[]): string[] {
  const penalties: string[] = [];

  // Tier recency: same tier in last 3 runs
  const last3 = ledger.slice(-3);
  if (last3.length === 3) {
    const tierCounts = new Map<string, number>();
    for (const e of last3) {
      tierCounts.set(e.tier, (tierCounts.get(e.tier) ?? 0) + 1);
    }
    for (const [tier, count] of tierCounts) {
      if (count >= 2) {
        penalties.push(`${tier} tier used ${count}x in last 3 runs — prefer other tiers`);
      }
    }
  }

  // Format recency: same format in last 5 runs
  const last5 = ledger.slice(-5);
  if (last5.length >= 3) {
    const fmtCounts = new Map<string, number>();
    for (const e of last5) {
      fmtCounts.set(e.format_family, (fmtCounts.get(e.format_family) ?? 0) + 1);
    }
    for (const [fmt, count] of fmtCounts) {
      if (count >= 2) {
        penalties.push(`${fmt} used ${count}x in last 5 runs — prefer other formats`);
      }
    }
  }

  // Move recency: same move in last 3 runs
  if (last3.length >= 2) {
    const moveCounts = new Map<string, number>();
    for (const e of last3) {
      if (e.signature_move) {
        moveCounts.set(e.signature_move, (moveCounts.get(e.signature_move) ?? 0) + 1);
      }
    }
    for (const [move, count] of moveCounts) {
      if (count >= 2) {
        penalties.push(`${move} move used ${count}x in last 3 runs — prefer other moves`);
      }
    }
  }

  return penalties;
}

function computeGaps(ledger: LedgerEntry[], season: Season | null): string[] {
  if (ledger.length < 3) return []; // Not enough data

  const gaps: string[] = [];

  // Tier gap analysis
  const tierCounts = new Map<string, number>();
  for (const e of ledger) {
    tierCounts.set(e.tier, (tierCounts.get(e.tier) ?? 0) + 1);
  }
  const total = ledger.length;

  for (const [tier, target] of Object.entries(TIER_TARGETS)) {
    const actual = (tierCounts.get(tier) ?? 0) / total;
    const weight = season?.tier_weights?.[tier as Tier] ?? 1;
    const adjustedTarget = target * weight;

    if (actual < adjustedTarget * 0.5) {
      gaps.push(`prefer ${tier} tier (at ${Math.round(actual * 100)}%, target ~${Math.round(adjustedTarget * 100)}%)`);
    }
  }

  // Format diversity: flag if any format used 3+ times
  const formatCounts = new Map<string, number>();
  for (const e of ledger) {
    formatCounts.set(e.format_family, (formatCounts.get(e.format_family) ?? 0) + 1);
  }

  // Find format families with 0 usage across any tier
  // (only check if we have enough data)
  if (total >= 8) {
    const usedFormats = new Set(ledger.map(e => e.format_family));
    // Just note that variety exists
    gaps.push(`${usedFormats.size} unique formats used across ${total} decisions`);
  }

  // Signature move gaps
  const moveCounts = new Map<string, number>();
  for (const e of ledger) {
    if (e.signature_move) {
      moveCounts.set(e.signature_move, (moveCounts.get(e.signature_move) ?? 0) + 1);
    }
  }
  const unusedMoves = ALL_MOVES.filter(m => !moveCounts.has(m));
  if (unusedMoves.length > 0 && total >= 5) {
    gaps.push(`unused signature moves: ${unusedMoves.join(', ')}`);
  }

  return gaps;
}

// ── Compute Org Status ──────────────────────────────────────────

export async function computeStatus(): Promise<OrgStatus> {
  const ledger = await loadLedger();
  const season = await loadSeason();
  const bans = computeBans(ledger);
  const gaps = computeGaps(ledger, season);

  // Distributions
  const tierDist: Record<string, number> = {};
  const formatDist: Record<string, number> = {};
  const constraintFreq: Record<string, number> = {};
  const moveDist: Record<string, number> = {};

  for (const e of ledger) {
    tierDist[e.tier] = (tierDist[e.tier] ?? 0) + 1;
    formatDist[e.format_family] = (formatDist[e.format_family] ?? 0) + 1;
    for (const c of e.constraints) {
      constraintFreq[c] = (constraintFreq[c] ?? 0) + 1;
    }
    if (e.signature_move) {
      moveDist[e.signature_move] = (moveDist[e.signature_move] ?? 0) + 1;
    }
  }

  // Diversity score: 0-100 based on unique formats / total decisions
  const uniqueFormats = Object.keys(formatDist).length;
  const diversity = ledger.length > 0
    ? Math.min(100, Math.round((uniqueFormats / ledger.length) * 100))
    : 100;

  return {
    total_decisions: ledger.length,
    tier_distribution: tierDist,
    format_distribution: formatDist,
    constraint_frequency: constraintFreq,
    signature_move_usage: moveDist,
    current_season: season?.name ?? null,
    recent_bans: bans.map(b => `${b.item}: ${b.reason}`),
    gaps,
    diversity_score: diversity,
  };
}

/** Save computed status to disk */
export async function saveStatus(status: OrgStatus): Promise<void> {
  await ensureDir();
  await writeFile(STATUS_FILE, JSON.stringify(status, null, 2) + '\n', 'utf-8');
}

// ── Build Curation Brief (the main output for Curator) ──────────

export async function buildCurationBrief(repoName: string): Promise<CurationBrief> {
  const ledger = await loadLedger();
  const season = await loadSeason();
  const bans = computeBans(ledger);
  const gaps = computeGaps(ledger, season);
  const move = await assignMove(repoName, season, ledger);
  const orgHistory = getOrgHistory(ledger);
  const recencyPenalties = computeRecencyPenalties(ledger);
  const promotionMandate = await shouldMandatePromotion(ledger);

  // Format for prompt injection
  const lines: string[] = ['=== ORG CURATION BRIEF ==='];

  // Season info
  if (season) {
    lines.push(`Active Season: ${season.name}`);
    lines.push(`Season notes: ${season.notes}`);
    const biased = season.format_bias.join(', ');
    if (biased) lines.push(`Season format bias: ${biased}`);
    const decks = season.constraint_decks_enabled.join(', ');
    if (decks) lines.push(`Season constraint decks: ${decks}`);
    const weights = Object.entries(season.tier_weights)
      .map(([t, w]) => `${t}:${w}x`)
      .join(', ');
    if (weights) lines.push(`Season tier weights: ${weights}`);
  } else {
    lines.push('No active season (default curation).');
  }

  // Org history
  if (orgHistory.recent_formats.length > 0) {
    lines.push('');
    lines.push(`Recent org formats (avoid repeating): ${orgHistory.recent_formats.join(', ')}`);
    lines.push(`Recent org tiers: ${orgHistory.recent_tiers.join(', ')}`);
  }

  // Bans
  if (bans.length > 0) {
    lines.push('');
    lines.push('ORG BANS (must obey):');
    for (const b of bans) {
      lines.push(`  - BANNED: ${b.item} (${b.reason})`);
    }
  }

  // Soft recency penalties
  if (recencyPenalties.length > 0) {
    lines.push('');
    lines.push('RECENCY PENALTIES (soft — prefer variety):');
    for (const p of recencyPenalties) {
      lines.push(`  - ${p}`);
    }
  }

  // Gaps
  if (gaps.length > 0) {
    lines.push('');
    lines.push('ORG GAPS (prefer these to fill holes):');
    for (const g of gaps) {
      lines.push(`  - ${g}`);
    }
  }

  // Promotion mandate
  if (promotionMandate) {
    lines.push('');
    lines.push('=== PROMOTION MANDATE (BINDING) ===');
    lines.push('Promotion tier is at 0% coverage with 8+ entries. This is a structural gap.');
    lines.push('You MUST choose Promotion tier UNLESS the repo genuinely cannot support it.');
    lines.push('');
    lines.push('To reject Promotion, you MUST add a "promotion_rejection" field with one of:');
    lines.push('  - "no_shareable_surface" — repo has nothing demo-able or pitch-able');
    lines.push('  - "repo_private_or_internal" — repo is internal/private, not for public');
    lines.push('  - "insufficient_truth_atoms" — fewer than 10 truth atoms extracted');
    lines.push('  - "compliance_risk" — repo handles sensitive data, promotion inappropriate');
    lines.push('');
    lines.push('If you do NOT provide a valid rejection reason, your tier will be overridden to Promotion.');
    lines.push('');
    lines.push('PROMOTION GROUNDING (required when Promotion is chosen):');
    lines.push('Promotion artifacts MUST include in must_include:');
    lines.push('  - one CLI command or API call from the repo');
    lines.push('  - one invariant or guarantee');
    lines.push('  - one weird true detail (from truth atoms)');
    lines.push('  - one sharp edge or honest limitation');
    lines.push('This makes Promotion "shareable truth," not marketing fluff.');
  }

  // Signature move
  lines.push('');
  lines.push(`Assigned signature move for "${repoName}": ${move}`);
  lines.push('(A signature move is a visual/structural flourish: stamp, checksum box, margin notes, etc.)');

  lines.push('');
  lines.push('RULES: Season influences tier/format/constraint ranking — it does NOT force choices.');
  lines.push('Org bans MUST be obeyed. Gaps are soft preferences. Signature move should inform artifact design.');

  return {
    season,
    org_bans: bans,
    org_gaps: gaps,
    assigned_move: move,
    promotion_mandate: promotionMandate,
    formatted: lines.join('\n'),
  };
}

/** After a drive with --curate-org, write the ledger entry and recompute status */
export async function recordDecision(packet: DecisionPacket): Promise<void> {
  const entry = packetToLedger(packet);
  await appendLedger(entry);

  const status = await computeStatus();
  await saveStatus(status);
}
