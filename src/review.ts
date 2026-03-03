/**
 * Review Mode (Phase 6)
 *
 * Emits exactly 4 blocks — a sharp editorial card, not a conversation.
 *   1. Pick  — one sentence
 *   2. Why   — 2 bullets; must cite atoms/memory
 *   3. Required Twist — 1 bullet; uniqueness lock
 *   4. Risks — 1–2 bullets; how it goes stale
 *
 * Contract enforcement: if any block can't cite properly, the review
 * includes a contract violation notice. Harsh, but keeps it clean.
 */

import type { DecisionPacket, TruthAtom, TruthBundle } from './types.js';
import { loadPacket, loadTruthBundle } from './blueprint.js';
import { getPersona } from './persona.js';

/** Find atom by ID */
export function findAtom(atoms: TruthAtom[], id: string): TruthAtom | undefined {
  return atoms.find(a => a.id === id);
}

/** Find atom by type */
export function findAtomByType(atoms: TruthAtom[], type: string): TruthAtom | undefined {
  return atoms.find(a => a.type === type);
}

/** Format a brief citation for an atom */
export function cite(atom: TruthAtom): string {
  const truncVal = atom.value.length > 60
    ? atom.value.slice(0, 57) + '...'
    : atom.value;
  return `"${truncVal}" (${atom.source.file}:${atom.source.lineStart})`;
}

// ── Contract violations ─────────────────────────────────────────

interface ContractViolation {
  block: string;
  issue: string;
}

// ── Build the 4-block review card ───────────────────────────────

interface ReviewCard {
  text: string;
  json: ReviewJson;
  violations: ContractViolation[];
}

interface ReviewJson {
  repo_name: string;
  pick: {
    tier: string;
    format: string;
    constraints: string[];
    season: string | null;
    signature_move: string | null;
  };
  why: Array<{
    bullet: string;
    atom_id: string | null;
    atom_type: string | null;
    source: string | null;
  }>;
  twist: {
    bullet: string;
    atom_id: string | null;
    source: string | null;
  };
  risks: Array<{
    bullet: string;
    source_type: 'callout' | 'org_ban' | 'sharp_edge' | 'freshness_gap' | 'generic';
  }>;
  contract_violations: ContractViolation[];
}

export async function buildReviewCard(packet: DecisionPacket, atoms: TruthAtom[]): Promise<ReviewCard> {
  const lines: string[] = [];
  const violations: ContractViolation[] = [];
  const format = packet.format_candidates[0] ?? 'unknown';

  // ── Persona header ──
  const persona = await getPersona();
  lines.push(`--- ${persona.name}'s Review ---`);
  lines.push('');

  // ── 1. Pick ──
  const seasonNote = packet.season && packet.season !== 'none'
    ? ` under ${packet.season}`
    : '';
  const moveNote = packet.signature_move
    ? ` with ${packet.signature_move}`
    : '';
  lines.push(`PICK: ${packet.tier} → ${format}${seasonNote}${moveNote}`);
  lines.push(`      Constraints: ${packet.constraints.join(', ')}`);

  // ── 2. Why (must cite atoms or memory) ──
  lines.push('');
  lines.push('WHY:');

  // Bullet 1: cite the strongest hook atom
  const hookAtom = packet.selected_hooks.length > 0
    ? findAtom(atoms, packet.selected_hooks[0].atom_id)
    : undefined;
  let why1Text = '';
  let why1AtomId: string | null = null;
  let why1AtomType: string | null = null;
  let why1Source: string | null = null;

  if (hookAtom) {
    why1Text = `Grounded in ${hookAtom.type} atom: ${cite(hookAtom)}`;
    why1AtomId = hookAtom.id;
    why1AtomType = hookAtom.type;
    why1Source = `${hookAtom.source.file}:${hookAtom.source.lineStart}`;
  } else {
    // Try to find ANY atom to cite
    const anyAtom = findAtomByType(atoms, 'invariant')
      ?? findAtomByType(atoms, 'repo_tagline')
      ?? findAtomByType(atoms, 'core_purpose');
    if (anyAtom) {
      why1Text = `Grounded in ${anyAtom.type} atom: ${cite(anyAtom)}`;
      why1AtomId = anyAtom.id;
      why1AtomType = anyAtom.type;
      why1Source = `${anyAtom.source.file}:${anyAtom.source.lineStart}`;
    } else if (packet.must_include.length > 0) {
      why1Text = `Must include: ${packet.must_include[0]}`;
      violations.push({ block: 'WHY', issue: 'Bullet 1 could not cite an atom — no atoms available' });
    } else {
      why1Text = `Tier ${packet.tier} selected via ${packet.driver_meta.mode} driver`;
      violations.push({ block: 'WHY', issue: 'Bullet 1 has no atom or memory citation' });
    }
  }
  lines.push(`  - ${why1Text}`);

  // Bullet 2: second citation or pick rationale with atom backing
  let why2Text = '';
  let why2AtomId: string | null = null;
  let why2AtomType: string | null = null;
  let why2Source: string | null = null;

  // Try to cite a second, different atom
  const secondAtom = packet.selected_hooks.length > 1
    ? findAtom(atoms, packet.selected_hooks[1].atom_id)
    : undefined;
  if (secondAtom) {
    why2Text = `Also uses ${secondAtom.type} atom: ${cite(secondAtom)}`;
    why2AtomId = secondAtom.id;
    why2AtomType = secondAtom.type;
    why2Source = `${secondAtom.source.file}:${secondAtom.source.lineStart}`;
  } else if (packet.callouts.pick) {
    why2Text = packet.callouts.pick;
  } else {
    const detail = packet.freshness_payload.weird_detail;
    if (detail && !detail.startsWith('unknown')) {
      const truncDetail = detail.length > 60 ? detail.slice(0, 57) + '...' : detail;
      why2Text = `Weird true detail: "${truncDetail}"`;
    } else {
      why2Text = `Format ${format} rotated to avoid recent picks`;
      violations.push({ block: 'WHY', issue: 'Bullet 2 has no atom, memory, or freshness citation' });
    }
  }
  lines.push(`  - ${why2Text}`);

  // ── 3. Required Twist (must reference at least one TruthAtom) ──
  lines.push('');
  lines.push('TWIST:');
  let twistAtomId: string | null = null;
  let twistSource: string | null = null;

  if (packet.callouts.twist) {
    // Check if twist references a hook atom
    const twistHookAtom = packet.selected_hooks.length > 0
      ? findAtom(atoms, packet.selected_hooks[0].atom_id)
      : undefined;
    lines.push(`  - ${packet.callouts.twist}`);
    if (twistHookAtom) {
      twistAtomId = twistHookAtom.id;
      twistSource = `${twistHookAtom.source.file}:${twistHookAtom.source.lineStart}`;
    }
  } else {
    // Derive from atoms: prefer sharp_edge or anti_goal
    const edgeAtom = findAtomByType(atoms, 'sharp_edge')
      ?? findAtomByType(atoms, 'anti_goal')
      ?? findAtomByType(atoms, 'invariant');
    if (edgeAtom) {
      const truncVal = edgeAtom.value.length > 70 ? edgeAtom.value.slice(0, 67) + '...' : edgeAtom.value;
      lines.push(`  - Must surface ${edgeAtom.type}: "${truncVal}" (${edgeAtom.source.file}:${edgeAtom.source.lineStart})`);
      twistAtomId = edgeAtom.id;
      twistSource = `${edgeAtom.source.file}:${edgeAtom.source.lineStart}`;
    } else {
      const anchor = packet.must_include[0] ?? `repo identity: ${packet.repo_name}`;
      lines.push(`  - Must include: ${anchor}`);
      violations.push({ block: 'TWIST', issue: 'Could not reference a TruthAtom — no suitable atoms found' });
    }
  }

  // ── 4. Risks (must reference org ban/gap or repo sharp edge) ──
  lines.push('');
  lines.push('RISKS:');

  type RiskSourceType = 'callout' | 'org_ban' | 'sharp_edge' | 'freshness_gap' | 'generic';
  const riskBullets: Array<{ bullet: string; source_type: RiskSourceType }> = [];

  // Risk 1: org ban, curator risk, or sharp edge
  if (packet.org_bans_applied && packet.org_bans_applied.length > 0) {
    const ban = packet.org_bans_applied[0];
    riskBullets.push({ bullet: `Org ban active: ${ban}`, source_type: 'org_ban' });
  } else if (packet.callouts.risk) {
    riskBullets.push({ bullet: packet.callouts.risk, source_type: 'callout' });
  } else {
    const edgeAtom = findAtomByType(atoms, 'sharp_edge');
    if (edgeAtom) {
      const truncVal = edgeAtom.value.length > 60 ? edgeAtom.value.slice(0, 57) + '...' : edgeAtom.value;
      riskBullets.push({ bullet: `Sharp edge: "${truncVal}"`, source_type: 'sharp_edge' });
    } else {
      riskBullets.push({ bullet: 'Goes stale if it could describe any repo — force repo-specific detail', source_type: 'generic' });
      violations.push({ block: 'RISKS', issue: 'No org ban, callout risk, or sharp_edge atom to cite' });
    }
  }

  // Risk 2: veto, gap bias, or freshness gap
  if (packet.callouts.veto) {
    riskBullets.push({ bullet: `Veto signal: ${packet.callouts.veto}`, source_type: 'callout' });
  } else if (packet.org_gap_bias && packet.org_gap_bias.length > 0) {
    riskBullets.push({ bullet: `Org gap: ${packet.org_gap_bias[0]}`, source_type: 'org_ban' });
  } else {
    const change = packet.freshness_payload.recent_change;
    if (change && change.startsWith('unknown')) {
      riskBullets.push({ bullet: 'No recent_change atoms — artifact may feel timeless instead of current', source_type: 'freshness_gap' });
    }
  }

  for (const r of riskBullets) {
    lines.push(`  - ${r.bullet}`);
  }

  // ── Contract violations ──
  if (violations.length > 0) {
    lines.push('');
    lines.push('CONTRACT:');
    for (const v of violations) {
      lines.push(`  ! ${v.block}: ${v.issue}`);
    }
  }

  // Build JSON representation
  const twistText = packet.callouts.twist
    || (lines.find(l => l.startsWith('  - Must surface') || l.startsWith('  - Must include'))?.replace('  - ', '') ?? '');

  const json: ReviewJson = {
    repo_name: packet.repo_name,
    pick: {
      tier: packet.tier,
      format,
      constraints: packet.constraints,
      season: packet.season && packet.season !== 'none' ? packet.season : null,
      signature_move: packet.signature_move ?? null,
    },
    why: [
      { bullet: why1Text, atom_id: why1AtomId, atom_type: why1AtomType, source: why1Source },
      { bullet: why2Text, atom_id: why2AtomId, atom_type: why2AtomType, source: why2Source },
    ],
    twist: {
      bullet: twistText,
      atom_id: twistAtomId,
      source: twistSource,
    },
    risks: riskBullets,
    contract_violations: violations,
  };

  return { text: lines.join('\n'), json, violations };
}

// ── Public API ──────────────────────────────────────────────────

export interface ReviewResult {
  text: string;
  json: ReviewJson;
  violations: ContractViolation[];
}

/**
 * Generate a review card from the latest decision packet.
 * Returns the card (text + json + violations), or null if no packet exists.
 */
export async function review(repoPath: string, outputDir?: string): Promise<ReviewResult | null> {
  const packet = await loadPacket(repoPath, outputDir);
  if (!packet) return null;

  const truthBundle = await loadTruthBundle(repoPath, outputDir);
  const atoms = truthBundle?.atoms ?? [];

  return await buildReviewCard(packet, atoms);
}
