/**
 * Blueprint Exporter (Phase 5)
 *
 * Transforms a DecisionPacket into a human-executable Blueprint Pack:
 *   ARTIFACT_BLUEPRINT.md  — 1–2 page action brief
 *   blueprint.json         — machine-readable mirror
 *   assets/                — empty placeholder skeleton
 *
 * No new intelligence. Just makes existing decisions usable.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import type {
  DecisionPacket, TruthBundle, TruthAtom, WebBrief,
  WebRecommendation, SelectedHook,
} from './types.js';

// ── Load helpers ────────────────────────────────────────────────

/** Load the latest decision packet from .artifact/ */
export async function loadPacket(repoPath: string): Promise<DecisionPacket | null> {
  const file = resolve(repoPath, '.artifact', 'decision_packet.json');
  try {
    const raw = await readFile(file, 'utf-8');
    return JSON.parse(raw) as DecisionPacket;
  } catch {
    return null;
  }
}

/** Load the truth bundle from .artifact/ */
async function loadTruthBundle(repoPath: string): Promise<TruthBundle | null> {
  const file = resolve(repoPath, '.artifact', 'truth_bundle.json');
  try {
    const raw = await readFile(file, 'utf-8');
    return JSON.parse(raw) as TruthBundle;
  } catch {
    return null;
  }
}

/** Load the web brief from .artifact/web/ */
async function loadWebBrief(repoPath: string): Promise<WebBrief | null> {
  const file = resolve(repoPath, '.artifact', 'web', 'brief.json');
  try {
    const raw = await readFile(file, 'utf-8');
    return JSON.parse(raw) as WebBrief;
  } catch {
    return null;
  }
}

// ── Format family descriptions ──────────────────────────────────

const FORMAT_HINTS: Record<string, string> = {
  E1_brief: 'Executive brief — 1-page situation summary for decision-makers',
  E2_system_map: 'System map — visual overview of components and data flow',
  E3_risk_placard: 'Risk placard — threat/mitigation pairs, visible at a glance',
  E4_roadmap_postcard: 'Roadmap postcard — timeline + milestones on one card',
  E5_tradeoffs_memo: 'Tradeoffs memo — what you gain, what you pay, why',
  E6_decision_matrix: 'Decision matrix — weighted comparison of options',
  E7_slo_snapshot: 'SLO snapshot — current service levels + targets',
  E8_cost_envelope: 'Cost envelope — budget boundaries + burn rate',
  E9_stakeholder_faq: 'Stakeholder FAQ — pre-answered questions for leadership',
  E10_changelog_narrative: 'Changelog narrative — story of what shipped and why',
  D1_quickstart_card: 'Quickstart card — install-to-first-result in <5 steps',
  D2_integration_recipes: 'Integration recipes — copy-paste patterns for common setups',
  D3_debug_tree: 'Debug tree — decision tree for common failure modes',
  D4_api_contract: 'API contract — inputs, outputs, guarantees, edge cases',
  D5_test_matrix: 'Test matrix — what\'s tested, what\'s not, coverage map',
  D6_perf_knobs: 'Perf knobs — tuning guide with before/after numbers',
  D7_compat_table: 'Compatibility table — what works where, version matrix',
  D8_release_checklist: 'Release checklist — ship-day runbook',
  D9_ref_implementation: 'Reference implementation — canonical example with annotations',
  D10_pit_of_success: 'Pit of success — guardrails that make the right thing easy',
  C1_logo_variants: 'Logo variants — primary, monochrome, icon, dark/light',
  C2_icon_set: 'Icon set — consistent iconography for the project',
  C3_sticker_sheet: 'Sticker sheet — die-cut assets for swag/branding',
  C4_cover_poster: 'Cover poster — large-format visual identity piece',
  C5_diagram_pack: 'Diagram pack — architecture, flow, and concept visuals',
  C6_ui_gallery: 'UI gallery — screenshot tour of key screens/states',
  C7_theme_palette: 'Theme palette — colors, fonts, spacing tokens',
  C8_badge_pack: 'Badge pack — status/quality/version badges',
  C9_template_pack: 'Template pack — reusable document/issue templates',
  C10_presskit_skeleton: 'Presskit skeleton — media assets + talking points',
  F1_board_game: 'Board game — repo mechanics as a playable game',
  F2_card_deck: 'Card deck — concepts/commands/errors as collectible cards',
  F3_choose_adventure: 'Choose your adventure — branching narrative through the repo',
  F4_boss_fight: 'Boss fight — hardest problems as game encounters',
  F5_puzzle_page: 'Puzzle page — repo knowledge as interactive puzzles',
  F6_achievements: 'Achievements — unlockable milestones for repo mastery',
  F7_comic_storyboard: 'Comic storyboard — visual story of how the tool works',
  F8_tarot_deck: 'Tarot deck — repo archetypes as fortune cards',
  F9_museum_placard: 'Museum placard — exhibit-style explanation card',
  F10_lore_page: 'Lore page — in-universe backstory for the project',
  P1_one_slide_pitch: 'One-slide pitch — the entire value prop on one slide',
  P2_demo_gif_storyboard: 'Demo GIF storyboard — frame-by-frame demo plan',
  P3_launch_post_kit: 'Launch post kit — copy + assets for announcement',
  P4_before_after_proof: 'Before/after proof — tangible improvement evidence',
  P5_screenshot_story: 'Screenshot story — visual walkthrough narrative',
  P6_comparison_chart: 'Comparison chart — this vs. alternatives',
  P7_faq_skeptics: 'FAQ for skeptics — objections answered with evidence',
  P8_demo_script: 'Demo script — timed walkthrough with talking points',
  P9_boilerplate_tagline: 'Boilerplate + tagline — one-liner + paragraph description',
  P10_presskit_checklist: 'Presskit checklist — what media needs to cover you',
};

// ── Outline skeleton generator ──────────────────────────────────

function buildOutlineSkeleton(packet: DecisionPacket): string[] {
  const format = packet.format_candidates[0] ?? 'unknown';
  const tier = packet.tier;
  const lines: string[] = [];

  // Common preamble sections
  lines.push('## Title');
  lines.push(`- [ ] Name this artifact (incorporate repo identity: "${packet.repo_name}")`)
  if (packet.signature_move) {
    lines.push(`- [ ] Apply signature move: **${packet.signature_move}**`);
  }

  lines.push('');
  lines.push('## Opening Hook');
  lines.push('- [ ] Lead with the weird true detail (see Freshness section below)');
  lines.push('- [ ] Ground in repo identity — this could only be about this repo');

  // Tier-specific body sections
  lines.push('');
  if (tier === 'Exec') {
    lines.push('## Situation');
    lines.push('- [ ] What exists, what\'s at stake');
    lines.push('');
    lines.push('## Decision / Insight');
    lines.push('- [ ] The one thing the reader needs to walk away with');
    lines.push('');
    lines.push('## Evidence');
    lines.push('- [ ] Ground in truth atoms (invariants, guarantees, real numbers)');
  } else if (tier === 'Dev') {
    lines.push('## Setup / Prerequisites');
    lines.push('- [ ] What the reader needs before starting');
    lines.push('');
    lines.push('## Core Content');
    lines.push('- [ ] The main technical payload');
    lines.push('- [ ] Include real commands, flags, config keys from truth atoms');
    lines.push('');
    lines.push('## Edge Cases / Gotchas');
    lines.push('- [ ] Sharp edges and failure modes');
  } else if (tier === 'Creator') {
    lines.push('## Design Intent');
    lines.push('- [ ] What this visual/asset communicates');
    lines.push('');
    lines.push('## Specifications');
    lines.push('- [ ] Dimensions, formats, color constraints');
    lines.push('');
    lines.push('## Variations');
    lines.push('- [ ] Required variants (dark/light, sizes, contexts)');
  } else if (tier === 'Fun') {
    lines.push('## Rules / Mechanic');
    lines.push('- [ ] How it works (grounded in repo mechanics)');
    lines.push('');
    lines.push('## Content');
    lines.push('- [ ] The playable/readable payload');
    lines.push('- [ ] Each piece must trace to a real repo fact');
    lines.push('');
    lines.push('## Win Condition / Punchline');
    lines.push('- [ ] What "done" looks like');
  } else if (tier === 'Promotion') {
    lines.push('## The Claim');
    lines.push('- [ ] One sentence: what this tool does for you');
    lines.push('');
    lines.push('## The Proof');
    lines.push('- [ ] Evidence grounded in truth atoms');
    lines.push('');
    lines.push('## Call to Action');
    lines.push('- [ ] What the reader does next');
  }

  // Closing
  lines.push('');
  lines.push('## Closing');
  lines.push('- [ ] Reinforce the sharp edge (what to watch for)');
  lines.push('- [ ] End with the repo\'s core promise');

  return lines;
}

// ── Resolve atom from hook ──────────────────────────────────────

function resolveHookAtom(hook: SelectedHook, atoms: TruthAtom[]): TruthAtom | undefined {
  return atoms.find(a => a.id === hook.atom_id);
}

// ── Build ARTIFACT_BLUEPRINT.md ─────────────────────────────────

function buildMarkdown(
  packet: DecisionPacket,
  atoms: TruthAtom[],
  webBrief: WebBrief | null,
): string {
  const lines: string[] = [];
  const format = packet.format_candidates[0] ?? 'unknown';
  const formatHint = FORMAT_HINTS[format] ?? format;

  // Header
  lines.push(`# Artifact Blueprint: ${packet.repo_name}`);
  lines.push('');
  lines.push(`> Generated ${packet.driver_meta.timestamp.slice(0, 19)} by artifact ${packet.driver_meta.mode} driver`);
  lines.push('');

  // ── Pick ──
  lines.push('## Pick');
  lines.push('');
  lines.push(`**Tier:** ${packet.tier}`);
  lines.push(`**Format:** ${format} — ${formatHint}`);
  if (packet.format_candidates.length > 1) {
    const alts = packet.format_candidates.slice(1).map(f => {
      const hint = FORMAT_HINTS[f];
      return hint ? `${f} (${hint})` : f;
    });
    lines.push(`**Alternates:** ${alts.join(', ')}`);
  }
  if (packet.season && packet.season !== 'none') {
    lines.push(`**Season:** ${packet.season}`);
  }
  if (packet.signature_move) {
    lines.push(`**Signature Move:** ${packet.signature_move}`);
  }
  lines.push('');

  // ── Constraints ──
  lines.push('## Constraints');
  lines.push('');
  for (const c of packet.constraints) {
    lines.push(`- ${c}`);
  }
  lines.push('');

  // ── Hooks (TruthAtom references) ──
  lines.push('## Hooks (grounded in TruthAtoms)');
  lines.push('');
  if (packet.selected_hooks.length > 0) {
    for (const hook of packet.selected_hooks) {
      const atom = resolveHookAtom(hook, atoms);
      if (atom) {
        lines.push(`- **${hook.role}** — \`${atom.id}\``);
        lines.push(`  "${atom.value}"`);
        lines.push(`  Source: \`${atom.source.file}:${atom.source.lineStart}\``);
      } else {
        lines.push(`- **${hook.role}** — \`${hook.atom_id}\` (atom not found in bundle)`);
      }
    }
  } else {
    lines.push('*No hooks selected (fallback driver — use invariants from must_include list)*');
  }
  lines.push('');

  // ── Must-Include Checklist ──
  lines.push('## Must-Include Checklist');
  lines.push('');
  for (const item of packet.must_include) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push('');

  // ── Freshness Payload ──
  lines.push('## Freshness (the details that prove this is real)');
  lines.push('');
  lines.push(`**Weird true detail:** ${packet.freshness_payload.weird_detail}`);
  lines.push(`**Recent change:** ${packet.freshness_payload.recent_change}`);
  lines.push(`**Sharp edge:** ${packet.freshness_payload.sharp_edge}`);
  lines.push('');

  // ── Ban List ──
  if (packet.ban_list.length > 0) {
    lines.push('## Ban List (do not use)');
    lines.push('');
    for (const b of packet.ban_list) {
      lines.push(`- ~~${b}~~`);
    }
    lines.push('');
  }

  // ── Org Curation (if present) ──
  if (packet.org_bans_applied?.length || packet.org_gap_bias?.length) {
    lines.push('## Org Curation Context');
    lines.push('');
    if (packet.org_bans_applied?.length) {
      lines.push('**Org bans applied:**');
      for (const b of packet.org_bans_applied) {
        lines.push(`- ${b}`);
      }
    }
    if (packet.org_gap_bias?.length) {
      lines.push('**Org gaps (soft bias):**');
      for (const g of packet.org_gap_bias) {
        lines.push(`- ${g}`);
      }
    }
    lines.push('');
  }

  // ── Web Recommendations (if present) ──
  if (webBrief && webBrief.recommendations.length > 0) {
    lines.push('## Recommended Patterns (from web)');
    lines.push('');
    lines.push(`*Focus: ${webBrief.focus}*`);
    lines.push(`*${webBrief.finding_count} findings, status: ${webBrief.web_status}*`);
    lines.push('');
    for (const rec of webBrief.recommendations) {
      lines.push(`### ${rec.recommendation}`);
      lines.push(`**Why now:** ${rec.why_now}`);
      lines.push(`**Apply to:** ${rec.apply_to}`);
      if (rec.citations.length > 0) {
        lines.push(`**Citations:** ${rec.citations.join(', ')}`);
      }
      lines.push('');
    }
  }

  // ── Curator Voice (callouts) ──
  const c = packet.callouts;
  if (c.veto || c.twist || c.pick || c.risk) {
    lines.push('## Curator Notes');
    lines.push('');
    if (c.veto) lines.push(`**Veto:** ${c.veto}`);
    if (c.twist) lines.push(`**Twist:** ${c.twist}`);
    if (c.pick) lines.push(`**Pick rationale:** ${c.pick}`);
    if (c.risk) lines.push(`**Risk:** ${c.risk}`);
    lines.push('');
  }

  // ── Outline Skeleton ──
  lines.push('---');
  lines.push('');
  lines.push('# Outline Skeleton');
  lines.push('');
  lines.push('*Headings and bullet prompts — fill in, do not re-decide.*');
  lines.push('');
  lines.push(...buildOutlineSkeleton(packet));
  lines.push('');

  // ── Provenance ──
  lines.push('---');
  lines.push('');
  lines.push('## Provenance');
  lines.push('');
  lines.push(`- Decision packet: \`.artifact/decision_packet.json\``);
  lines.push(`- Truth bundle: ${atoms.length} atoms from scanned files`);
  lines.push(`- Driver: ${packet.driver_meta.mode} (model: ${packet.driver_meta.model ?? 'n/a'}, host: ${packet.driver_meta.host ?? 'n/a'})`);
  if (packet.season && packet.season !== 'none') {
    lines.push(`- Org ledger: \`~/.artifact/org/ledger.jsonl\``);
  }
  if (webBrief) {
    lines.push(`- Web brief: \`.artifact/web/brief.json\``);
  }
  lines.push('');

  return lines.join('\n');
}

// ── Build blueprint.json ────────────────────────────────────────

interface BlueprintJson {
  repo_name: string;
  generated_at: string;
  driver_mode: string;
  pick: {
    tier: string;
    format: string;
    format_hint: string;
    alternates: string[];
    season: string | null;
    signature_move: string | null;
  };
  constraints: string[];
  hooks: Array<{
    role: string;
    atom_id: string;
    value: string | null;
    source: string | null;
  }>;
  must_include: string[];
  freshness: {
    weird_detail: string;
    recent_change: string;
    sharp_edge: string;
  };
  ban_list: string[];
  org_curation: {
    bans_applied: string[];
    gap_bias: string[];
  } | null;
  web_recommendations: Array<{
    recommendation: string;
    why_now: string;
    apply_to: string;
    citations: string[];
  }> | null;
  callouts: {
    veto: string;
    twist: string;
    pick: string;
    risk: string;
  };
  provenance: {
    decision_packet: string;
    truth_atoms_count: number;
    driver_mode: string;
    model: string | null;
    host: string | null;
    org_ledger: boolean;
    web_brief: boolean;
  };
}

function buildJson(
  packet: DecisionPacket,
  atoms: TruthAtom[],
  webBrief: WebBrief | null,
): BlueprintJson {
  const format = packet.format_candidates[0] ?? 'unknown';

  return {
    repo_name: packet.repo_name,
    generated_at: new Date().toISOString(),
    driver_mode: packet.driver_meta.mode,
    pick: {
      tier: packet.tier,
      format,
      format_hint: FORMAT_HINTS[format] ?? format,
      alternates: packet.format_candidates.slice(1),
      season: packet.season && packet.season !== 'none' ? packet.season : null,
      signature_move: packet.signature_move ?? null,
    },
    constraints: packet.constraints,
    hooks: packet.selected_hooks.map(h => {
      const atom = resolveHookAtom(h, atoms);
      return {
        role: h.role,
        atom_id: h.atom_id,
        value: atom?.value ?? null,
        source: atom ? `${atom.source.file}:${atom.source.lineStart}` : null,
      };
    }),
    must_include: packet.must_include,
    freshness: packet.freshness_payload,
    ban_list: packet.ban_list,
    org_curation: (packet.org_bans_applied?.length || packet.org_gap_bias?.length) ? {
      bans_applied: packet.org_bans_applied ?? [],
      gap_bias: packet.org_gap_bias ?? [],
    } : null,
    web_recommendations: webBrief && webBrief.recommendations.length > 0
      ? webBrief.recommendations
      : null,
    callouts: packet.callouts,
    provenance: {
      decision_packet: '.artifact/decision_packet.json',
      truth_atoms_count: atoms.length,
      driver_mode: packet.driver_meta.mode,
      model: packet.driver_meta.model,
      host: packet.driver_meta.host,
      org_ledger: !!(packet.season && packet.season !== 'none'),
      web_brief: !!webBrief,
    },
  };
}

// ── Public API ──────────────────────────────────────────────────

export interface BlueprintResult {
  markdown_path: string;
  json_path: string;
  assets_path: string;
}

/**
 * Generate a Blueprint Pack from the latest decision packet.
 * Writes: .artifact/ARTIFACT_BLUEPRINT.md, .artifact/blueprint.json, .artifact/assets/
 */
export async function generate(repoPath: string, packet?: DecisionPacket): Promise<BlueprintResult | null> {
  const pkt = packet ?? await loadPacket(repoPath);
  if (!pkt) return null;

  const truthBundle = await loadTruthBundle(repoPath);
  const atoms = truthBundle?.atoms ?? [];
  const webBrief = await loadWebBrief(repoPath);

  const outDir = resolve(repoPath, '.artifact');
  const assetsDir = resolve(outDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  // Generate markdown
  const md = buildMarkdown(pkt, atoms, webBrief);
  const mdPath = resolve(outDir, 'ARTIFACT_BLUEPRINT.md');
  await writeFile(mdPath, md, 'utf-8');

  // Generate JSON
  const json = buildJson(pkt, atoms, webBrief);
  const jsonPath = resolve(outDir, 'blueprint.json');
  await writeFile(jsonPath, JSON.stringify(json, null, 2) + '\n', 'utf-8');

  return {
    markdown_path: mdPath,
    json_path: jsonPath,
    assets_path: assetsDir,
  };
}
