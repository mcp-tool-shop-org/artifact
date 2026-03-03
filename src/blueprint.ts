/**
 * Blueprint Exporter (Phase 5)
 *
 * Transforms a DecisionPacket into a human-executable Blueprint Pack:
 *   ARTIFACT_BLUEPRINT.md  — 1–2 page action brief
 *   blueprint.json         — machine-readable mirror
 *   assets/                — empty placeholder skeleton
 *
 * Quality gates ensure the blueprint is never flimsy.
 * Provenance hashes make it litigation-proof (in the fun way).
 * Outline skeleton uses atom-seeded prompt slots, not generic prose.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import type {
  DecisionPacket, TruthBundle, TruthAtom, WebBrief,
  SelectedHook, InferenceProfile,
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
export async function loadTruthBundle(repoPath: string): Promise<TruthBundle | null> {
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

// ── SHA-256 helper ──────────────────────────────────────────────

async function fileHash(path: string): Promise<string | null> {
  try {
    const buf = await readFile(path);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

// ── Quality gates ───────────────────────────────────────────────

interface MissingInput {
  what: string;
  fix: string;
}

function checkQualityGates(
  packet: DecisionPacket,
  atoms: TruthAtom[],
): MissingInput[] {
  const missing: MissingInput[] = [];

  // Gate 1: at least 1 invariant atom with file+line
  const hasInvariant = atoms.some(a => a.type === 'invariant');
  if (!hasInvariant) {
    missing.push({
      what: 'No invariant atoms found',
      fix: 'Add documented invariants, guarantees, or constraints to README or source comments.',
    });
  }

  // Gate 2: at least 1 sharp_edge or anti_goal atom
  const hasEdge = atoms.some(a => a.type === 'sharp_edge' || a.type === 'anti_goal');
  if (!hasEdge) {
    missing.push({
      what: 'No sharp_edge or anti_goal atoms found',
      fix: 'Add a Limitations, Caveats, or Anti-Goals section to README.',
    });
  }

  // Gate 3: at least 1 CLI flag/command atom (for tooling repos)
  const hasCli = atoms.some(a => a.type === 'cli_command' || a.type === 'cli_flag');
  if (!hasCli) {
    missing.push({
      what: 'No cli_command or cli_flag atoms found',
      fix: 'Add usage examples with flags to README, or ensure --help is documented.',
    });
  }

  // Gate 4: freshness payload fully resolved
  const fp = packet.freshness_payload;
  if (fp.weird_detail.startsWith('unknown')) {
    missing.push({
      what: 'weird_detail unresolved',
      fix: 'Add at least one specific invariant, error string, or surprising constraint to the codebase.',
    });
  }
  if (fp.recent_change.startsWith('unknown')) {
    missing.push({
      what: 'recent_change unresolved',
      fix: 'No CHANGELOG found; add a CHANGELOG.md with recent entries or ensure recent commits have descriptive messages.',
    });
  }
  if (fp.sharp_edge.startsWith('unknown')) {
    missing.push({
      what: 'sharp_edge unresolved',
      fix: 'No sharp edge found; add a Limitations or Gotchas section to README.',
    });
  }

  // Gate 5: signature move present when org curation was used
  if (packet.season && packet.season !== 'none' && !packet.signature_move) {
    missing.push({
      what: 'Org curation active but no signature move assigned',
      fix: 'Re-run with --curate-org to assign a signature move from the season pool.',
    });
  }

  return missing;
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

// ── Atom-seeded prompt slots ────────────────────────────────────

/** Find the best atom of a given type for prompt slots */
function bestAtom(atoms: TruthAtom[], type: string): TruthAtom | undefined {
  const matches = atoms.filter(a => a.type === type);
  // Prefer highest confidence
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches[0];
}

/** Build a prompt slot from an atom — asks a question, seeded with real data */
function promptSlot(label: string, atom: TruthAtom | undefined, fallback: string): string {
  if (atom) {
    return `- [ ] ${label}: "${atom.value}" (${atom.source.file}:${atom.source.lineStart})`;
  }
  return `- [ ] ${label}: ${fallback}`;
}

// ── Outline skeleton generator ──────────────────────────────────

function buildOutlineSkeleton(packet: DecisionPacket, atoms: TruthAtom[]): string[] {
  const tier = packet.tier;
  const lines: string[] = [];

  // Common preamble
  lines.push('## Title');
  lines.push(`- [ ] Name this artifact (incorporate repo identity: "${packet.repo_name}")`);
  if (packet.signature_move) {
    lines.push(`- [ ] Apply signature move: **${packet.signature_move}**`);
  }

  lines.push('');
  lines.push('## Opening Hook');
  lines.push(promptSlot(
    'Lead with weird true detail',
    bestAtom(atoms, 'invariant') ?? bestAtom(atoms, 'error_string'),
    'find the most surprising real fact from the codebase',
  ));
  lines.push(promptSlot(
    'Ground in repo identity',
    bestAtom(atoms, 'repo_tagline') ?? bestAtom(atoms, 'core_purpose'),
    'what makes this repo unique?',
  ));

  // Tier-specific body with atom-seeded slots
  lines.push('');
  if (tier === 'Exec') {
    lines.push('## Situation');
    lines.push(promptSlot('Explain core purpose', bestAtom(atoms, 'core_purpose'), 'what problem does this solve?'));
    lines.push(promptSlot('State the guarantee', bestAtom(atoms, 'guarantee'), 'what does it promise?'));
    lines.push('');
    lines.push('## Decision / Insight');
    lines.push('- [ ] The one thing the reader needs to walk away with');
    lines.push('');
    lines.push('## Evidence');
    lines.push(promptSlot('Cite invariant', bestAtom(atoms, 'invariant'), 'real constraint or rule'));
    lines.push(promptSlot('Cite anti-goal', bestAtom(atoms, 'anti_goal'), 'what it deliberately does NOT do'));
  } else if (tier === 'Dev') {
    lines.push('## Setup / Prerequisites');
    lines.push(promptSlot('Primary CLI command', bestAtom(atoms, 'cli_command'), 'install or run command'));
    lines.push('');
    lines.push('## Core Content');
    lines.push(promptSlot('Key CLI flag', bestAtom(atoms, 'cli_flag'), 'most important flag/option'));
    lines.push(promptSlot('Config key', bestAtom(atoms, 'config_key'), 'primary configuration option'));
    lines.push(promptSlot('Explain invariant', bestAtom(atoms, 'invariant'), 'design constraint the user should know'));
    lines.push('');
    lines.push('## Edge Cases / Gotchas');
    lines.push(promptSlot('Describe sharp edge', bestAtom(atoms, 'sharp_edge'), 'what breaks or surprises'));
    lines.push(promptSlot('Error to expect', bestAtom(atoms, 'error_string'), 'common error and what triggers it'));
  } else if (tier === 'Creator') {
    lines.push('## Design Intent');
    lines.push(promptSlot('Visual identity from', bestAtom(atoms, 'core_object'), 'what visual metaphor fits?'));
    lines.push(promptSlot('Anti-goal constraint', bestAtom(atoms, 'anti_goal'), 'what it must NOT look like'));
    lines.push('');
    lines.push('## Specifications');
    lines.push('- [ ] Dimensions, formats, color constraints');
    lines.push('');
    lines.push('## Variations');
    lines.push('- [ ] Required variants (dark/light, sizes, contexts)');
  } else if (tier === 'Fun') {
    lines.push('## Rules / Mechanic');
    lines.push(promptSlot('Core game loop from', bestAtom(atoms, 'core_object'), 'what is the repo\'s main "move"?'));
    lines.push(promptSlot('Constraint to embed', bestAtom(atoms, 'invariant'), 'real rule that becomes a game rule'));
    lines.push('');
    lines.push('## Content');
    lines.push(promptSlot('Error as obstacle', bestAtom(atoms, 'error_string'), 'real error that becomes a challenge'));
    lines.push(promptSlot('CLI flag as power-up', bestAtom(atoms, 'cli_flag'), 'real flag that becomes an ability'));
    lines.push('');
    lines.push('## Win Condition / Punchline');
    lines.push(promptSlot('Guarantee as win state', bestAtom(atoms, 'guarantee'), 'what "winning" looks like'));
  } else if (tier === 'Promotion') {
    lines.push('## The Claim');
    lines.push(promptSlot('Tagline from', bestAtom(atoms, 'repo_tagline'), 'one sentence: what this tool does for you'));
    lines.push('');
    lines.push('## The Proof');
    lines.push(promptSlot('Cite invariant as evidence', bestAtom(atoms, 'invariant'), 'real constraint that proves quality'));
    lines.push(promptSlot('Cite sharp edge honestly', bestAtom(atoms, 'sharp_edge'), 'the limitation that builds trust'));
    lines.push('');
    lines.push('## Call to Action');
    lines.push(promptSlot('Install command', bestAtom(atoms, 'cli_command'), 'what the reader runs first'));
  }

  // Closing
  lines.push('');
  lines.push('## Closing');
  lines.push(promptSlot('Reinforce sharp edge', bestAtom(atoms, 'sharp_edge') ?? bestAtom(atoms, 'anti_goal'), 'what to watch for'));
  lines.push(promptSlot('End with core promise', bestAtom(atoms, 'guarantee') ?? bestAtom(atoms, 'core_purpose'), 'the repo\'s fundamental value'));

  return lines;
}

// ── Resolve atom from hook ──────────────────────────────────────

function resolveHookAtom(hook: SelectedHook, atoms: TruthAtom[]): TruthAtom | undefined {
  return atoms.find(a => a.id === hook.atom_id);
}

// ── Build ARTIFACT_BLUEPRINT.md ─────────────────────────────────

interface ProvenanceHashes {
  packet: string | null;
  bundle: string | null;
  webBrief: string | null;
}

function buildMarkdown(
  packet: DecisionPacket,
  atoms: TruthAtom[],
  webBrief: WebBrief | null,
  missingInputs: MissingInput[],
  hashes: ProvenanceHashes,
  version: string,
): string {
  const lines: string[] = [];
  const format = packet.format_candidates[0] ?? 'unknown';
  const formatHint = FORMAT_HINTS[format] ?? format;

  // Header
  lines.push(`# Artifact Blueprint: ${packet.repo_name}`);
  lines.push('');
  lines.push(`> Generated ${packet.driver_meta.timestamp.slice(0, 19)} by artifact v${version} (${packet.driver_meta.mode} driver)`);
  lines.push('');

  // ── Missing Inputs (quality gates) ──
  if (missingInputs.length > 0) {
    lines.push('## Missing Inputs');
    lines.push('');
    lines.push('*The following gaps were detected. Blueprint still generated, but address these for a stronger artifact:*');
    lines.push('');
    for (const m of missingInputs) {
      lines.push(`- **${m.what}** — ${m.fix}`);
    }
    lines.push('');
  }

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

  // ── Inference Profile (if present) ──
  if (packet.inference_profile) {
    const ip = packet.inference_profile;
    lines.push('## Inference Profile');
    lines.push('');
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Archetype | ${ip.repo_archetype} |`);
    lines.push(`| Primary user | ${ip.primary_user} |`);
    lines.push(`| Bottleneck | ${ip.primary_bottleneck} |`);
    lines.push(`| Maturity | ${ip.maturity} |`);
    lines.push(`| Risk | ${ip.risk_profile} |`);
    lines.push(`| Evidence | ${(ip.evidence_strength * 100).toFixed(0)}% |`);
    lines.push('');
    lines.push('**Tier weights:**');
    const sorted = Object.entries(ip.recommended_tier_weights)
      .sort(([, a], [, b]) => b - a);
    for (const [tier, weight] of sorted) {
      lines.push(`- ${tier}: ${Math.round(weight * 100)}%`);
    }
    lines.push('');
    if (ip.tier_rationale.length > 0) {
      lines.push('**Rationale:**');
      for (const r of ip.tier_rationale) {
        lines.push(`- ${r}`);
      }
      lines.push('');
    }
  }

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
  lines.push('*Atom-seeded prompt slots — fill in each checkbox, do not re-decide.*');
  lines.push('');
  lines.push(...buildOutlineSkeleton(packet, atoms));
  lines.push('');

  // ── Provenance ──
  lines.push('---');
  lines.push('');
  lines.push('## Provenance');
  lines.push('');
  lines.push(`- artifact v${version}`);
  lines.push(`- decision_packet: \`.artifact/decision_packet.json\`${hashes.packet ? ` (sha256: \`${hashes.packet.slice(0, 16)}...\`)` : ''}`);
  lines.push(`- truth_bundle: ${atoms.length} atoms${hashes.bundle ? ` (sha256: \`${hashes.bundle.slice(0, 16)}...\`)` : ''}`);
  if (webBrief) {
    lines.push(`- web_brief: \`.artifact/web/brief.json\`${hashes.webBrief ? ` (sha256: \`${hashes.webBrief.slice(0, 16)}...\`)` : ''}`);
  }
  lines.push(`- Driver: ${packet.driver_meta.mode} (model: ${packet.driver_meta.model ?? 'n/a'}, host: ${packet.driver_meta.host ?? 'n/a'})`);
  if (packet.season && packet.season !== 'none') {
    lines.push(`- Org ledger: \`~/.artifact/org/ledger.jsonl\``);
  }
  if (missingInputs.length > 0) {
    lines.push(`- Quality gates: ${missingInputs.length} missing input(s) detected`);
  } else {
    lines.push(`- Quality gates: all passed`);
  }
  lines.push('');

  return lines.join('\n');
}

// ── Build blueprint.json ────────────────────────────────────────

interface BlueprintJson {
  repo_name: string;
  generated_at: string;
  version: string;
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
  inference_profile: InferenceProfile | null;
  missing_inputs: MissingInput[];
  provenance: {
    decision_packet: string;
    decision_packet_sha256: string | null;
    truth_bundle_sha256: string | null;
    web_brief_sha256: string | null;
    truth_atoms_count: number;
    driver_mode: string;
    model: string | null;
    host: string | null;
    org_ledger: boolean;
    web_brief: boolean;
    version: string;
    quality_gates_passed: boolean;
  };
}

function buildJson(
  packet: DecisionPacket,
  atoms: TruthAtom[],
  webBrief: WebBrief | null,
  missingInputs: MissingInput[],
  hashes: ProvenanceHashes,
  version: string,
): BlueprintJson {
  const format = packet.format_candidates[0] ?? 'unknown';

  return {
    repo_name: packet.repo_name,
    generated_at: new Date().toISOString(),
    version,
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
    inference_profile: packet.inference_profile ?? null,
    missing_inputs: missingInputs,
    provenance: {
      decision_packet: '.artifact/decision_packet.json',
      decision_packet_sha256: hashes.packet,
      truth_bundle_sha256: hashes.bundle,
      web_brief_sha256: hashes.webBrief,
      truth_atoms_count: atoms.length,
      driver_mode: packet.driver_meta.mode,
      model: packet.driver_meta.model,
      host: packet.driver_meta.host,
      org_ledger: !!(packet.season && packet.season !== 'none'),
      web_brief: !!webBrief,
      version,
      quality_gates_passed: missingInputs.length === 0,
    },
  };
}

// ── Public API ──────────────────────────────────────────────────

export interface BlueprintResult {
  markdown_path: string;
  json_path: string;
  assets_path: string;
  missing_inputs: MissingInput[];
}

/** Read package.json version */
async function getVersion(repoPath: string): Promise<string> {
  try {
    const pkgPath = resolve(repoPath, 'package.json');
    const raw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
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

  // Quality gates
  const missingInputs = checkQualityGates(pkt, atoms);

  // Provenance hashes
  const outDir = resolve(repoPath, '.artifact');
  const hashes: ProvenanceHashes = {
    packet: await fileHash(resolve(outDir, 'decision_packet.json')),
    bundle: await fileHash(resolve(outDir, 'truth_bundle.json')),
    webBrief: await fileHash(resolve(outDir, 'web', 'brief.json')),
  };

  const version = await getVersion(repoPath);

  const assetsDir = resolve(outDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  // Generate markdown
  const md = buildMarkdown(pkt, atoms, webBrief, missingInputs, hashes, version);
  const mdPath = resolve(outDir, 'ARTIFACT_BLUEPRINT.md');
  await writeFile(mdPath, md, 'utf-8');

  // Generate JSON
  const json = buildJson(pkt, atoms, webBrief, missingInputs, hashes, version);
  const jsonPath = resolve(outDir, 'blueprint.json');
  await writeFile(jsonPath, JSON.stringify(json, null, 2) + '\n', 'utf-8');

  return {
    markdown_path: mdPath,
    json_path: jsonPath,
    assets_path: assetsDir,
    missing_inputs: missingInputs,
  };
}

export { FORMAT_HINTS };
