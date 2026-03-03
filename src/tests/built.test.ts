import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { builtStatusBadge, listBuiltRecords, formatBuiltList, formatBuiltRecord } from '../built.js';
import type { BuiltStore, BuiltRecord, BuiltStatus } from '../types.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeRecord(name: string, status: BuiltStatus, updatedAt: string): BuiltRecord {
  return {
    repo_name: name,
    built_status: status,
    artifact_paths: ['card.md', 'poster.svg'],
    verified_at: status.startsWith('verified') ? updatedAt : null,
    verified_by: status.startsWith('verified') ? 'Glyph' : null,
    tool_version: '1.4.0',
    persona: 'glyph',
    iterations: status === 'verified_pass' ? 2 : 1,
    rating: null,
    updated_at: updatedAt,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('built tracking', () => {
  it('builtStatusBadge — returns correct badge for each status', () => {
    const statuses: BuiltStatus[] = ['blueprint_only', 'built_unverified', 'verified_pass', 'verified_fail'];
    for (const status of statuses) {
      const badge = builtStatusBadge(status);
      assert.ok(badge.label.length > 0, `${status} should have a label`);
      assert.ok(badge.color.startsWith('#'), `${status} should have a hex color`);
      assert.ok(badge.icon.length > 0, `${status} should have an icon`);
    }

    assert.equal(builtStatusBadge('verified_pass').label, 'Verified');
    assert.equal(builtStatusBadge('verified_fail').label, 'Failed');
  });

  it('listBuiltRecords — sorts by updated_at descending', () => {
    const store: BuiltStore = {
      version: 1,
      repos: {
        'repo-a': makeRecord('repo-a', 'built_unverified', '2026-01-01T00:00:00Z'),
        'repo-b': makeRecord('repo-b', 'verified_pass', '2026-03-01T00:00:00Z'),
        'repo-c': makeRecord('repo-c', 'blueprint_only', '2026-02-01T00:00:00Z'),
      },
    };

    const sorted = listBuiltRecords(store);
    assert.equal(sorted[0].repo_name, 'repo-b');
    assert.equal(sorted[1].repo_name, 'repo-c');
    assert.equal(sorted[2].repo_name, 'repo-a');
  });

  it('listBuiltRecords — filters by repo name', () => {
    const store: BuiltStore = {
      version: 1,
      repos: {
        'repo-a': makeRecord('repo-a', 'built_unverified', '2026-01-01T00:00:00Z'),
        'repo-b': makeRecord('repo-b', 'verified_pass', '2026-03-01T00:00:00Z'),
        'repo-c': makeRecord('repo-c', 'blueprint_only', '2026-02-01T00:00:00Z'),
      },
    };

    const filtered = listBuiltRecords(store, 'repo-b');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].repo_name, 'repo-b');
  });

  it('formatBuiltList — empty records shows "No built artifacts"', () => {
    const output = formatBuiltList([]);
    assert.ok(output.includes('No built artifacts'), `Expected "No built artifacts" in: ${output}`);
  });

  it('formatBuiltRecord — shows all fields', () => {
    const record = makeRecord('my-tool', 'verified_pass', '2026-03-01T12:00:00Z');
    record.iterations = 3;
    const output = formatBuiltRecord(record);
    assert.ok(output.includes('my-tool'), 'Should contain repo name');
    assert.ok(output.includes('verified_pass'), 'Should contain status');
    assert.ok(output.includes('card.md'), 'Should contain artifact path');
    assert.ok(output.includes('3'), 'Should contain iterations');
  });
});
