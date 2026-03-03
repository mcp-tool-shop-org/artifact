import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cite, findAtom, findAtomByType, buildReviewCard } from '../review.js';
import type { TruthAtom, DecisionPacket } from '../types.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeAtom(id: string, type: string, value: string): TruthAtom {
  return {
    id,
    type: type as TruthAtom['type'],
    value,
    confidence: 0.9,
    source: { file: 'test.ts', lineStart: 42, lineEnd: 42 },
    tags: [],
  };
}

function minimalPacket(overrides: Partial<DecisionPacket> = {}): DecisionPacket {
  return {
    repo_name: 'test-repo',
    tier: 'Dev',
    format_candidates: ['D1_quickstart_card'],
    constraints: ['one-page'],
    must_include: ['repo identity'],
    ban_list: [],
    freshness_payload: { weird_detail: 'unknown', recent_change: 'unknown', sharp_edge: 'unknown' },
    selected_hooks: [],
    callouts: { veto: '', twist: '', pick: 'Dev → D1_quickstart_card', risk: '' },
    driver_meta: { host: null, model: null, mode: 'fallback', timestamp: new Date().toISOString() },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('review mode', () => {
  it('cite — truncates long values at 60 chars', () => {
    const longValue = 'a'.repeat(100);
    const atom = makeAtom('test:1', 'invariant', longValue);
    const result = cite(atom);
    assert.ok(result.includes('...'), 'Should contain ellipsis');
    // The truncated value part should be 57 chars + "..."
    assert.ok(result.length < 100, `Citation should be shorter than original, got ${result.length}`);
  });

  it('cite — short values pass through', () => {
    const atom = makeAtom('test:1', 'invariant', 'short value');
    const result = cite(atom);
    assert.ok(result.includes('short value'), 'Should contain full value');
    assert.ok(!result.includes('...'), 'Should not truncate');
  });

  it('findAtom — returns atom by ID', () => {
    const atoms = [
      makeAtom('a:1', 'invariant', 'first'),
      makeAtom('b:2', 'cli_command', 'second'),
      makeAtom('c:3', 'error_string', 'third'),
    ];
    const found = findAtom(atoms, 'b:2');
    assert.ok(found !== undefined);
    assert.equal(found!.value, 'second');
  });

  it('findAtomByType — returns first atom matching type', () => {
    const atoms = [
      makeAtom('a:1', 'cli_command', 'cmd'),
      makeAtom('b:2', 'invariant', 'always true'),
      makeAtom('c:3', 'invariant', 'never false'),
    ];
    const found = findAtomByType(atoms, 'invariant');
    assert.ok(found !== undefined);
    assert.equal(found!.id, 'b:2');
  });

  it('buildReviewCard — produces 4 blocks with hook atoms', async () => {
    const atoms = [
      makeAtom('hook:1', 'invariant', 'always deterministic'),
      makeAtom('hook:2', 'cli_command', 'artifact drive'),
      makeAtom('hook:3', 'sharp_edge', 'breaks on empty repos'),
    ];
    const packet = minimalPacket({
      selected_hooks: [
        { atom_id: 'hook:1', role: 'invariant_hook' },
        { atom_id: 'hook:2', role: 'mechanic_hook' },
      ],
      callouts: { veto: '', twist: 'Ground in: "always deterministic"', pick: 'Dev → D1', risk: 'May drift if atoms change' },
    });

    const card = await buildReviewCard(packet, atoms);
    assert.ok(card.text.includes('PICK:'), 'Should contain PICK block');
    assert.ok(card.text.includes('WHY:'), 'Should contain WHY block');
    assert.ok(card.text.includes('TWIST:'), 'Should contain TWIST block');
    assert.ok(card.text.includes('RISKS:'), 'Should contain RISKS block');
    assert.equal(card.violations.length, 0, 'Should have no contract violations');
  });

  it('buildReviewCard — flags contract violation when no atoms', async () => {
    const packet = minimalPacket({
      selected_hooks: [
        { atom_id: 'missing:1', role: 'invariant_hook' },
      ],
      callouts: { veto: '', twist: '', pick: '', risk: '' },
    });

    const card = await buildReviewCard(packet, []);
    assert.ok(card.violations.length > 0, 'Should have contract violations');
    const whyViolation = card.violations.find(v => v.block === 'WHY');
    assert.ok(whyViolation !== undefined, 'Should have a WHY block violation');
  });
});
