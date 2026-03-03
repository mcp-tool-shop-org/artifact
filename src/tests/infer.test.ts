import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferProfile, computeTierWeights, detectArchetype } from '../infer.js';
import { mergeWeightsWithSeason } from '../org.js';
import type { TruthAtom, TruthBundle, AtomType, Tier, Season } from '../types.js';

// ── Helpers ─────────────────────────────────────────────────────

let idCounter = 0;
function atom(type: AtomType, value: string, confidence = 0.8): TruthAtom {
  return {
    id: `${type}:test${idCounter++}`,
    type,
    value,
    confidence,
    source: { file: 'test.ts', lineStart: 1, lineEnd: 1 },
    tags: [],
  };
}

function makeBundle(atoms: TruthAtom[]): TruthBundle {
  const byType: Record<string, number> = {};
  for (const a of atoms) byType[a.type] = (byType[a.type] ?? 0) + 1;
  return { atoms, stats: { scanned_files: 5, atoms_by_type: byType } };
}

// ── Tests ───────────────────────────────────────────────────────

describe('inference engine', () => {
  it('inferProfile — same TruthBundle always produces same profile', () => {
    const atoms = [
      atom('repo_tagline', 'A test tool for testing', 0.9),
      atom('core_purpose', 'provides deterministic testing', 0.8),
      atom('cli_command', 'test-tool', 0.95),
      atom('cli_command', 'npm run test', 0.7),
      atom('cli_command', 'npm run build', 0.7),
      atom('invariant', 'always returns valid JSON', 0.75),
      atom('error_string', 'Missing required config file', 0.8),
      atom('config_key', 'TEST_MODE', 0.9),
      atom('sharp_edge', 'does not support Windows paths', 0.7),
    ];
    const bundle = makeBundle(atoms);

    const p1 = inferProfile('test-repo', 'unknown', bundle);
    const p2 = inferProfile('test-repo', 'unknown', bundle);
    const p3 = inferProfile('test-repo', 'unknown', bundle);

    assert.deepEqual(p1, p2);
    assert.deepEqual(p2, p3);
  });

  it('computeTierWeights — renormalization sums to ~1.0 with 2% floor', () => {
    const { weights } = computeTierWeights('understanding', 'R1_tooling_cli', 0.3, 'high');

    const sum = Object.values(weights).reduce((s, w) => s + w, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.01, `Sum ${sum} should be ~1.0`);

    for (const [tier, w] of Object.entries(weights)) {
      assert.ok(w >= 0.02, `${tier} weight ${w} should be >= 0.02`);
    }
  });

  it('detectArchetype — declared type overrides detection', () => {
    const atoms = [
      atom('cli_command', 'tool-a', 0.95),
      atom('cli_command', 'tool-b', 0.95),
      atom('cli_command', 'tool-c', 0.95),
    ];

    const result = detectArchetype(atoms, 'R3_service_server');
    assert.equal(result, 'R3_service_server');
  });

  it('detectArchetype — correct heuristic detection', () => {
    // R1_tooling_cli: 3+ cli, no server kw
    const cliAtoms = [
      atom('cli_command', 'cmd-a', 0.95),
      atom('cli_command', 'cmd-b', 0.95),
      atom('cli_command', 'cmd-c', 0.95),
    ];
    assert.equal(detectArchetype(cliAtoms, 'unknown'), 'R1_tooling_cli');

    // R3_service_server: server/api purpose
    const serverAtoms = [
      atom('core_purpose', 'provides a REST API server', 0.8),
    ];
    assert.equal(detectArchetype(serverAtoms, 'unknown'), 'R3_service_server');

    // R2_library_sdk: 3+ invariants, no cli
    const libAtoms = [
      atom('invariant', 'always immutable', 0.7),
      atom('invariant', 'never throws', 0.7),
      atom('invariant', 'deterministic output', 0.7),
    ];
    assert.equal(detectArchetype(libAtoms, 'unknown'), 'R2_library_sdk');

    // R9_brand_meta: brand keywords
    const brandAtoms = [
      atom('core_purpose', 'brand assets and logo management', 0.8),
    ];
    assert.equal(detectArchetype(brandAtoms, 'unknown'), 'R9_brand_meta');
  });

  it('mergeWeightsWithSeason — season multipliers renormalize correctly', () => {
    const atoms = [
      atom('repo_tagline', 'A fun game tool', 0.9),
      atom('cli_command', 'play', 0.95),
      atom('core_purpose', 'lets you play games', 0.8),
    ];
    const bundle = makeBundle(atoms);
    const profile = inferProfile('game-tool', 'unknown', bundle);

    const originalFun = profile.recommended_tier_weights.Fun;
    const originalDev = profile.recommended_tier_weights.Dev;

    const season: Season = {
      name: 'Season of Play',
      started_at: new Date().toISOString(),
      tier_weights: { Fun: 3, Creator: 1.5, Dev: 0.5 },
      format_bias: [],
      constraint_decks_enabled: [],
      ban_list: [],
      signature_moves: [],
      notes: 'test',
    };

    const merged = mergeWeightsWithSeason(profile, season);

    // Sum to ~1.0
    const sum = Object.values(merged).reduce((s, w) => s + w, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.01, `Sum ${sum} should be ~1.0`);

    // Fun should have increased relative share, Dev decreased
    assert.ok(merged.Fun > merged.Dev,
      `Fun (${merged.Fun}) should be larger than Dev (${merged.Dev}) after play season`);

    // All tiers >= 0.02
    for (const [tier, w] of Object.entries(merged)) {
      assert.ok(w >= 0.02, `${tier} weight ${w} should be >= 0.02`);
    }
  });
});
