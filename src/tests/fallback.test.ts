import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hash, seededPick, pickAtom, weightedTierSelect, driveFallback } from '../fallback.js';
import type { TruthAtom, TruthBundle, RepoContext, HistoryStore, Tier, InferenceProfile } from '../types.js';

// ── Helpers ─────────────────────────────────────────────────────

let idCounter = 0;
function atom(type: string, value: string, confidence = 0.8): TruthAtom {
  return {
    id: `${type}:${idCounter++}`,
    type: type as TruthAtom['type'],
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

function makeProfile(): InferenceProfile {
  return {
    repo_archetype: 'R1_tooling_cli',
    primary_user: 'dev',
    primary_bottleneck: 'understanding',
    maturity: 'shipping',
    risk_profile: 'low',
    evidence_strength: 0.6,
    recommended_tier_weights: { Exec: 0.2, Dev: 0.3, Creator: 0.15, Fun: 0.15, Promotion: 0.2 },
    tier_rationale: ['test'],
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('fallback driver', () => {
  it('hash — deterministic for same input', () => {
    assert.equal(hash('foo'), hash('foo'));
    assert.notEqual(hash('foo'), hash('bar'));
  });

  it('hash — always returns non-negative', () => {
    for (const s of ['', 'a', 'hello world', '!@#$%', 'very long string '.repeat(100)]) {
      assert.ok(hash(s) >= 0, `hash("${s.slice(0, 20)}") should be >= 0, got ${hash(s)}`);
    }
  });

  it('seededPick — respects exclude set', () => {
    const items = ['A', 'B', 'C', 'D', 'E'];
    for (let seed = 0; seed < 20; seed++) {
      const result = seededPick(items, 3, seed, new Set(['B']));
      assert.ok(!result.includes('B'), `seed ${seed}: result should not include B, got ${result}`);
    }
  });

  it('seededPick — returns up to N items, no duplicates', () => {
    const items = ['A', 'B', 'C', 'D', 'E'];
    const result = seededPick(items, 3, 42);
    assert.ok(result.length <= 3, `Expected <= 3 items, got ${result.length}`);
    assert.equal(new Set(result).size, result.length, 'No duplicates expected');
  });

  it('pickAtom — avoids used IDs, falls back when all used', () => {
    const atoms = [atom('invariant', 'val-a'), atom('invariant', 'val-b'), atom('invariant', 'val-c')];
    const usedIds = new Set([atoms[0].id, atoms[1].id]);

    const picked = pickAtom(atoms, 'invariant', usedIds, 42);
    assert.ok(picked !== null);
    assert.equal(picked!.id, atoms[2].id, 'Should pick the only unused atom');

    // When all used, still returns something
    const allUsed = new Set(atoms.map(a => a.id));
    const fallback = pickAtom(atoms, 'invariant', allUsed, 42);
    assert.ok(fallback !== null, 'Should still return an atom as fallback');
  });

  it('weightedTierSelect — respects exclude set', () => {
    const weights: Record<Tier, number> = { Exec: 0.8, Dev: 0.05, Creator: 0.05, Fun: 0.05, Promotion: 0.05 };
    for (let seed = 0; seed < 50; seed++) {
      const tier = weightedTierSelect(weights, seed, new Set(['Exec']));
      assert.notEqual(tier, 'Exec', `seed ${seed}: should never select excluded Exec`);
    }
  });

  it('driveFallback — produces valid DecisionPacket', () => {
    const atoms = [
      atom('repo_tagline', 'A test tool'),
      atom('cli_command', 'test-cmd'),
      atom('invariant', 'always correct'),
      atom('error_string', 'Missing config'),
      atom('core_object', 'widget'),
    ];
    const bundle = makeBundle(atoms);
    const ctx: RepoContext = { repo_name: 'test-repo', repo_type: 'unknown', truth_bundle: bundle };
    const history: HistoryStore = { entries: [] };
    const profile = makeProfile();

    const packet = driveFallback(ctx, history, profile);

    const validTiers: Tier[] = ['Exec', 'Dev', 'Creator', 'Fun', 'Promotion'];
    assert.ok(validTiers.includes(packet.tier), `tier "${packet.tier}" should be valid`);
    assert.ok(packet.format_candidates.length > 0, 'Should have format candidates');
    assert.ok(packet.constraints.length > 0, 'Should have constraints');
    assert.equal(packet.driver_meta.mode, 'fallback');
    assert.ok(Array.isArray(packet.selected_hooks));
    assert.equal(packet.repo_name, 'test-repo');
  });
});
