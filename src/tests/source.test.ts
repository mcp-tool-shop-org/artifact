import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { RemoteRepoSource, Semaphore } from '../source.js';

// ── Fixtures ────────────────────────────────────────────────────

const META_RESPONSE = { default_branch: 'main' };

const TREE_RESPONSE = {
  tree: [
    { path: 'README.md', type: 'blob', size: 35, sha: 'abc123' },
    { path: 'package.json', type: 'blob', size: 456, sha: 'def456' },
    { path: 'src/index.ts', type: 'blob', size: 789, sha: 'ghi789' },
    { path: 'src', type: 'tree', sha: 'tree000' },
  ],
  truncated: false,
};

const README_CONTENT = '# Test Repo\nA test repo for testing.';

const BLOB_README = {
  content: Buffer.from(README_CONTENT).toString('base64'),
  encoding: 'base64',
};

// ── Stub fetch factory ──────────────────────────────────────────

function createStubFetch(responses: Map<string, { status: number; body: unknown; etag?: string }>) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Check for conditional request (If-None-Match → 304)
    const ifNoneMatch = (init?.headers as Record<string, string>)?.['If-None-Match'];

    for (const [pattern, resp] of responses) {
      if (url.includes(pattern)) {
        if (ifNoneMatch && resp.etag && ifNoneMatch === resp.etag) {
          return new Response(null, {
            status: 304,
            headers: { etag: resp.etag },
          });
        }
        const headers = new Headers();
        if (resp.etag) headers.set('etag', resp.etag);
        return new Response(JSON.stringify(resp.body), {
          status: resp.status,
          headers,
        });
      }
    }
    return new Response('Not Found', { status: 404 });
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('RemoteRepoSource', () => {
  it('cold run — populates cache, correct API call count', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'artifact-test-'));
    const cacheDir = join(tmpDir, 'cache');

    const responses = new Map([
      ['api.github.com/repos/test-owner/test-repo\x00', { status: 200, body: META_RESPONSE, etag: '"meta-etag-1"' }],
      ['git/trees/main', { status: 200, body: TREE_RESPONSE, etag: '"tree-etag-1"' }],
      ['contents/README.md', { status: 200, body: BLOB_README }],
    ]);

    // Use a pattern that doesn't collide — encode the repo meta endpoint differently
    const stubFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url.includes('git/trees/main')) {
        return new Response(JSON.stringify(TREE_RESPONSE), {
          status: 200,
          headers: { etag: '"tree-etag-1"' },
        });
      }
      if (url.includes('contents/README.md')) {
        return new Response(JSON.stringify(BLOB_README), { status: 200 });
      }
      if (url.includes('api.github.com/repos/test-owner/test-repo') && !url.includes('/git/') && !url.includes('/contents/')) {
        return new Response(JSON.stringify(META_RESPONSE), {
          status: 200,
          headers: { etag: '"meta-etag-1"' },
        });
      }
      return new Response('Not Found', { status: 404 });
    };

    const source = new RemoteRepoSource('test-owner', 'test-repo', undefined, undefined, {
      fetchImpl: stubFetch as typeof globalThis.fetch,
      nowMs: () => Date.now(),
    });

    // Monkey-patch cacheDir to use tmp
    (source as any).cacheDir = () => cacheDir;
    (source as any).blobDir = () => join(cacheDir, 'blobs');

    const content = await source.readFile('README.md');
    assert.equal(content, README_CONTENT);

    // 1 meta + 1 tree + 1 blob = 3
    assert.equal(source.apiCalls, 3);
  });

  it('warm cache — 0 API calls', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'artifact-test-'));
    const cacheDir = join(tmpDir, 'cache');
    const blobDir = join(cacheDir, 'blobs');
    await mkdir(blobDir, { recursive: true });

    const now = new Date().toISOString();

    // Pre-populate cache files
    await writeFile(join(cacheDir, 'meta.json'), JSON.stringify({
      default_branch: 'main',
      etag: '"meta-etag"',
      retrieved_at: now,
    }));
    await writeFile(join(cacheDir, 'tree-main.json'), JSON.stringify({
      entries: [
        { path: 'README.md', size: 35, sha: 'abc123' },
      ],
      etag: '"tree-etag"',
      retrieved_at: now,
    }));
    await writeFile(join(blobDir, 'abc123.json'), JSON.stringify({
      sha: 'abc123',
      content: README_CONTENT,
      retrieved_at: now,
    }));

    const failingFetch = async (): Promise<Response> => {
      throw new Error('fetch should not be called with warm cache');
    };

    const source = new RemoteRepoSource('test-owner', 'test-repo', undefined, undefined, {
      fetchImpl: failingFetch as typeof globalThis.fetch,
      nowMs: () => Date.now(),
    });
    (source as any).cacheDir = () => cacheDir;
    (source as any).blobDir = () => blobDir;

    const content = await source.readFile('README.md');
    assert.equal(content, README_CONTENT);
    assert.equal(source.apiCalls, 0);
    assert.ok(source.cacheHits > 0, `Expected cache hits > 0, got ${source.cacheHits}`);
  });

  it('stale cache + 304 — updates timestamp, no data re-fetch', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'artifact-test-'));
    const cacheDir = join(tmpDir, 'cache');
    const blobDir = join(cacheDir, 'blobs');
    await mkdir(blobDir, { recursive: true });

    // Cache from 48 hours ago (stale)
    const staleTime = new Date(Date.now() - 48 * 3600_000).toISOString();

    await writeFile(join(cacheDir, 'meta.json'), JSON.stringify({
      default_branch: 'main',
      etag: '"meta-etag-1"',
      retrieved_at: staleTime,
    }));
    await writeFile(join(cacheDir, 'tree-main.json'), JSON.stringify({
      entries: [{ path: 'README.md', size: 35, sha: 'abc123' }],
      etag: '"tree-etag-1"',
      retrieved_at: staleTime,
    }));
    await writeFile(join(blobDir, 'abc123.json'), JSON.stringify({
      sha: 'abc123',
      content: README_CONTENT,
      retrieved_at: staleTime,
    }));

    // Fetch returns 304 for meta and tree (conditional)
    const stubFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const headers = init?.headers as Record<string, string> | undefined;

      if (url.includes('git/trees/main') && headers?.['If-None-Match']) {
        return new Response(null, { status: 304, headers: { etag: '"tree-etag-1"' } });
      }
      if (url.includes('api.github.com/repos/test-owner/test-repo') && !url.includes('/git/') && !url.includes('/contents/') && headers?.['If-None-Match']) {
        return new Response(null, { status: 304, headers: { etag: '"meta-etag-1"' } });
      }
      return new Response('Not Found', { status: 404 });
    };

    const source = new RemoteRepoSource('test-owner', 'test-repo', undefined, undefined, {
      fetchImpl: stubFetch as typeof globalThis.fetch,
      nowMs: () => Date.now(),
    });
    (source as any).cacheDir = () => cacheDir;
    (source as any).blobDir = () => blobDir;

    const content = await source.readFile('README.md');
    assert.equal(content, README_CONTENT);
    // Should make 2 API calls (meta + tree conditional) but no blob fetch
    assert.equal(source.apiCalls, 2);
    assert.ok(source.cacheHits > 0, `Expected cache hits > 0, got ${source.cacheHits}`);
  });

  it('404 throws repo not found', async () => {
    const stubFetch = async (): Promise<Response> => {
      return new Response('Not Found', { status: 404 });
    };

    const source = new RemoteRepoSource('no-owner', 'no-repo', undefined, undefined, {
      fetchImpl: stubFetch as typeof globalThis.fetch,
    });

    await assert.rejects(
      () => source.readFile('README.md'),
      (err: Error) => {
        assert.ok(err.message.includes('not found'), `Expected "not found" in: ${err.message}`);
        return true;
      },
    );
  });

  it('Semaphore — limits concurrency to N', async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let maxActive = 0;

    const task = async () => {
      await sem.acquire();
      active++;
      maxActive = Math.max(maxActive, active);
      // Simulate work
      await new Promise(r => setTimeout(r, 50));
      active--;
      sem.release();
    };

    await Promise.all([task(), task(), task(), task(), task()]);

    assert.equal(maxActive, 2, `Expected max concurrency of 2, got ${maxActive}`);
  });
});
