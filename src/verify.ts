/**
 * Verify (Phase 10)
 *
 * Lints a generated artifact against blueprint.json + truth_bundle.json + org bans.
 *
 * Checks:
 *   1. Must-include items present in the artifact text
 *   2. Truth atom citations appear (atom values or IDs)
 *   3. Banned phrases not used
 *   4. Freshness payload — weird detail present
 *   5. Promotion grounding (if Promotion tier)
 *   6. Constraint compliance (heuristic checks)
 *
 * Returns a pass/fail verdict + minimal fix list.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadPacket, loadTruthBundle } from './blueprint.js';
import type { DecisionPacket, TruthAtom } from './types.js';

// ── Types ───────────────────────────────────────────────────────

export type Severity = 'fail' | 'warn';

export interface VerifyFinding {
  check: string;
  severity: Severity;
  message: string;
  fix: string;
}

export interface VerifyResult {
  passed: boolean;
  findings: VerifyFinding[];
  stats: {
    must_include_hit: number;
    must_include_total: number;
    atoms_cited: number;
    atoms_total: number;
    bans_violated: number;
    freshness_present: boolean;
  };
}

// ── Helpers ──────────────────────────────────────────────────────

/** Normalize text for fuzzy matching — lowercase, collapse whitespace */
function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Check if a text block contains a phrase (fuzzy: case-insensitive, whitespace-collapsed) */
function containsPhrase(haystack: string, needle: string): boolean {
  const h = normalize(haystack);
  const n = normalize(needle);
  // Direct substring check
  if (h.includes(n)) return true;
  // Also check with words split (handles line breaks in artifact)
  const nWords = n.split(' ').filter(w => w.length > 3);
  if (nWords.length >= 3) {
    // If 80%+ of significant words appear, count it
    const hits = nWords.filter(w => h.includes(w));
    return hits.length / nWords.length >= 0.8;
  }
  return false;
}

/** Check if an atom value or ID appears in the artifact text */
function atomCited(haystack: string, atom: TruthAtom): boolean {
  const h = normalize(haystack);
  // Check atom ID
  if (h.includes(atom.id.toLowerCase())) return true;
  // Check atom value — use significant words
  const value = normalize(atom.value);
  if (value.length > 10 && h.includes(value)) return true;
  // For shorter values, check exact word match
  if (value.length <= 10) {
    const regex = new RegExp(`\\b${escapeRegex(value)}\\b`, 'i');
    return regex.test(haystack);
  }
  // Word-level check for longer values
  const words = value.split(' ').filter(w => w.length > 3);
  if (words.length >= 2) {
    const hits = words.filter(w => h.includes(w));
    return hits.length / words.length >= 0.6;
  }
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Core verification ───────────────────────────────────────────

function verify(
  artifactText: string,
  packet: DecisionPacket,
  atoms: TruthAtom[],
): VerifyResult {
  const findings: VerifyFinding[] = [];

  // ── 1. Must-include items ──
  let mustIncludeHit = 0;
  for (const item of packet.must_include) {
    if (containsPhrase(artifactText, item)) {
      mustIncludeHit++;
    } else {
      findings.push({
        check: 'must_include',
        severity: 'fail',
        message: `Missing must-include item: "${item}"`,
        fix: `Add content addressing: ${item}`,
      });
    }
  }

  // ── 2. Truth atom citations ──
  let atomsCited = 0;
  const hookAtomIds = new Set(packet.selected_hooks.map(h => h.atom_id));
  // Check hook atoms first (these are the required ones)
  for (const hookId of hookAtomIds) {
    const atom = atoms.find(a => a.id === hookId);
    if (atom && atomCited(artifactText, atom)) {
      atomsCited++;
    } else if (atom) {
      findings.push({
        check: 'atom_citation',
        severity: 'fail',
        message: `Hook atom not cited: [${atom.id}] "${atom.value.slice(0, 60)}"`,
        fix: `Include or paraphrase: "${atom.value}" (from ${atom.source.file}:${atom.source.lineStart})`,
      });
    }
  }
  // Count any other atoms that appear (informational, not required)
  for (const atom of atoms) {
    if (!hookAtomIds.has(atom.id) && atomCited(artifactText, atom)) {
      atomsCited++;
    }
  }

  // ── 3. Banned phrases ──
  const allBans = [...new Set([...packet.ban_list, ...(packet.org_bans_applied ?? [])])];
  let bansViolated = 0;
  for (const ban of allBans) {
    if (containsPhrase(artifactText, ban)) {
      bansViolated++;
      findings.push({
        check: 'ban_list',
        severity: 'fail',
        message: `Banned item found: "${ban}"`,
        fix: `Remove or replace: "${ban}"`,
      });
    }
  }

  // ── 4. Freshness — weird detail ──
  const weirdDetail = packet.freshness_payload.weird_detail;
  const freshnessPresent = !!(weirdDetail && !weirdDetail.startsWith('unknown')
    && containsPhrase(artifactText, weirdDetail));
  if (!freshnessPresent && weirdDetail && !weirdDetail.startsWith('unknown')) {
    findings.push({
      check: 'freshness',
      severity: 'warn',
      message: 'Weird true detail not found in artifact',
      fix: `Include: "${weirdDetail.slice(0, 80)}"`,
    });
  }

  // Also check sharp edge
  const sharpEdge = packet.freshness_payload.sharp_edge;
  if (sharpEdge && !sharpEdge.startsWith('unknown') && !containsPhrase(artifactText, sharpEdge)) {
    findings.push({
      check: 'freshness',
      severity: 'warn',
      message: 'Sharp edge not found in artifact',
      fix: `Include: "${sharpEdge.slice(0, 80)}"`,
    });
  }

  // ── 5. Promotion grounding ──
  if (packet.tier === 'Promotion') {
    const cliAtom = atoms.find(a => a.type === 'cli_command' || a.type === 'cli_flag');
    const invariantAtom = atoms.find(a => a.type === 'invariant' || a.type === 'guarantee');
    const edgeAtom = atoms.find(a => a.type === 'sharp_edge' || a.type === 'anti_goal');

    if (cliAtom && !atomCited(artifactText, cliAtom)) {
      findings.push({
        check: 'promotion_grounding',
        severity: 'fail',
        message: 'Promotion artifact missing CLI command',
        fix: `Include: "${cliAtom.value}" (${cliAtom.source.file}:${cliAtom.source.lineStart})`,
      });
    }
    if (invariantAtom && !atomCited(artifactText, invariantAtom)) {
      findings.push({
        check: 'promotion_grounding',
        severity: 'warn',
        message: 'Promotion artifact missing invariant/guarantee',
        fix: `Include: "${invariantAtom.value.slice(0, 60)}"`,
      });
    }
    if (edgeAtom && !atomCited(artifactText, edgeAtom)) {
      findings.push({
        check: 'promotion_grounding',
        severity: 'warn',
        message: 'Promotion artifact missing sharp edge / anti-goal',
        fix: `Include: "${edgeAtom.value.slice(0, 60)}"`,
      });
    }
  }

  // ── 6. Constraint heuristics ──
  for (const constraint of packet.constraints) {
    switch (constraint) {
      case 'black-and-white':
        // Check for color references (heuristic)
        if (/\b(red|blue|green|yellow|orange|purple|pink|cyan|magenta)\b/i.test(artifactText)) {
          findings.push({
            check: 'constraint',
            severity: 'warn',
            message: `Constraint "${constraint}" may be violated — color reference found`,
            fix: 'Remove color references; use only black, white, gray.',
          });
        }
        break;
      case 'one-page':
        // Rough check: >3000 chars is likely over 1 page
        if (artifactText.length > 3000) {
          findings.push({
            check: 'constraint',
            severity: 'warn',
            message: `Constraint "${constraint}" may be violated — artifact is ${artifactText.length} chars`,
            fix: 'Trim to fit one page (~2500 chars).',
          });
        }
        break;
      case 'SVG-only':
        if (!artifactText.includes('<svg') && !artifactText.includes('.svg')) {
          findings.push({
            check: 'constraint',
            severity: 'warn',
            message: `Constraint "${constraint}" — no SVG content detected`,
            fix: 'Output should be SVG format or reference SVG files.',
          });
        }
        break;
      // Other constraints are harder to verify heuristically — skip
    }
  }

  // ── Verdict ──
  const hasFail = findings.some(f => f.severity === 'fail');
  const passed = !hasFail;

  return {
    passed,
    findings,
    stats: {
      must_include_hit: mustIncludeHit,
      must_include_total: packet.must_include.length,
      atoms_cited: atomsCited,
      atoms_total: atoms.length,
      bans_violated: bansViolated,
      freshness_present: freshnessPresent,
    },
  };
}

// ── Format output ───────────────────────────────────────────────

export function formatVerifyResult(result: VerifyResult, repoName: string): string {
  const lines: string[] = [];
  const icon = result.passed ? 'PASS' : 'FAIL';

  lines.push(`VERIFY: ${icon} — ${repoName}`);
  lines.push(`  must-include: ${result.stats.must_include_hit}/${result.stats.must_include_total}`);
  lines.push(`  atoms cited:  ${result.stats.atoms_cited}/${result.stats.atoms_total}`);
  lines.push(`  bans hit:     ${result.stats.bans_violated}`);
  lines.push(`  freshness:    ${result.stats.freshness_present ? 'yes' : 'no'}`);

  if (result.findings.length > 0) {
    lines.push('');
    const fails = result.findings.filter(f => f.severity === 'fail');
    const warns = result.findings.filter(f => f.severity === 'warn');

    if (fails.length > 0) {
      lines.push('FAILURES:');
      for (const f of fails) {
        lines.push(`  x ${f.message}`);
        lines.push(`    fix: ${f.fix}`);
      }
    }
    if (warns.length > 0) {
      lines.push('WARNINGS:');
      for (const w of warns) {
        lines.push(`  ~ ${w.message}`);
        lines.push(`    fix: ${w.fix}`);
      }
    }
  }

  return lines.join('\n');
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Verify a generated artifact file against the decision packet + truth bundle.
 *
 * @param repoPath  Path to the repo (reads .artifact/decision_packet.json + truth_bundle.json)
 * @param artifactPath  Path to the artifact file to verify
 * @returns VerifyResult or null if inputs are missing
 */
export async function verifyArtifact(
  repoPath: string,
  artifactPath: string,
): Promise<VerifyResult | null> {
  const packet = await loadPacket(repoPath);
  if (!packet) return null;

  const truthBundle = await loadTruthBundle(repoPath);
  const atoms = truthBundle?.atoms ?? [];

  let artifactText: string;
  try {
    artifactText = await readFile(resolve(artifactPath), 'utf-8');
  } catch {
    return null;
  }

  return verify(artifactText, packet, atoms);
}
