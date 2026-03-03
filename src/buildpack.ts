/**
 * Builder Pack (Phase 10)
 *
 * Emits a "builder prompt packet" — a single text block designed
 * for pasting into a chat LLM to generate the actual artifact.
 *
 * The packet contains everything the builder needs:
 *   - Role instruction
 *   - Blueprint outline skeleton (atom-seeded prompt slots)
 *   - Truth atoms with file:line
 *   - Must-include checklist
 *   - Banned list + org bans
 *   - Constraint & signature move requirements
 *   - Freshness payload
 *
 * No Ollama needed. Pure file reads + formatting.
 */

import { resolve } from 'node:path';
import { loadPacket, loadTruthBundle, FORMAT_HINTS } from './blueprint.js';
import { getPersona, formatPersonaForPrompt } from './persona.js';
import type { DecisionPacket, TruthAtom, TruthBundle, SelectedHook } from './types.js';

// ── Atom formatting ─────────────────────────────────────────────

function formatAtomsForBuilder(atoms: TruthAtom[]): string {
  if (atoms.length === 0) return 'No truth atoms available.';

  const grouped = new Map<string, TruthAtom[]>();
  for (const atom of atoms) {
    const list = grouped.get(atom.type) ?? [];
    list.push(atom);
    grouped.set(atom.type, list);
  }

  const sections: string[] = [];
  for (const [type, list] of grouped) {
    const items = list.map(a =>
      `  [${a.id}] "${a.value}" (${a.source.file}:${a.source.lineStart})`
    );
    sections.push(`${type}:\n${items.join('\n')}`);
  }
  return sections.join('\n\n');
}

// ── Hook formatting ─────────────────────────────────────────────

function formatHooks(hooks: SelectedHook[], atoms: TruthAtom[]): string {
  if (hooks.length === 0) return 'No hooks selected — use atoms from must-include list.';

  return hooks.map(h => {
    const atom = atoms.find(a => a.id === h.atom_id);
    if (atom) {
      return `- ${h.role}: "${atom.value}" [${atom.id}] (${atom.source.file}:${atom.source.lineStart})`;
    }
    return `- ${h.role}: [${h.atom_id}] (atom not found)`;
  }).join('\n');
}

// ── Outline skeleton (compact, for prompt context) ──────────────

function buildOutlineForPrompt(packet: DecisionPacket, atoms: TruthAtom[]): string {
  const lines: string[] = [];
  const tier = packet.tier;

  function bestAtom(type: string): TruthAtom | undefined {
    const matches = atoms.filter(a => a.type === type);
    matches.sort((a, b) => b.confidence - a.confidence);
    return matches[0];
  }

  function slot(label: string, atom: TruthAtom | undefined, fallback: string): string {
    if (atom) {
      return `- ${label}: "${atom.value}" (${atom.source.file}:${atom.source.lineStart})`;
    }
    return `- ${label}: ${fallback}`;
  }

  lines.push('## Title');
  lines.push(`- Name this artifact (incorporate "${packet.repo_name}")`);
  if (packet.signature_move) {
    lines.push(`- Apply signature move: ${packet.signature_move}`);
  }

  lines.push('');
  lines.push('## Opening Hook');
  lines.push(slot('Lead with weird true detail',
    bestAtom('invariant') ?? bestAtom('error_string'),
    'find the most surprising real fact'));
  lines.push(slot('Ground in repo identity',
    bestAtom('repo_tagline') ?? bestAtom('core_purpose'),
    'what makes this repo unique?'));

  lines.push('');
  if (tier === 'Exec') {
    lines.push('## Situation');
    lines.push(slot('Core purpose', bestAtom('core_purpose'), 'what problem does this solve?'));
    lines.push(slot('Guarantee', bestAtom('guarantee'), 'what does it promise?'));
    lines.push('## Decision / Insight');
    lines.push('- The one thing the reader walks away with');
    lines.push('## Evidence');
    lines.push(slot('Cite invariant', bestAtom('invariant'), 'real constraint'));
    lines.push(slot('Cite anti-goal', bestAtom('anti_goal'), 'what it does NOT do'));
  } else if (tier === 'Dev') {
    lines.push('## Setup');
    lines.push(slot('Primary CLI command', bestAtom('cli_command'), 'install or run command'));
    lines.push('## Core Content');
    lines.push(slot('Key CLI flag', bestAtom('cli_flag'), 'most important flag'));
    lines.push(slot('Config key', bestAtom('config_key'), 'primary config option'));
    lines.push(slot('Invariant', bestAtom('invariant'), 'design constraint'));
    lines.push('## Edge Cases');
    lines.push(slot('Sharp edge', bestAtom('sharp_edge'), 'what breaks'));
    lines.push(slot('Error to expect', bestAtom('error_string'), 'common error'));
  } else if (tier === 'Creator') {
    lines.push('## Design Intent');
    lines.push(slot('Visual identity from', bestAtom('core_object'), 'visual metaphor'));
    lines.push(slot('Anti-goal constraint', bestAtom('anti_goal'), 'must NOT look like'));
    lines.push('## Specifications');
    lines.push('- Dimensions, formats, color constraints');
    lines.push('## Variations');
    lines.push('- Required variants (dark/light, sizes)');
  } else if (tier === 'Fun') {
    lines.push('## Rules / Mechanic');
    lines.push(slot('Core game loop from', bestAtom('core_object'), 'main "move"'));
    lines.push(slot('Constraint to embed', bestAtom('invariant'), 'real rule → game rule'));
    lines.push('## Content');
    lines.push(slot('Error as obstacle', bestAtom('error_string'), 'error → challenge'));
    lines.push(slot('CLI flag as power-up', bestAtom('cli_flag'), 'flag → ability'));
    lines.push('## Win Condition');
    lines.push(slot('Guarantee as win state', bestAtom('guarantee'), 'what winning looks like'));
  } else if (tier === 'Promotion') {
    lines.push('## The Claim');
    lines.push(slot('Tagline', bestAtom('repo_tagline'), 'one sentence value prop'));
    lines.push('## The Proof');
    lines.push(slot('Invariant as evidence', bestAtom('invariant'), 'proves quality'));
    lines.push(slot('Sharp edge honestly', bestAtom('sharp_edge'), 'builds trust'));
    lines.push('## Call to Action');
    lines.push(slot('Install command', bestAtom('cli_command'), 'what reader runs first'));
  }

  lines.push('');
  lines.push('## Closing');
  lines.push(slot('Reinforce sharp edge',
    bestAtom('sharp_edge') ?? bestAtom('anti_goal'),
    'what to watch for'));
  lines.push(slot('End with core promise',
    bestAtom('guarantee') ?? bestAtom('core_purpose'),
    'fundamental value'));

  return lines.join('\n');
}

// ── Build the prompt packet ─────────────────────────────────────

async function buildPromptPacket(
  packet: DecisionPacket,
  atoms: TruthAtom[],
): Promise<string> {
  const format = packet.format_candidates[0] ?? 'unknown';
  const formatHint = FORMAT_HINTS[format] ?? format;
  const alternates = packet.format_candidates.slice(1);

  const sections: string[] = [];

  // ── Role instruction (persona-driven) ──
  const persona = await getPersona();
  sections.push(`=== ROLE ===
${formatPersonaForPrompt(persona)}

You will create a single, complete artifact for the repo "${packet.repo_name}".
Every claim must trace to a truth atom. Do not invent facts. Do not produce generic content.`);

  // ── Pick ──
  sections.push(`=== PICK ===
Tier: ${packet.tier}
Format: ${format} — ${formatHint}${alternates.length > 0 ? `\nAlternates: ${alternates.map(f => `${f} (${FORMAT_HINTS[f] ?? f})`).join(', ')}` : ''}${packet.season && packet.season !== 'none' ? `\nSeason: ${packet.season}` : ''}${packet.signature_move ? `\nSignature Move: ${packet.signature_move} — weave this visual/structural motif throughout` : ''}`);

  // ── Constraints ──
  sections.push(`=== CONSTRAINTS (must obey) ===
${packet.constraints.map(c => `- ${c}`).join('\n')}`);

  // ── Must-include checklist ──
  sections.push(`=== MUST-INCLUDE CHECKLIST ===
Every item below MUST appear in the final artifact:
${packet.must_include.map((item, i) => `${i + 1}. ${item}`).join('\n')}`);

  // ── Ban list ──
  const allBans = [...packet.ban_list];
  if (packet.org_bans_applied) {
    for (const b of packet.org_bans_applied) {
      if (!allBans.includes(b)) allBans.push(b);
    }
  }
  if (allBans.length > 0) {
    sections.push(`=== BAN LIST (do NOT use) ===
${allBans.map(b => `- ${b}`).join('\n')}`);
  }

  // ── Freshness payload ──
  sections.push(`=== FRESHNESS (prove this is real) ===
Weird true detail: ${packet.freshness_payload.weird_detail}
Recent change: ${packet.freshness_payload.recent_change}
Sharp edge: ${packet.freshness_payload.sharp_edge}

At least ONE of these must appear verbatim or paraphrased in the artifact.`);

  // ── Hooks ──
  sections.push(`=== HOOKS (grounded anchor points) ===
${formatHooks(packet.selected_hooks, atoms)}`);

  // ── Truth atoms ──
  sections.push(`=== TRUTH ATOMS (cite these, do not invent) ===
${formatAtomsForBuilder(atoms)}`);

  // ── Outline skeleton ──
  sections.push(`=== OUTLINE SKELETON ===
Fill in each slot. Do not re-decide tier, format, or constraints.

${buildOutlineForPrompt(packet, atoms)}`);

  // ── Promotion grounding (if applicable) ──
  if (packet.tier === 'Promotion') {
    sections.push(`=== PROMOTION GROUNDING (required) ===
Promotion artifacts must include ALL of these from real truth atoms:
1. A CLI command the reader can run
2. An invariant or guarantee (proves quality)
3. A weird true detail (proves authenticity)
4. A sharp edge or anti-goal (proves honesty)
This is shareable truth, not marketing fluff.`);
  }

  // ── Curator notes ──
  const c = packet.callouts;
  if (c.veto || c.twist || c.pick || c.risk) {
    const notes: string[] = [];
    if (c.veto) notes.push(`Veto: ${c.veto}`);
    if (c.twist) notes.push(`Twist: ${c.twist}`);
    if (c.pick) notes.push(`Pick rationale: ${c.pick}`);
    if (c.risk) notes.push(`Risk: ${c.risk}`);
    sections.push(`=== CURATOR NOTES ===\n${notes.join('\n')}`);
  }

  return sections.join('\n\n');
}

// ── JSON mode ───────────────────────────────────────────────────

interface BuildpackJson {
  repo_name: string;
  generated_at: string;
  tier: string;
  format: string;
  format_hint: string;
  alternates: string[];
  constraints: string[];
  must_include: string[];
  ban_list: string[];
  freshness: {
    weird_detail: string;
    recent_change: string;
    sharp_edge: string;
  };
  hooks: Array<{
    role: string;
    atom_id: string;
    value: string | null;
    source: string | null;
  }>;
  atoms: Array<{
    id: string;
    type: string;
    value: string;
    source: string;
    confidence: number;
  }>;
  callouts: {
    veto: string;
    twist: string;
    pick: string;
    risk: string;
  };
  season: string | null;
  signature_move: string | null;
  promotion_grounding: boolean;
}

function buildJson(packet: DecisionPacket, atoms: TruthAtom[]): BuildpackJson {
  const format = packet.format_candidates[0] ?? 'unknown';

  return {
    repo_name: packet.repo_name,
    generated_at: new Date().toISOString(),
    tier: packet.tier,
    format,
    format_hint: FORMAT_HINTS[format] ?? format,
    alternates: packet.format_candidates.slice(1),
    constraints: packet.constraints,
    must_include: packet.must_include,
    ban_list: [...new Set([
      ...packet.ban_list,
      ...(packet.org_bans_applied ?? []),
    ])],
    freshness: packet.freshness_payload,
    hooks: packet.selected_hooks.map(h => {
      const atom = atoms.find(a => a.id === h.atom_id);
      return {
        role: h.role,
        atom_id: h.atom_id,
        value: atom?.value ?? null,
        source: atom ? `${atom.source.file}:${atom.source.lineStart}` : null,
      };
    }),
    atoms: atoms.map(a => ({
      id: a.id,
      type: a.type,
      value: a.value,
      source: `${a.source.file}:${a.source.lineStart}`,
      confidence: a.confidence,
    })),
    callouts: packet.callouts,
    season: packet.season && packet.season !== 'none' ? packet.season : null,
    signature_move: packet.signature_move ?? null,
    promotion_grounding: packet.tier === 'Promotion',
  };
}

// ── Public API ──────────────────────────────────────────────────

export interface BuildpackResult {
  text: string;
  json: BuildpackJson;
}

/**
 * Generate a builder prompt packet from the latest decision + truth bundle.
 * Returns null if no decision packet exists at the repo path.
 */
export async function buildpack(repoPath: string): Promise<BuildpackResult | null> {
  const packet = await loadPacket(repoPath);
  if (!packet) return null;

  const truthBundle = await loadTruthBundle(repoPath);
  const atoms = truthBundle?.atoms ?? [];

  const text = await buildPromptPacket(packet, atoms);
  const json = buildJson(packet, atoms);

  return { text, json };
}
