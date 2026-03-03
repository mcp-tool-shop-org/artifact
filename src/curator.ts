/**
 * Curator — the Ollama-powered freshness driver.
 * Reads repo context + history, returns a structured decision packet.
 * No conversation. JSON only.
 */

import type { OllamaConnection } from './ollama.js';
import { generate } from './ollama.js';
import type { DecisionPacket, RepoContext, HistoryStore, FreshnessPayload, Tier } from './types.js';
import { recentTiers, recentFormats, recentConstraints } from './history.js';

const TIERS: Tier[] = ['Exec', 'Dev', 'Creator', 'Fun', 'Promotion'];

const FORMAT_FAMILIES: Record<Tier, string[]> = {
  Exec: ['E1_brief', 'E2_system_map', 'E3_risk_placard', 'E4_roadmap_postcard', 'E5_tradeoffs_memo', 'E6_decision_matrix', 'E7_slo_snapshot', 'E8_cost_envelope', 'E9_stakeholder_faq', 'E10_changelog_narrative'],
  Dev: ['D1_quickstart_card', 'D2_integration_recipes', 'D3_debug_tree', 'D4_api_contract', 'D5_test_matrix', 'D6_perf_knobs', 'D7_compat_table', 'D8_release_checklist', 'D9_ref_implementation', 'D10_pit_of_success'],
  Creator: ['C1_logo_variants', 'C2_icon_set', 'C3_sticker_sheet', 'C4_cover_poster', 'C5_diagram_pack', 'C6_ui_gallery', 'C7_theme_palette', 'C8_badge_pack', 'C9_template_pack', 'C10_presskit_skeleton'],
  Fun: ['F1_board_game', 'F2_card_deck', 'F3_choose_adventure', 'F4_boss_fight', 'F5_puzzle_page', 'F6_achievements', 'F7_comic_storyboard', 'F8_tarot_deck', 'F9_museum_placard', 'F10_lore_page'],
  Promotion: ['P1_one_slide_pitch', 'P2_demo_gif_storyboard', 'P3_launch_post_kit', 'P4_before_after_proof', 'P5_screenshot_story', 'P6_comparison_chart', 'P7_faq_skeptics', 'P8_demo_script', 'P9_boilerplate_tagline', 'P10_presskit_checklist'],
};

function buildPrompt(ctx: RepoContext, history: HistoryStore): string {
  const usedTiers = recentTiers(history);
  const usedFormats = recentFormats(history);
  const usedConstraints = recentConstraints(history);

  const tiersAvail = TIERS.map(t => `${t}${usedTiers.includes(t) ? ' (used recently)' : ''}`).join(', ');

  const truthSection = ctx.truth_atoms.length > 0
    ? `Truth atoms from this repo:\n${ctx.truth_atoms.map(a => `- ${a}`).join('\n')}`
    : 'No truth atoms extracted yet. Use placeholder hooks that Phase 2 can fill.';

  return `You are the Curator — a silent freshness enforcement system for artifact selection.
You MUST respond with ONLY a JSON object. No markdown, no explanation, no prose.

REPO: "${ctx.repo_name}"
REPO TYPE: ${ctx.repo_type}
${truthSection}

AVAILABLE TIERS: ${tiersAvail}
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
1. Pick a tier (avoid recently used ones unless the repo demands it)
2. Pick 2-3 format families from that tier (avoid recently used ones)
3. Pick 2-3 constraints from different decks
4. List 3-5 must_include requirements that force repo-specificity
5. List 0-5 ban_list items (formats/motifs to avoid this run)
6. Provide a freshness_payload with three fields: weird_detail, recent_change, sharp_edge (use actual repo facts if truth_atoms exist, otherwise use "unknown — Phase 2 will extract")

RESPOND WITH ONLY THIS JSON (no markdown fences, no text outside):
{
  "tier": "...",
  "format_candidates": ["...", "..."],
  "constraints": ["...", "..."],
  "must_include": ["...", "..."],
  "ban_list": ["..."],
  "freshness_payload": {
    "weird_detail": "...",
    "recent_change": "...",
    "sharp_edge": "..."
  }
}`;
}

interface CuratorResponse {
  tier?: string;
  format_candidates?: string[];
  constraints?: string[];
  must_include?: string[];
  ban_list?: string[];
  freshness_payload?: Partial<FreshnessPayload>;
}

function parseResponse(raw: string): CuratorResponse | null {
  // Strip markdown fences if the model wraps them anyway
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  // Find the first { and last }
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
  return 'Fun'; // safe default
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

function validatePayload(p: unknown): FreshnessPayload {
  const defaults: FreshnessPayload = {
    weird_detail: 'unknown — Phase 2 will extract',
    recent_change: 'unknown — Phase 2 will extract',
    sharp_edge: 'unknown — Phase 2 will extract',
  };
  if (!p || typeof p !== 'object') return defaults;
  const obj = p as Partial<FreshnessPayload>;
  return {
    weird_detail: typeof obj.weird_detail === 'string' && obj.weird_detail ? obj.weird_detail : defaults.weird_detail,
    recent_change: typeof obj.recent_change === 'string' && obj.recent_change ? obj.recent_change : defaults.recent_change,
    sharp_edge: typeof obj.sharp_edge === 'string' && obj.sharp_edge ? obj.sharp_edge : defaults.sharp_edge,
  };
}

/** Run the Curator via Ollama. Returns a validated decision packet or null on failure. */
export async function drive(
  conn: OllamaConnection,
  ctx: RepoContext,
  history: HistoryStore,
): Promise<DecisionPacket | null> {
  const prompt = buildPrompt(ctx, history);
  const raw = await generate(conn, prompt);
  if (!raw) return null;

  const parsed = parseResponse(raw);
  if (!parsed) return null;

  const tier = validateTier(parsed.tier);
  return {
    repo_name: ctx.repo_name,
    tier,
    format_candidates: validateFormats(parsed.format_candidates, tier),
    constraints: validateStringArray(parsed.constraints, ['monospace-only', 'uses-failure-mode']),
    must_include: validateStringArray(parsed.must_include, ['one repo-specific invariant', 'one concrete command or flag', 'one failure mode']),
    ban_list: validateStringArray(parsed.ban_list, []),
    freshness_payload: validatePayload(parsed.freshness_payload),
    driver_meta: {
      host: conn.host,
      model: conn.model,
      mode: 'ollama',
      timestamp: new Date().toISOString(),
    },
  };
}

export { FORMAT_FAMILIES, TIERS };
