import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { containsPhrase, atomCited, verify } from '../verify.js';
import type { TruthAtom, DecisionPacket } from '../types.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeAtom(id: string, value: string): TruthAtom {
  return {
    id,
    type: 'cli_command',
    value,
    confidence: 0.9,
    source: { file: 'package.json', lineStart: 1, lineEnd: 1 },
    tags: [],
  };
}

function minimalPacket(overrides: Partial<DecisionPacket> = {}): DecisionPacket {
  return {
    repo_name: 'test-repo',
    tier: 'Dev',
    format_candidates: ['D1_quickstart_card'],
    constraints: [],
    must_include: [],
    ban_list: [],
    freshness_payload: { weird_detail: 'unknown', recent_change: 'unknown', sharp_edge: 'unknown' },
    selected_hooks: [],
    callouts: { veto: '', twist: '', pick: '', risk: '' },
    driver_meta: { host: null, model: null, mode: 'fallback', timestamp: new Date().toISOString() },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('verifier', () => {
  it('containsPhrase — exact substring match (case-insensitive)', () => {
    assert.equal(containsPhrase('The Quick Brown Fox', 'quick brown'), true);
    assert.equal(containsPhrase('hello world', 'goodbye'), false);
  });

  it('containsPhrase — word-level match (80% threshold for 3+ words)', () => {
    // 4/4 significant words present (>3 chars): "lints", "against", "truth", "bundle"
    assert.equal(
      containsPhrase('artifact lints against the truth bundle', 'lints against truth bundle'),
      true,
    );

    // <80% significant words present
    assert.equal(
      containsPhrase('artifact lints against the truth bundle', 'lints against missing words here'),
      false,
    );
  });

  it('atomCited — ID match and value substring match', () => {
    const a = makeAtom('cli_command:abc123', 'npm run build');

    // ID match
    assert.equal(atomCited('text containing cli_command:abc123 here', a), true);
    // Value match (>10 chars)
    assert.equal(atomCited('you can run npm run build to compile', a), true);
    // Neither
    assert.equal(atomCited('something completely unrelated to testing', a), false);
  });

  it('verify — must-include items trigger fail when missing', () => {
    const packet = minimalPacket({
      must_include: ['security model', 'rate limiting'],
    });
    const artifactText = 'This artifact discusses the security model in depth.';

    const result = verify(artifactText, packet, []);

    assert.equal(result.passed, false);
    assert.equal(result.stats.must_include_hit, 1);
    assert.equal(result.stats.must_include_total, 2);

    const failFindings = result.findings.filter(f => f.severity === 'fail' && f.check === 'must_include');
    assert.equal(failFindings.length, 1);
    assert.ok(failFindings[0].message.includes('rate limiting'));
  });

  it('verify — ban list violations trigger fail', () => {
    const packet = minimalPacket({
      ban_list: ['blazingly fast', 'world-class'],
    });
    const artifactText = 'This tool is blazingly fast and easy to use.';

    const result = verify(artifactText, packet, []);

    assert.equal(result.passed, false);
    assert.equal(result.stats.bans_violated, 1);

    const banFindings = result.findings.filter(f => f.check === 'ban_list');
    assert.equal(banFindings.length, 1);
    assert.ok(banFindings[0].message.includes('blazingly fast'));
  });
});
