import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, keywordSimilarity } from '../embed.js';

// ── Tests ───────────────────────────────────────────────────────

describe('embed utilities', () => {
  it('cosineSimilarity — identical vectors return ~1.0', () => {
    assert.ok(Math.abs(cosineSimilarity([1, 0, 0], [1, 0, 0]) - 1.0) < 1e-10);
    assert.ok(Math.abs(cosineSimilarity([0.5, 0.5], [0.5, 0.5]) - 1.0) < 1e-10);
  });

  it('cosineSimilarity — orthogonal vectors return 0.0', () => {
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0.0);
  });

  it('cosineSimilarity — mismatched lengths return 0', () => {
    assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0);
  });

  it('cosineSimilarity — zero vector returns 0', () => {
    assert.equal(cosineSimilarity([0, 0, 0], [1, 2, 3]), 0);
  });

  it('keywordSimilarity — overlapping words return > 0, empty strings return 0', () => {
    const sim = keywordSimilarity('hello world foo', 'foo bar baz');
    assert.ok(sim > 0, `Expected > 0, got ${sim}`);
    assert.ok(sim < 1, `Expected < 1, got ${sim}`);

    assert.equal(keywordSimilarity('', 'foo bar'), 0);
    assert.equal(keywordSimilarity('abc', ''), 0);
  });
});
