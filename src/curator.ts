/**
 * Curator — the Ollama-powered freshness driver.
 * Reads repo context (with TruthBundle) + history, returns a grounded decision packet.
 * No conversation. JSON only. All hooks must trace to truth atoms.
 */

import type { OllamaConnection } from './ollama.js';
import { generate } from './ollama.js';
import type { DecisionPacket, RepoContext, HistoryStore, FreshnessPayload, Tier, TruthAtom, SelectedHook, Callouts, WebBrief, PromotionRejection } from './types.js';
import { recentTiers, recentFormats, recentConstraints, recentAtomIds } from './history.js';
import { TIERS, FORMAT_FAMILIES } from './constants.js';

/** Format truth atoms for the Curator prompt — compact, citeable */
function formatAtoms(atoms: TruthAtom[]): string {
  if (atoms.length === 0) return 'No truth atoms extracted. Use placeholder hooks.';

  const grouped = new Map<string, TruthAtom[]>();
  for (const atom of atoms) {
    const list = grouped.get(atom.type) ?? [];
    list.push(atom);
    grouped.set(atom.type, list);
  }

  const sections: string[] = [];
  for (const [type, list] of grouped) {
    const items = list.map(a => `  [${a.id}] "${a.value}" (${a.source.file}:${a.source.lineStart})`);
    sections.push(`${type}:\n${items.join('\n')}`);
  }
  return sections.join('\n\n');
}

function buildPrompt(ctx: RepoContext, history: HistoryStore, memoryBrief?: string, webBrief?: string, curationBrief?: string, inferenceProfileText?: string): string {
  const usedTiers = recentTiers(history);
  const usedFormats = recentFormats(history);
  const usedConstraints = recentConstraints(history);
  const usedAtoms = recentAtomIds(history);

  const tiersAvail = TIERS.map(t => `${t}${usedTiers.includes(t) ? ' (used recently)' : ''}`).join(', ');
  const atomsSection = formatAtoms(ctx.truth_bundle.atoms);
  const memorySection = memoryBrief || '';

  return `You are the Curator — a silent freshness enforcement system for artifact selection.
You MUST respond with ONLY a JSON object. No markdown, no explanation, no prose.

REPO: "${ctx.repo_name}"
REPO TYPE: ${ctx.repo_type}

=== TRUTH ATOMS (grounded facts from this repo) ===
${atomsSection}

=== RECENTLY USED ATOM IDs (avoid repeating) ===
${usedAtoms.length > 0 ? usedAtoms.join(', ') : 'none'}
${memorySection ? `\n${memorySection}\n` : ''}${webBrief ? `\n${webBrief}\n\n` : ''}${inferenceProfileText ? `\n${inferenceProfileText}\n\n` : ''}${curationBrief ? `\n${curationBrief}\n\n` : ''}AVAILABLE TIERS: ${tiersAvail}
RECENTLY USED FORMATS (avoid): ${usedFormats.length > 0 ? usedFormats.join(', ') : 'none'}
RECENTLY USED CONSTRAINTS (vary): ${usedConstraints.length > 0 ? usedConstraints.join(', ') : 'none'}

AVAILABLE FORMAT FAMILIES PER TIER:
${TIERS.map(t => `${t}: ${FORMAT_FAMILIES[t].join(', ')}`).join('\n')}

CONSTRAINT DECKS (pick 2-3, mix categories):
Material: one-page, black-and-white, SVG-only, monospace-only
Mechanic: uses-core-loop, uses-failure-mode, uses-real-invariant, uses-two-opposing-forces
Tone: museum-placard, field-manual, heist-plan, lab-notebook, 90s-manual, dead-serious-one-joke
Structure: before-after, quest, threat-mitigation, recipe, trial-activation, signal-proof

YOUR JOB:
1. Pick a tier. If an INFERENCE PROFILE is provided, follow its recommended tier weights closely. Pick the highest-weighted tier unless org bans or recency demand otherwise
2. Pick 2-3 format families from that tier (avoid recently used ones)
3. Pick 2-3 constraints from different decks
4. List 3-5 must_include requirements that force repo-specificity
5. List 0-5 ban_list items (formats/motifs to avoid this run)
6. Select 2-4 hooks from the truth atoms. Each hook MUST reference an atom ID.
7. For freshness_payload, use REAL facts from the truth atoms:
   - weird_detail: pick the most surprising/specific invariant, error, or constraint atom
   - recent_change: pick a recent_change atom (or "unknown" if none exist)
   - sharp_edge: pick a sharp_edge or anti_goal atom (or "unknown" if none exist)
8. Provide 4 callouts (1 sentence each):
   - veto: what would be stale/generic/repetitive this run
   - twist: the required repo-specific hook that makes it unique
   - pick: your top format choice and why (if web brief available, you may reference a web finding ID)
   - risk: one thing to watch out for (optional, use "" if none)
9. If a WEB BRIEF is provided, you may use it to influence tier/format/constraint ranking.
   Any claim based on web MUST reference a finding ID in the relevant callout.
   Web CANNOT introduce facts about the repo — only external patterns/practices.

RESPOND WITH ONLY THIS JSON (no markdown fences, no text outside):
{
  "tier": "...",
  "format_candidates": ["...", "..."],
  "constraints": ["...", "..."],
  "must_include": ["...", "..."],
  "ban_list": ["..."],
  "selected_hooks": [
    { "atom_id": "...", "role": "name_hook" },
    { "atom_id": "...", "role": "invariant_hook" }
  ],
  "freshness_payload": {
    "weird_detail": "...",
    "recent_change": "...",
    "sharp_edge": "..."
  },
  "callouts": {
    "veto": "...",
    "twist": "...",
    "pick": "...",
    "risk": "..."
  },
  "promotion_rejection": null
}

NOTE: "promotion_rejection" should be null unless a PROMOTION MANDATE is active in the org curation brief AND you are rejecting it.
Valid rejection values: "no_shareable_surface", "repo_private_or_internal", "insufficient_truth_atoms", "compliance_risk".`;
}

const VALID_PROMOTION_REJECTIONS: PromotionRejection[] = [
  'no_shareable_surface',
  'repo_private_or_internal',
  'insufficient_truth_atoms',
  'compliance_risk',
];

interface CuratorResponse {
  tier?: string;
  format_candidates?: string[];
  constraints?: string[];
  must_include?: string[];
  ban_list?: string[];
  selected_hooks?: Array<{ atom_id?: string; role?: string }>;
  freshness_payload?: Partial<FreshnessPayload>;
  callouts?: Partial<Callouts>;
  promotion_rejection?: string;
}

function validateCallouts(raw: Partial<Callouts> | undefined): Callouts {
  return {
    veto: typeof raw?.veto === 'string' && raw.veto ? raw.veto : '',
    twist: typeof raw?.twist === 'string' && raw.twist ? raw.twist : '',
    pick: typeof raw?.pick === 'string' && raw.pick ? raw.pick : '',
    risk: typeof raw?.risk === 'string' && raw.risk ? raw.risk : '',
  };
}

function parseResponse(raw: string): CuratorResponse | null {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as CuratorResponse;
  } catch {
    return null;
  }
}

function validateTier(t: unknown): Tier {
  if (typeof t === 'string' && TIERS.includes(t as Tier)) return t as Tier;
  return 'Fun';
}

function validateFormats(candidates: unknown, tier: Tier): string[] {
  const pool = FORMAT_FAMILIES[tier];
  if (!Array.isArray(candidates)) return pool.slice(0, 3);
  const valid = candidates.filter((c): c is string => typeof c === 'string' && pool.includes(c));
  return valid.length >= 2 ? valid.slice(0, 3) : pool.slice(0, 3);
}

function validateStringArray(arr: unknown, fallback: string[]): string[] {
  if (!Array.isArray(arr)) return fallback;
  return arr.filter((s): s is string => typeof s === 'string' && s.length > 0);
}

/** Validate selected_hooks — must reference real atom IDs */
function validateHooks(hooks: unknown, atoms: TruthAtom[]): SelectedHook[] {
  if (!Array.isArray(hooks)) return [];
  const atomIds = new Set(atoms.map(a => a.id));

  return hooks
    .filter((h): h is { atom_id: string; role: string } =>
      typeof h === 'object' && h !== null &&
      typeof (h as Record<string, unknown>).atom_id === 'string' &&
      typeof (h as Record<string, unknown>).role === 'string')
    .filter(h => atomIds.has(h.atom_id))
    .slice(0, 4);
}

/** Resolve a value — if it looks like an atom ID, look up the atom's value */
function resolveValue(val: string | undefined, atoms: TruthAtom[]): string | undefined {
  if (!val || val === 'unknown') return undefined;
  // Check if the Curator returned an exact atom ID
  const exact = atoms.find(a => a.id === val);
  if (exact) return exact.value;
  // Check for bracketed prefix pattern: "[type:hash] actual text"
  const bracketMatch = val.match(/^\[([^\]]+)\]\s*(.*)/);
  if (bracketMatch) {
    const idPart = bracketMatch[1];
    const atom = atoms.find(a => a.id === idPart);
    if (atom) return atom.value;
    return bracketMatch[2] || val;
  }
  // Check for bare prefix pattern: "type:hash text" (no brackets)
  const bareMatch = val.match(/^(\w+:[a-f0-9]{12,16})\s+(.*)/);
  if (bareMatch) {
    const idPart = bareMatch[1];
    const atom = atoms.find(a => a.id === idPart);
    if (atom) return atom.value;
    return bareMatch[2] || val;
  }
  return val;
}

/** Build freshness payload from atoms — prefer real data, fall back gracefully */
function buildFreshnessPayload(parsed: Partial<FreshnessPayload> | undefined, atoms: TruthAtom[]): FreshnessPayload {
  const fallback = (type: string, label: string): string => {
    const atom = atoms.find(a => a.type === type);
    return atom ? atom.value : `unknown — no ${label} atoms found`;
  };

  const weird = resolveValue(parsed?.weird_detail, atoms);
  const change = resolveValue(parsed?.recent_change, atoms);
  const edge = resolveValue(parsed?.sharp_edge, atoms);

  return {
    weird_detail: weird ?? fallback('invariant', 'invariant'),
    recent_change: change ?? fallback('recent_change', 'recent_change'),
    sharp_edge: edge ?? fallback('sharp_edge', 'sharp_edge'),
  };
}

/** Run the Curator via Ollama. Returns a validated decision packet or null on failure. */
export async function drive(
  conn: OllamaConnection,
  ctx: RepoContext,
  history: HistoryStore,
  memoryBrief?: string,
  webBrief?: string,
  curationBrief?: string,
  promotionMandate?: boolean,
  inferenceProfileText?: string,
): Promise<DecisionPacket | null> {
  const prompt = buildPrompt(ctx, history, memoryBrief, webBrief, curationBrief, inferenceProfileText);
  const raw = await generate(conn, prompt);
  if (!raw) return null;

  const parsed = parseResponse(raw);
  if (!parsed) return null;

  let tier = validateTier(parsed.tier);
  let promotionRejection: PromotionRejection | undefined;

  // Promotion mandate enforcement
  if (promotionMandate && tier !== 'Promotion') {
    const rawRejection = parsed.promotion_rejection;
    if (typeof rawRejection === 'string' &&
        VALID_PROMOTION_REJECTIONS.includes(rawRejection as PromotionRejection)) {
      // Valid rejection — log it but respect the Curator's choice
      promotionRejection = rawRejection as PromotionRejection;
    } else {
      // No valid rejection — override to Promotion
      tier = 'Promotion';
    }
  }

  const selectedHooks = validateHooks(parsed.selected_hooks, ctx.truth_bundle.atoms);

  // If we overrode to Promotion, re-validate format candidates against Promotion pool
  const formatCandidates = validateFormats(parsed.format_candidates, tier);

  return {
    repo_name: ctx.repo_name,
    tier,
    format_candidates: formatCandidates,
    constraints: validateStringArray(parsed.constraints, ['monospace-only', 'uses-failure-mode']),
    must_include: validateStringArray(parsed.must_include, ['one repo-specific invariant', 'one concrete command or flag', 'one failure mode']),
    ban_list: validateStringArray(parsed.ban_list, []),
    freshness_payload: buildFreshnessPayload(parsed.freshness_payload, ctx.truth_bundle.atoms),
    selected_hooks: selectedHooks,
    callouts: validateCallouts(parsed.callouts),
    driver_meta: {
      host: conn.host,
      model: conn.model,
      mode: 'ollama',
      timestamp: new Date().toISOString(),
    },
    promotion_mandate: promotionMandate || undefined,
    promotion_rejection: promotionRejection,
  };
}

// Re-export for backward compat (consumers should prefer constants.ts)
export { FORMAT_FAMILIES, TIERS };
