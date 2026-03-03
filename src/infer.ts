/**
 * Decision Inference Engine (Phase 11)
 *
 * Computes an InferenceProfile from a TruthBundle — a deterministic
 * assessment of what the repo needs, before the Curator picks a tier.
 *
 * The profile answers: "Given this repo's reality, what kind of artifact
 * will move it forward most?" — not "which tier feels right?"
 *
 * Two modes:
 *   1. Deterministic heuristic (always runs, no Ollama)
 *   2. Ollama refinement (optional, validates/adjusts heuristic output)
 */

import type {
  TruthBundle, TruthAtom, RepoType, Tier,
  InferenceProfile, PrimaryUser, PrimaryBottleneck,
  Maturity, RiskProfile,
} from './types.js';

// ── Signal counting ─────────────────────────────────────────────

function atomCount(atoms: TruthAtom[], ...types: string[]): number {
  return atoms.filter(a => types.includes(a.type)).length;
}

function hasAtoms(atoms: TruthAtom[], ...types: string[]): boolean {
  return atoms.some(a => types.includes(a.type));
}

function atomsContain(atoms: TruthAtom[], type: string, ...keywords: string[]): boolean {
  return atoms.some(a =>
    a.type === type &&
    keywords.some(kw => a.value.toLowerCase().includes(kw.toLowerCase())));
}

// ── Evidence strength ───────────────────────────────────────────

function computeEvidenceStrength(bundle: TruthBundle): number {
  const atoms = bundle.atoms;
  let score = 0;
  let dimensions = 0;

  const checks: Array<[string[], number]> = [
    [['repo_tagline'], 1],
    [['core_purpose'], 1],
    [['invariant', 'guarantee'], 1],
    [['cli_command', 'cli_flag'], 1],
    [['error_string'], 1],
    [['sharp_edge', 'anti_goal'], 1],
    [['recent_change'], 1],
    [['config_key'], 1],
    [['core_object'], 0.5],
  ];

  for (const [types, weight] of checks) {
    dimensions += weight;
    if (hasAtoms(atoms, ...types)) score += weight;
  }

  const volumeBonus = Math.min(atoms.length / 20, 1) * 0.5;
  score += volumeBonus;
  dimensions += 0.5;

  return Math.min(1, score / dimensions);
}

// ── Archetype detection ─────────────────────────────────────────

export function detectArchetype(atoms: TruthAtom[], declaredType: RepoType): RepoType {
  if (declaredType !== 'unknown') return declaredType;

  const hasCli = hasAtoms(atoms, 'cli_command', 'cli_flag');
  const cliCount = atomCount(atoms, 'cli_command', 'cli_flag');
  const invariantCount = atomCount(atoms, 'invariant', 'guarantee');

  const hasServerKw = atomsContain(atoms, 'core_purpose', 'server', 'api', 'endpoint', 'service');
  const hasSpecKw = atomsContain(atoms, 'core_purpose', 'spec', 'protocol', 'standard', 'schema');
  const hasBrandKw = atomsContain(atoms, 'core_purpose', 'brand', 'logo', 'theme', 'site');
  const hasTemplateKw = atomsContain(atoms, 'core_purpose', 'template', 'scaffold', 'generator', 'starter');
  const hasRegistryKw = atomsContain(atoms, 'core_purpose', 'registry', 'catalog', 'index');

  if (hasCli && cliCount >= 3 && !hasServerKw) return 'R1_tooling_cli';
  if (hasServerKw) return 'R3_service_server';
  if (hasSpecKw && invariantCount >= 2) return 'R5_spec_protocol';
  if (hasTemplateKw) return 'R4_template_scaffold';
  if (hasBrandKw) return 'R9_brand_meta';
  if (hasRegistryKw) return 'R7_data_registry';
  if (hasCli && atomCount(atoms, 'config_key') >= 1 && atomCount(atoms, 'error_string') >= 1) return 'R1_tooling_cli';
  if (invariantCount >= 3 && !hasCli) return 'R2_library_sdk';

  return 'unknown';
}

// ── Primary user ────────────────────────────────────────────────

function inferPrimaryUser(
  atoms: TruthAtom[],
  archetype: RepoType,
  evidence: number,
): PrimaryUser {
  const cliCount = atomCount(atoms, 'cli_command', 'cli_flag');
  const invariantCount = atomCount(atoms, 'invariant', 'guarantee');
  const errorCount = atomCount(atoms, 'error_string');
  const edgeCount = atomCount(atoms, 'sharp_edge', 'anti_goal');
  const hasTagline = hasAtoms(atoms, 'repo_tagline');

  if (archetype === 'R9_brand_meta') return 'creator';
  if (archetype === 'R5_spec_protocol') return 'security_reviewer';
  if (archetype === 'R6_demo_showcase') return 'community';
  if (invariantCount >= 4 && edgeCount >= 2) return 'security_reviewer';
  if (cliCount >= 5 && errorCount >= 3) return 'dev';
  if (evidence < 0.3 && hasTagline) return 'exec';
  if (archetype === 'R3_service_server') return 'operator';

  return 'dev';
}

// ── Primary bottleneck ──────────────────────────────────────────

function inferBottleneck(
  atoms: TruthAtom[],
  archetype: RepoType,
  evidence: number,
  maturity: Maturity,
): PrimaryBottleneck {
  const hasTagline = hasAtoms(atoms, 'repo_tagline');
  const hasPurpose = hasAtoms(atoms, 'core_purpose');
  const hasCli = hasAtoms(atoms, 'cli_command');
  const hasErrors = hasAtoms(atoms, 'error_string');
  const hasEdges = hasAtoms(atoms, 'sharp_edge');
  const invariantCount = atomCount(atoms, 'invariant', 'guarantee');

  if (evidence < 0.3 || (!hasTagline && !hasPurpose)) return 'understanding';
  if (invariantCount >= 3 && hasEdges) return 'trust';
  if (hasCli && hasErrors && !hasEdges) return 'debuggability';
  if (hasCli && atomCount(atoms, 'config_key') >= 2) return 'integration';
  if (maturity === 'stable' && evidence > 0.7) return 'positioning';
  if (maturity === 'early' && hasPurpose) return 'adoption';

  return 'understanding';
}

// ── Maturity ────────────────────────────────────────────────────

function inferMaturity(atoms: TruthAtom[], bundle: TruthBundle): Maturity {
  const hasChangelog = hasAtoms(atoms, 'recent_change');
  const hasErrors = hasAtoms(atoms, 'error_string');
  const hasCli = hasAtoms(atoms, 'cli_command');
  const invariantCount = atomCount(atoms, 'invariant', 'guarantee');
  const totalAtoms = atoms.length;

  if (totalAtoms < 8) return 'early';
  if (hasChangelog && hasErrors && invariantCount >= 2) {
    return totalAtoms > 25 ? 'stable' : 'shipping';
  }
  if (hasCli && totalAtoms >= 15) return 'shipping';
  return 'early';
}

// ── Risk profile ────────────────────────────────────────────────

function inferRiskProfile(atoms: TruthAtom[]): RiskProfile {
  const antiGoals = atomCount(atoms, 'anti_goal');
  const invariants = atomCount(atoms, 'invariant', 'guarantee');
  const edges = atomCount(atoms, 'sharp_edge');
  const errors = atomCount(atoms, 'error_string');

  if (antiGoals >= 2 && invariants >= 3) return 'high';
  if (edges >= 3 || errors >= 5) return 'med';
  return 'low';
}

// ── Tier weight computation ─────────────────────────────────────

const BASE_WEIGHTS: Record<string, Record<Tier, number>> = {
  understanding:  { Exec: 0.35, Dev: 0.15, Creator: 0.15, Fun: 0.15, Promotion: 0.20 },
  trust:          { Exec: 0.30, Dev: 0.25, Creator: 0.05, Fun: 0.05, Promotion: 0.35 },
  adoption:       { Exec: 0.10, Dev: 0.15, Creator: 0.20, Fun: 0.15, Promotion: 0.40 },
  integration:    { Exec: 0.05, Dev: 0.50, Creator: 0.05, Fun: 0.10, Promotion: 0.30 },
  debuggability:  { Exec: 0.05, Dev: 0.55, Creator: 0.05, Fun: 0.15, Promotion: 0.20 },
  positioning:    { Exec: 0.15, Dev: 0.10, Creator: 0.25, Fun: 0.10, Promotion: 0.40 },
};

const ARCHETYPE_MODIFIERS: Partial<Record<RepoType, Partial<Record<Tier, number>>>> = {
  R1_tooling_cli:    { Dev: +0.10, Fun: +0.05 },
  R2_library_sdk:    { Dev: +0.10, Exec: +0.05 },
  R3_service_server: { Dev: +0.05, Exec: +0.10 },
  R5_spec_protocol:  { Exec: +0.15, Dev: +0.05 },
  R6_demo_showcase:  { Fun: +0.10, Promotion: +0.10 },
  R8_product_app:    { Creator: +0.10, Promotion: +0.10 },
  R9_brand_meta:     { Creator: +0.20, Promotion: +0.05 },
};

export function computeTierWeights(
  bottleneck: PrimaryBottleneck,
  archetype: RepoType,
  evidence: number,
  riskProfile: RiskProfile,
): { weights: Record<Tier, number>; rationale: string[] } {
  const rationale: string[] = [];

  const base = BASE_WEIGHTS[bottleneck] ?? BASE_WEIGHTS['understanding']!;
  const weights: Record<Tier, number> = { ...base };
  rationale.push(`bottleneck="${bottleneck}" drives tier distribution`);

  const mods = ARCHETYPE_MODIFIERS[archetype];
  if (mods) {
    for (const [tier, delta] of Object.entries(mods)) {
      weights[tier as Tier] += delta as number;
    }
    rationale.push(`archetype=${archetype} adjusts ${Object.entries(mods).map(([t, d]) => `${t}${(d as number) > 0 ? '+' : ''}${d}`).join(', ')}`);
  }

  if (evidence < 0.4) {
    weights.Exec += 0.10;
    weights.Promotion += 0.10;
    weights.Dev -= 0.10;
    weights.Fun -= 0.10;
    rationale.push(`evidence=${(evidence * 100).toFixed(0)}% (low) → Exec/Promotion boosted`);
  }

  if (riskProfile === 'high') {
    weights.Exec += 0.10;
    weights.Fun -= 0.10;
    rationale.push(`risk=high → Exec boosted, Fun reduced`);
  }

  // Normalize to sum to 1.0 with 2% floor
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  for (const tier of Object.keys(weights) as Tier[]) {
    weights[tier] = Math.max(0.02, weights[tier] / total);
  }
  const total2 = Object.values(weights).reduce((s, w) => s + w, 0);
  for (const tier of Object.keys(weights) as Tier[]) {
    weights[tier] = Number((weights[tier] / total2).toFixed(3));
  }

  return { weights, rationale };
}

// ── Public API ──────────────────────────────────────────────────

/** Build an inference profile from a truth bundle. Deterministic, no Ollama. */
export function inferProfile(
  repoName: string,
  declaredType: RepoType,
  bundle: TruthBundle,
): InferenceProfile {
  const atoms = bundle.atoms;

  const evidence = computeEvidenceStrength(bundle);
  const archetype = detectArchetype(atoms, declaredType);
  const maturity = inferMaturity(atoms, bundle);
  const riskProfile = inferRiskProfile(atoms);
  const primaryUser = inferPrimaryUser(atoms, archetype, evidence);
  const bottleneck = inferBottleneck(atoms, archetype, evidence, maturity);
  const { weights, rationale } = computeTierWeights(bottleneck, archetype, evidence, riskProfile);

  return {
    repo_archetype: archetype,
    primary_user: primaryUser,
    primary_bottleneck: bottleneck,
    maturity,
    risk_profile: riskProfile,
    evidence_strength: Number(evidence.toFixed(3)),
    recommended_tier_weights: weights,
    tier_rationale: rationale,
  };
}

// ── Formatting ──────────────────────────────────────────────────

/** Format profile as structured text for injection into the Curator prompt */
export function formatProfileForPrompt(profile: InferenceProfile): string {
  const lines: string[] = [];
  lines.push('=== INFERENCE PROFILE (binding tier guidance) ===');
  lines.push(`Archetype: ${profile.repo_archetype}`);
  lines.push(`Primary user: ${profile.primary_user}`);
  lines.push(`Bottleneck: ${profile.primary_bottleneck}`);
  lines.push(`Maturity: ${profile.maturity} | Risk: ${profile.risk_profile} | Evidence: ${(profile.evidence_strength * 100).toFixed(0)}%`);
  lines.push('');
  lines.push('RECOMMENDED TIER WEIGHTS (follow these closely):');
  const sorted = Object.entries(profile.recommended_tier_weights)
    .sort(([, a], [, b]) => b - a);
  for (const [tier, weight] of sorted) {
    const pct = Math.round(weight * 100);
    const bar = '='.repeat(Math.round(pct / 5));
    lines.push(`  ${tier.padEnd(10)} ${pct}% ${bar}`);
  }
  lines.push('');
  lines.push('RULE: Pick the tier with the HIGHEST weight unless org bans or promotion mandates override.');
  lines.push('If two tiers are within 5% of each other, pick the one LESS recently used.');
  return lines.join('\n');
}

/** Format profile for human-readable CLI output */
export function formatProfileForDisplay(profile: InferenceProfile): string {
  const lines: string[] = [];
  lines.push('Inference Profile:');
  lines.push(`  archetype:      ${profile.repo_archetype}`);
  lines.push(`  primary user:   ${profile.primary_user}`);
  lines.push(`  bottleneck:     ${profile.primary_bottleneck}`);
  lines.push(`  maturity:       ${profile.maturity}`);
  lines.push(`  risk:           ${profile.risk_profile}`);
  lines.push(`  evidence:       ${(profile.evidence_strength * 100).toFixed(0)}%`);
  lines.push('');
  lines.push('  Tier weights:');
  const sorted = Object.entries(profile.recommended_tier_weights)
    .sort(([, a], [, b]) => b - a);
  for (const [tier, weight] of sorted) {
    const pct = Math.round(weight * 100);
    const bar = '#'.repeat(Math.round(pct / 3));
    lines.push(`    ${tier.padEnd(10)} ${String(pct).padStart(3)}% ${bar}`);
  }
  lines.push('');
  for (const r of profile.tier_rationale) {
    lines.push(`  * ${r}`);
  }
  return lines.join('\n');
}
