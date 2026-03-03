import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { load, append, recentTiers, recentFormats, recentAtomIds } from '../history.js';
import type { HistoryStore, HistoryEntry, Tier } from '../types.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    repo_name: 'test-repo',
    tier: 'Dev' as Tier,
    formats: ['D1_quickstart_card'],
    constraints: ['one-page'],
    atom_ids_used: ['atom:abc'],
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('history store', () => {
  it('recentTiers — returns last N tiers from store', () => {
    const tiers: Tier[] = ['Dev', 'Fun', 'Exec', 'Creator', 'Promotion', 'Dev', 'Fun', 'Exec'];
    const store: HistoryStore = {
      entries: tiers.map(t => makeEntry({ tier: t })),
    };

    const recent = recentTiers(store, 3);
    assert.deepEqual(recent, ['Dev', 'Fun', 'Exec']);
  });

  it('recentFormats — flattens format arrays from last N entries', () => {
    const store: HistoryStore = {
      entries: [
        makeEntry({ formats: ['A', 'B'] }),
        makeEntry({ formats: ['C'] }),
        makeEntry({ formats: ['D', 'E'] }),
      ],
    };

    const recent = recentFormats(store, 2);
    assert.deepEqual(recent, ['C', 'D', 'E']);
  });

  it('recentAtomIds — handles entries without atom_ids_used', () => {
    const store: HistoryStore = {
      entries: [
        makeEntry({ atom_ids_used: ['id1', 'id2'] }),
        { ...makeEntry(), atom_ids_used: undefined } as unknown as HistoryEntry,
        makeEntry({ atom_ids_used: ['id3'] }),
      ],
    };

    const ids = recentAtomIds(store, 3);
    assert.ok(ids.includes('id1'));
    assert.ok(ids.includes('id3'));
    // Should not crash on undefined
  });

  it('load — returns empty store for missing file', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'artifact-hist-'));
    const store = await load(tmpDir, join(tmpDir, 'nonexistent'));
    assert.deepEqual(store, { entries: [] });
  });

  it('append + load round-trip — trims to MAX_ENTRIES=25', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'artifact-hist-'));

    // Write 30 entries
    for (let i = 0; i < 30; i++) {
      await append(tmpDir, makeEntry({ repo_name: `repo-${i}` }), tmpDir);
    }

    const store = await load(tmpDir, tmpDir);
    assert.equal(store.entries.length, 25);
    // Most recent should be last
    assert.equal(store.entries[24].repo_name, 'repo-29');
    // Oldest remaining should be repo-5 (30-25=5)
    assert.equal(store.entries[0].repo_name, 'repo-5');
  });
});
