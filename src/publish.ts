/**
 * Publish (Phase 18)
 *
 * Pushes the artifact catalog to a GitHub Pages repo via the
 * GitHub Contents API. No local clone required — just a token.
 *
 * Flow:
 *   1. Generate the publish bundle (index.html, catalog.json, status.json)
 *   2. For each file: GET existing SHA (if any) → PUT to update/create
 *   3. Report Pages URL
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generatePublishBundle } from './catalog.js';

// ── Types ────────────────────────────────────────────────────────

export interface PublishOptions {
  pagesRepo: string;        // "owner/repo"
  branch?: string;          // default: "main"
  path?: string;            // default: "docs"
  message?: string;         // commit message
  dryRun?: boolean;
  token: string;
  /** Injectable fetch for testing (defaults to globalThis.fetch) */
  fetchImpl?: typeof globalThis.fetch;
}

export interface PublishResult {
  filesUpdated: number;
  commitSha: string | null;  // null if dry-run
  pagesUrl: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function apiHeaders(token: string): Record<string, string> {
  return {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export function derivePagesUrl(pagesRepo: string): string {
  const [owner, repo] = pagesRepo.split('/');
  // Special case: owner.github.io repo
  if (repo === `${owner}.github.io`) {
    return `https://${owner}.github.io/`;
  }
  return `https://${owner}.github.io/${repo}/`;
}

/** Get existing file SHA from the repo (needed for updates). Returns null if file doesn't exist. */
export async function getExistingSha(
  pagesRepo: string,
  filePath: string,
  branch: string,
  token: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<string | null> {
  const url = `https://api.github.com/repos/${pagesRepo}/contents/${filePath}?ref=${branch}`;
  const res = await fetchFn(url, { headers: apiHeaders(token) });

  if (res.status === 404) return null;

  if (!res.ok) {
    // Don't throw on read errors — treat as "file doesn't exist"
    return null;
  }

  const data = await res.json() as { sha?: string };
  return data.sha ?? null;
}

/** Create or update a file via the Contents API. */
export async function putFile(
  pagesRepo: string,
  filePath: string,
  content: string,
  branch: string,
  message: string,
  existingSha: string | null,
  token: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<string | null> {
  const url = `https://api.github.com/repos/${pagesRepo}/contents/${filePath}`;

  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch,
  };
  if (existingSha) {
    body.sha = existingSha;
  }

  const res = await fetchFn(url, {
    method: 'PUT',
    headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 404) {
    throw new Error(
      `Repository "${pagesRepo}" not found. Create it first and enable GitHub Pages.`,
    );
  }
  if (res.status === 403) {
    throw new Error(
      `Permission denied publishing to "${pagesRepo}". Check token scopes (need "repo" or "public_repo").`,
    );
  }
  if (res.status === 409) {
    throw new Error(
      `Conflict updating "${filePath}" — the file was modified concurrently. Try again.`,
    );
  }
  if (res.status === 422) {
    const errData = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(
      `Validation error publishing "${filePath}": ${errData.message ?? 'unknown'}. Check branch name and path.`,
    );
  }
  if (!res.ok) {
    throw new Error(`GitHub API error publishing "${filePath}": ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as { commit?: { sha?: string } };
  return data.commit?.sha ?? null;
}

// ── Main publish ─────────────────────────────────────────────────

export async function publish(opts: PublishOptions): Promise<PublishResult> {
  const branch = opts.branch ?? 'main';
  const basePath = opts.path ?? 'docs';
  const message = opts.message ?? 'Update artifact catalog';

  // 1. Generate the publish bundle
  const bundle = await generatePublishBundle();

  // 2. Dry run — just report what would happen
  if (opts.dryRun) {
    console.error('Publish dry run:');
    for (const file of bundle.files) {
      const remotePath = `${basePath}/${file}`;
      console.error(`  ${bundle.dir}/${file} → ${opts.pagesRepo}:${branch}/${remotePath}`);
    }
    console.error(`  Pages URL: ${derivePagesUrl(opts.pagesRepo)}`);
    return {
      filesUpdated: bundle.files.length,
      commitSha: null,
      pagesUrl: derivePagesUrl(opts.pagesRepo),
    };
  }

  // 3. Push each file
  let lastSha: string | null = null;
  let filesUpdated = 0;

  for (const file of bundle.files) {
    const remotePath = `${basePath}/${file}`;
    const localContent = await readFile(join(bundle.dir, file), 'utf-8');

    // Get existing SHA (needed for update vs create)
    const existingSha = await getExistingSha(opts.pagesRepo, remotePath, branch, opts.token);

    const commitSha = await putFile(
      opts.pagesRepo,
      remotePath,
      localContent,
      branch,
      `${message} (${file})`,
      existingSha,
      opts.token,
    );

    if (commitSha) lastSha = commitSha;
    filesUpdated++;
    console.error(`  ${existingSha ? 'Updated' : 'Created'}: ${remotePath}`);
  }

  return {
    filesUpdated,
    commitSha: lastSha,
    pagesUrl: derivePagesUrl(opts.pagesRepo),
  };
}
