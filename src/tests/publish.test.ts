import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { derivePagesUrl, getExistingSha, putFile } from '../publish.js';

// ── Stub fetch factory ──────────────────────────────────────────

function stubFetch(status: number, body: unknown = {}): typeof globalThis.fetch {
  return (async () => {
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof globalThis.fetch;
}

// ── Tests ───────────────────────────────────────────────────────

describe('publish', () => {
  it('derivePagesUrl — standard repo', () => {
    assert.equal(derivePagesUrl('acme/widgets'), 'https://acme.github.io/widgets/');
  });

  it('derivePagesUrl — owner.github.io special case', () => {
    assert.equal(derivePagesUrl('acme/acme.github.io'), 'https://acme.github.io/');
  });

  it('getExistingSha — 404 returns null', async () => {
    const result = await getExistingSha('owner/repo', 'docs/index.html', 'main', 'fake-token', stubFetch(404));
    assert.equal(result, null);
  });

  it('getExistingSha — 200 returns sha', async () => {
    const result = await getExistingSha(
      'owner/repo', 'docs/index.html', 'main', 'fake-token',
      stubFetch(200, { sha: 'abc123' }),
    );
    assert.equal(result, 'abc123');
  });

  it('putFile — 404 throws repo not found', async () => {
    await assert.rejects(
      () => putFile('owner/repo', 'docs/index.html', 'content', 'main', 'msg', null, 'token', stubFetch(404)),
      (err: Error) => {
        assert.ok(err.message.includes('not found'), `Expected "not found" in: ${err.message}`);
        return true;
      },
    );
  });

  it('putFile — 403 throws permission denied', async () => {
    await assert.rejects(
      () => putFile('owner/repo', 'docs/index.html', 'content', 'main', 'msg', null, 'token', stubFetch(403)),
      (err: Error) => {
        assert.ok(err.message.includes('Permission denied'), `Expected "Permission denied" in: ${err.message}`);
        return true;
      },
    );
  });

  it('putFile — 409 throws conflict', async () => {
    await assert.rejects(
      () => putFile('owner/repo', 'docs/index.html', 'content', 'main', 'msg', 'old-sha', 'token', stubFetch(409)),
      (err: Error) => {
        assert.ok(err.message.includes('Conflict'), `Expected "Conflict" in: ${err.message}`);
        return true;
      },
    );
  });
});
