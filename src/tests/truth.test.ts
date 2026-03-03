import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractTruthBundle, dedupe, capPerType, preferDocs } from '../truth.js';
import type { RepoSource, FileEntry, SourceMeta } from '../source.js';
import type { TruthAtom, AtomType } from '../types.js';

// ── FakeRepoSource ──────────────────────────────────────────────

class FakeRepoSource implements RepoSource {
  constructor(private files: Record<string, string>) {}

  async readFile(relativePath: string): Promise<string | null> {
    return this.files[relativePath] ?? null;
  }

  async listFiles(extensions: Set<string>, maxDepth: number): Promise<FileEntry[]> {
    return Object.keys(this.files)
      .filter(p => {
        const ext = '.' + p.split('.').pop();
        return extensions.has(ext);
      })
      .map(p => ({ path: p, size: this.files[p].length }));
  }

  async stat(relativePath: string): Promise<{ size: number } | null> {
    const content = this.files[relativePath];
    return content != null ? { size: content.length } : null;
  }

  async exists(relativePath: string): Promise<boolean> {
    return relativePath in this.files;
  }

  meta(): SourceMeta {
    return { type: 'local', name: 'fake-repo', displayName: 'fake-repo' };
  }
}

// ── Helper: make an atom ────────────────────────────────────────

function atom(type: AtomType, value: string, file: string, confidence: number): TruthAtom {
  return {
    id: `${type}:test${Math.random().toString(36).slice(2, 8)}`,
    type,
    value,
    confidence,
    source: { file, lineStart: 1, lineEnd: 1 },
    tags: [],
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('truth extraction', () => {
  it('extractTruthBundle — package.json extracts tagline, name, bin commands, scripts, keywords', async () => {
    const source = new FakeRepoSource({
      'package.json': JSON.stringify({
        name: 'my-cool-tool',
        description: 'A blazing utility for building widgets',
        bin: { cool: './dist/cli.js', widget: './dist/widget.js' },
        scripts: { test: 'node --test', build: 'tsc', lint: 'eslint .' },
        keywords: ['widget', 'builder', 'file', 'data'],
      }),
    });

    const bundle = await extractTruthBundle(source);
    const atoms = bundle.atoms;

    // Tagline from description
    assert.ok(atoms.some(a => a.type === 'repo_tagline' && a.value.includes('blazing utility')));
    // Name as core_object
    assert.ok(atoms.some(a => a.type === 'core_object' && a.value === 'my-cool-tool'));
    // Bin commands
    assert.ok(atoms.some(a => a.type === 'cli_command' && a.value === 'cool'));
    assert.ok(atoms.some(a => a.type === 'cli_command' && a.value === 'widget'));
    // Scripts
    assert.ok(atoms.some(a => a.type === 'cli_command' && a.value === 'npm run test'));
    assert.ok(atoms.some(a => a.type === 'cli_command' && a.value === 'npm run build'));
    assert.ok(atoms.some(a => a.type === 'cli_command' && a.value === 'npm run lint'));
    // Non-boring keywords
    assert.ok(atoms.some(a => a.type === 'core_object' && a.value === 'widget'));
    assert.ok(atoms.some(a => a.type === 'core_object' && a.value === 'builder'));
    // Boring keywords NOT present
    assert.ok(!atoms.some(a => a.type === 'core_object' && a.value === 'file'));
    assert.ok(!atoms.some(a => a.type === 'core_object' && a.value === 'data'));
  });

  it('extractTruthBundle — README extracts tagline, purpose, sharp edges, invariants, anti-goals', async () => {
    const readmeContent = [
      '# MyTool',
      '',
      '<p align="center"><img src="logo.png"></p>',
      '',
      'A powerful extraction engine for truth atoms from any repo on disk.',
      '',
      'MyTool provides deterministic artifact decisions and lets you curate repos at scale.',
      '',
      'WARNING: does not support binary files or compressed archives.',
      '',
      'The pipeline always returns immutable data structures.',
      '',
      'This tool has no telemetry and runs entirely offline.',
    ].join('\n');

    const source = new FakeRepoSource({ 'README.md': readmeContent });
    const bundle = await extractTruthBundle(source);
    const atoms = bundle.atoms;

    // Tagline from first non-heading, non-markup paragraph >20 chars
    assert.ok(atoms.some(a => a.type === 'repo_tagline' && a.value.includes('powerful extraction engine')));
    // Purpose from "provides" / "lets you"
    assert.ok(atoms.some(a => a.type === 'core_purpose' && a.value.includes('provides')));
    // Sharp edge from WARNING
    assert.ok(atoms.some(a => a.type === 'sharp_edge' && a.value.includes('does not support')));
    // Invariant from "always returns"
    assert.ok(atoms.some(a => a.type === 'invariant' && a.value.includes('always returns')));
    // Anti-goal from "no telemetry"
    assert.ok(atoms.some(a => a.type === 'anti_goal' && a.value.includes('no telemetry')));
  });

  it('dedupe keeps highest confidence and is case-insensitive', () => {
    const atoms: TruthAtom[] = [
      atom('core_object', 'FooBar', 'a.ts', 0.5),
      atom('core_object', 'foobar', 'b.ts', 0.9),
      atom('core_object', 'FOOBAR', 'c.ts', 0.7),
    ];

    const result = dedupe(atoms);
    assert.equal(result.length, 1);
    assert.equal(result[0].confidence, 0.9);
  });

  it('capPerType enforces MAX_ATOMS_PER_TYPE=10 limit', () => {
    const atoms: TruthAtom[] = [];
    for (let i = 0; i < 15; i++) {
      atoms.push(atom('core_object', `obj_${i}`, 'test.ts', i * 0.06 + 0.1));
    }

    const result = capPerType(atoms);
    assert.equal(result.length, 10);
    // Sorted by confidence desc
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].confidence >= result[i].confidence,
        `Expected ${result[i - 1].confidence} >= ${result[i].confidence}`);
    }
  });

  it('preferDocs picks doc-sourced atom over code-sourced for same value', () => {
    const atoms: TruthAtom[] = [
      atom('cli_command', 'build', 'package.json', 0.8),
      atom('cli_command', 'build', 'src/index.ts', 0.9),
    ];

    const result = preferDocs(atoms);
    assert.equal(result.length, 1);
    assert.equal(result[0].source.file, 'package.json');
  });
});
