import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseNextLink, loadRepoList } from '../crawl.js';

// ── Tests ───────────────────────────────────────────────────────

describe('crawl helpers', () => {
  it('parseNextLink — extracts next URL from Link header', () => {
    const header = '<https://api.github.com/repos?page=2>; rel="next", <https://api.github.com/repos?page=5>; rel="last"';
    assert.equal(parseNextLink(header), 'https://api.github.com/repos?page=2');
  });

  it('parseNextLink — returns null when no next', () => {
    const header = '<https://api.github.com/repos?page=5>; rel="last"';
    assert.equal(parseNextLink(header), null);
  });

  it('parseNextLink — returns null for null input', () => {
    assert.equal(parseNextLink(null), null);
  });

  it('loadRepoList — parses owner/repo lines, skips comments and blanks', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'artifact-crawl-'));
    const filePath = join(tmpDir, 'repos.txt');
    await writeFile(filePath, [
      '# This is a comment',
      'acme/widgets',
      '',
      'acme/gadgets',
      '# another comment',
      'other/tools',
      '',
    ].join('\n'));

    const repos = await loadRepoList(filePath);
    assert.deepEqual(repos, ['acme/widgets', 'acme/gadgets', 'other/tools']);
  });

  it('loadRepoList — handles trailing whitespace and Windows line endings', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'artifact-crawl-'));
    const filePath = join(tmpDir, 'repos.txt');
    await writeFile(filePath, 'acme/widgets  \r\nacme/gadgets\r\n  other/tools  \r\n');

    const repos = await loadRepoList(filePath);
    assert.deepEqual(repos, ['acme/widgets', 'acme/gadgets', 'other/tools']);
  });
});
