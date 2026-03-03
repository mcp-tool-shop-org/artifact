/**
 * Review Mode (Phase 6)
 *
 * Emits exactly 4 blocks — a sharp editorial card, not a conversation.
 *   1. Pick  — one sentence
 *   2. Why   — 2 bullets; must cite atoms/memory
 *   3. Required Twist — 1 bullet; uniqueness lock
 *   4. Risks — 1–2 bullets; how it goes stale
 *
 * Reads the latest decision packet + truth bundle.
 * No LLM calls. Pure formatting of existing decisions.
 */

import type { DecisionPacket, TruthAtom, TruthBundle } from './types.js';
import { loadPacket } from './blueprint.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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

/** Find atom by ID */
function findAtom(atoms: TruthAtom[], id: string): TruthAtom | undefined {
  return atoms.find(a => a.id === id);
}

/** Format a brief citation for an atom */
function cite(atom: TruthAtom): string {
  const truncVal = atom.value.length > 60
    ? atom.value.slice(0, 57) + '...'
    : atom.value;
  return `"${truncVal}" (${atom.source.file}:${atom.source.lineStart})`;
}

/** Build the 4-block review card */
function buildReviewCard(packet: DecisionPacket, atoms: TruthAtom[]): string {
  const lines: string[] = [];
  const format = packet.format_candidates[0] ?? 'unknown';

  // ── 1. Pick ──
  const seasonNote = packet.season && packet.season !== 'none'
    ? ` under ${packet.season}`
    : '';
  const moveNote = packet.signature_move
    ? ` with ${packet.signature_move}`
    : '';
  lines.push(`PICK: ${packet.tier} → ${format}${seasonNote}${moveNote}`);
  lines.push(`      Constraints: ${packet.constraints.join(', ')}`);

  // ── 2. Why ──
  lines.push('');
  lines.push('WHY:');

  // Bullet 1: cite the strongest hook atom
  const hookAtom = packet.selected_hooks.length > 0
    ? findAtom(atoms, packet.selected_hooks[0].atom_id)
    : undefined;
  if (hookAtom) {
    lines.push(`  - Grounded in ${hookAtom.type} atom: ${cite(hookAtom)}`);
  } else if (packet.must_include.length > 0) {
    lines.push(`  - Must include: ${packet.must_include[0]}`);
  } else {
    lines.push(`  - Tier ${packet.tier} selected via ${packet.driver_meta.mode} driver`);
  }

  // Bullet 2: freshness evidence or callout pick rationale
  if (packet.callouts.pick) {
    lines.push(`  - ${packet.callouts.pick}`);
  } else {
    const detail = packet.freshness_payload.weird_detail;
    if (detail && !detail.startsWith('unknown')) {
      lines.push(`  - Weird true detail: "${detail.length > 60 ? detail.slice(0, 57) + '...' : detail}"`);
    } else {
      lines.push(`  - Format ${format} rotated to avoid recent picks`);
    }
  }

  // ── 3. Required Twist ──
  lines.push('');
  lines.push('TWIST:');
  if (packet.callouts.twist) {
    lines.push(`  - ${packet.callouts.twist}`);
  } else {
    // Derive from freshness payload
    const edge = packet.freshness_payload.sharp_edge;
    if (edge && !edge.startsWith('unknown')) {
      lines.push(`  - Must surface sharp edge: "${edge.length > 70 ? edge.slice(0, 67) + '...' : edge}"`);
    } else {
      // Fall back to the first must_include as uniqueness anchor
      const anchor = packet.must_include[0] ?? `repo identity: ${packet.repo_name}`;
      lines.push(`  - Must include: ${anchor}`);
    }
  }

  // ── 4. Risks ──
  lines.push('');
  lines.push('RISKS:');

  // Risk 1: curator risk or generic staleness warning
  if (packet.callouts.risk) {
    lines.push(`  - ${packet.callouts.risk}`);
  } else {
    lines.push(`  - Goes stale if it could describe any repo — force repo-specific detail`);
  }

  // Risk 2: if veto exists, it's a second risk signal
  if (packet.callouts.veto) {
    lines.push(`  - Veto signal: ${packet.callouts.veto}`);
  } else {
    // Check if the recent_change is unknown — that's a freshness risk
    const change = packet.freshness_payload.recent_change;
    if (change && change.startsWith('unknown')) {
      lines.push(`  - No recent_change atoms found — artifact may feel timeless instead of current`);
    }
  }

  return lines.join('\n');
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Generate a review card from the latest decision packet.
 * Returns the card text, or null if no packet exists.
 */
export async function review(repoPath: string): Promise<string | null> {
  const packet = await loadPacket(repoPath);
  if (!packet) return null;

  const truthBundle = await loadTruthBundle(repoPath);
  const atoms = truthBundle?.atoms ?? [];

  return buildReviewCard(packet, atoms);
}
