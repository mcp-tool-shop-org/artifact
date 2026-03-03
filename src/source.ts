/**
 * Repo Source Abstraction (Phase 15 + Phase 16 cache)
 *
 * Decouples truth extraction from the filesystem so Artifact can
 * analyze repos locally OR via the GitHub API without a local clone.
 *
 * Two implementations:
 *   LocalRepoSource  — wraps node:fs (existing behavior)
 *   RemoteRepoSource — GitHub REST API via native fetch (no deps)
 *
 * Phase 16 adds a disk cache to RemoteRepoSource:
 *   - Repo metadata + tree cached with ETag for conditional requests
 *   - File content cached by git blob SHA (content-addressable, no TTL needed)
 *   - Re-run on unchanged repo: 2 API calls (304s) instead of ~27
 *   - --remote-refresh bypasses cache entirely
 */

import { readFile as fsReadFile, readdir as fsReaddir, stat as fsStat, writeFile as fsWriteFile, mkdir as fsMkdir } from 'node:fs/promises';
import { join, resolve, relative, extname, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

// ── Interface ────────────────────────────────────────────────────

export interface FileEntry {
  path: string;   // repo-relative, forward slashes
  size: number;
}

export interface SourceMeta {
  type: 'local' | 'remote';
  name: string;         // basename (local) or "owner/repo" (remote)
  displayName: string;  // always short basename
  ref?: string;
  owner?: string;
  repo?: string;
}

export interface RepoSource {
  /** Read a file's UTF-8 content. Returns null if missing or over maxSize. */
  readFile(relativePath: string, maxSize?: number): Promise<string | null>;

  /** List files matching extensions, up to maxDepth levels deep. */
  listFiles(extensions: Set<string>, maxDepth: number): Promise<FileEntry[]>;

  /** Get file size. Returns null if file doesn't exist. */
  stat(relativePath: string): Promise<{ size: number } | null>;

  /** Check if a file exists. */
  exists(relativePath: string): Promise<boolean>;

  /** Source metadata. */
  meta(): SourceMeta;
}

// ── Skip directories ─────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'vendor', '.git', '__pycache__',
  'build', 'out', 'target', 'coverage', '.next', '.nuxt',
]);

// ── LocalRepoSource ──────────────────────────────────────────────

export class LocalRepoSource implements RepoSource {
  constructor(private repoPath: string) {}

  async readFile(relativePath: string, maxSize = 256 * 1024): Promise<string | null> {
    const fullPath = join(this.repoPath, relativePath);
    if (!existsSync(fullPath)) return null;
    try {
      const st = await fsStat(fullPath);
      if (!st.isFile() || st.size > maxSize) return null;
      return await fsReadFile(fullPath, 'utf-8');
    } catch {
      return null;
    }
  }

  async listFiles(extensions: Set<string>, maxDepth: number): Promise<FileEntry[]> {
    return this.collectFiles(this.repoPath, extensions, maxDepth, 0);
  }

  async stat(relativePath: string): Promise<{ size: number } | null> {
    try {
      const st = await fsStat(join(this.repoPath, relativePath));
      return { size: st.size };
    } catch {
      return null;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    return existsSync(join(this.repoPath, relativePath));
  }

  meta(): SourceMeta {
    return {
      type: 'local',
      name: basename(this.repoPath),
      displayName: basename(this.repoPath),
    };
  }

  private async collectFiles(
    dir: string,
    extensions: Set<string>,
    maxDepth: number,
    depth: number,
  ): Promise<FileEntry[]> {
    if (depth > maxDepth) return [];
    const files: FileEntry[] = [];
    try {
      const entries = await fsReaddir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...await this.collectFiles(full, extensions, maxDepth, depth + 1));
        } else if (extensions.has(extname(entry.name))) {
          try {
            const st = await fsStat(full);
            files.push({
              path: relative(this.repoPath, full).replace(/\\/g, '/'),
              size: st.size,
            });
          } catch { /* skip unreadable */ }
        }
      }
    } catch { /* permission errors */ }
    return files;
  }
}

// ── Semaphore (concurrency limiter) ──────────────────────────────

export class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private limit: number) {}

  acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) {
      this.active++;
      next();
    }
  }
}

// ── Disk cache types ────────────────────────────────────────────

interface MetaCache {
  default_branch: string;
  etag: string | null;
  retrieved_at: string;
}

interface TreeCacheEntry {
  path: string;
  size: number;
  sha: string;
}

interface TreeCache {
  entries: TreeCacheEntry[];
  etag: string | null;
  retrieved_at: string;
}

interface BlobCache {
  sha: string;
  content: string;
  retrieved_at: string;
}

// ── RemoteRepoSource options ────────────────────────────────────

export interface RemoteSourceOptions {
  /** Bypass disk cache entirely (--remote-refresh) */
  refresh?: boolean;
  /** Cache TTL in hours (default: 24). Blob cache ignores TTL (SHA-keyed). */
  cacheTtlHours?: number;
  /** Injectable fetch for testing (defaults to globalThis.fetch) */
  fetchImpl?: typeof globalThis.fetch;
  /** Injectable clock for testing (defaults to Date.now) */
  nowMs?: () => number;
}

// ── RemoteRepoSource ─────────────────────────────────────────────

interface TreeEntry {
  path: string;
  size: number;
  sha: string;
}

export class RemoteRepoSource implements RepoSource {
  private treeCache: Map<string, TreeEntry> | null = null;
  private fileCache = new Map<string, string | null>();
  private defaultRef: string | null = null;
  private readonly owner: string;
  private readonly repo: string;
  private readonly ref: string | undefined;
  private readonly token: string | undefined;
  private readonly opts: Required<Pick<RemoteSourceOptions, 'refresh' | 'cacheTtlHours'>>;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly nowMs: () => number;
  private readonly sem = new Semaphore(5);

  // Stats for cache logging
  apiCalls = 0;
  cacheHits = 0;

  constructor(owner: string, repo: string, ref?: string, token?: string, opts?: RemoteSourceOptions) {
    this.owner = owner;
    this.repo = repo;
    this.ref = ref;
    this.token = token;
    this.fetchImpl = opts?.fetchImpl ?? globalThis.fetch;
    this.nowMs = opts?.nowMs ?? Date.now;
    this.opts = {
      refresh: opts?.refresh ?? false,
      cacheTtlHours: opts?.cacheTtlHours ?? 24,
    };
  }

  // ── Cache I/O ──────────────────────────────────────────────────

  private cacheDir(): string {
    return join(homedir(), '.artifact', 'cache', 'remote', this.owner, this.repo);
  }

  private blobDir(): string {
    return join(this.cacheDir(), 'blobs');
  }

  private async loadCacheJson<T>(filename: string): Promise<T | null> {
    if (this.opts.refresh) return null;
    try {
      const raw = await fsReadFile(join(this.cacheDir(), filename), 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async saveCacheJson(filename: string, data: unknown): Promise<void> {
    try {
      const dir = this.cacheDir();
      await fsMkdir(dir, { recursive: true });
      await fsWriteFile(join(dir, filename), JSON.stringify(data, null, 2) + '\n', 'utf-8');
    } catch { /* best-effort cache write */ }
  }

  private async loadBlobCache(sha: string): Promise<string | null> {
    if (this.opts.refresh) return null;
    try {
      const raw = await fsReadFile(join(this.blobDir(), `${sha}.json`), 'utf-8');
      const parsed = JSON.parse(raw) as BlobCache;
      if (parsed.sha === sha && typeof parsed.content === 'string') return parsed.content;
      return null;
    } catch {
      return null;
    }
  }

  private async saveBlobCache(sha: string, content: string): Promise<void> {
    try {
      const dir = this.blobDir();
      await fsMkdir(dir, { recursive: true });
      const entry: BlobCache = { sha, content, retrieved_at: new Date().toISOString() };
      await fsWriteFile(join(dir, `${sha}.json`), JSON.stringify(entry) + '\n', 'utf-8');
    } catch { /* best-effort */ }
  }

  private isFresh(retrievedAt: string): boolean {
    const age = this.nowMs() - new Date(retrievedAt).getTime();
    return age < this.opts.cacheTtlHours * 3600_000;
  }

  // ── HTTP helpers ───────────────────────────────────────────────

  private baseHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  /** Fetch with optional ETag conditional request */
  private async conditionalFetch(url: string, etag?: string | null): Promise<{
    status: number;
    data: unknown;
    etag: string | null;
    notModified: boolean;
    headers: Headers;
  }> {
    const headers = this.baseHeaders();
    if (etag && !this.opts.refresh) {
      headers['If-None-Match'] = etag;
    }

    this.apiCalls++;
    const res = await this.fetchImpl(url, { headers });

    if (res.status === 304) {
      return {
        status: 304,
        data: null,
        etag: res.headers.get('etag'),
        notModified: true,
        headers: res.headers,
      };
    }

    // Error handling
    if (res.status === 404) {
      throw new Error(
        `Repository "${this.owner}/${this.repo}" not found on GitHub.`
        + (this.token ? '' : ' If it\'s private, set GITHUB_TOKEN.'),
      );
    }
    if (res.status === 403) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        throw new Error(
          'GitHub API rate limit reached.'
          + (this.token ? '' : ' Set GITHUB_TOKEN for 5000 req/hr (current: 60/hr).'),
        );
      }
      throw new Error(`GitHub API forbidden (403). Check your token permissions.`);
    }
    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    return {
      status: res.status,
      data: await res.json(),
      etag: res.headers.get('etag'),
      notModified: false,
      headers: res.headers,
    };
  }

  // ── Core methods with disk cache ───────────────────────────────

  /** Resolve default branch if no ref was specified */
  private async resolveRef(): Promise<string> {
    if (this.ref) return this.ref;
    if (this.defaultRef) return this.defaultRef;

    // Check disk cache
    const cached = await this.loadCacheJson<MetaCache>('meta.json');
    if (cached && this.isFresh(cached.retrieved_at)) {
      this.defaultRef = cached.default_branch;
      this.cacheHits++;
      return this.defaultRef;
    }

    // Conditional fetch (or fresh fetch if no cache)
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}`;
    const result = await this.conditionalFetch(url, cached?.etag);

    if (result.notModified && cached) {
      // 304 — update timestamp, keep cached data
      cached.retrieved_at = new Date().toISOString();
      if (result.etag) cached.etag = result.etag;
      await this.saveCacheJson('meta.json', cached);
      this.defaultRef = cached.default_branch;
      return this.defaultRef;
    }

    // 200 — save new data
    const data = result.data as { default_branch: string };
    const entry: MetaCache = {
      default_branch: data.default_branch,
      etag: result.etag,
      retrieved_at: new Date().toISOString(),
    };
    await this.saveCacheJson('meta.json', entry);
    this.defaultRef = data.default_branch;
    return this.defaultRef;
  }

  /** Load the full recursive file tree (with disk cache + ETag) */
  private async loadTree(): Promise<Map<string, TreeEntry>> {
    if (this.treeCache) return this.treeCache;

    const ref = await this.resolveRef();
    const cacheFile = `tree-${ref}.json`;

    // Check disk cache
    const cached = await this.loadCacheJson<TreeCache>(cacheFile);
    if (cached && this.isFresh(cached.retrieved_at)) {
      this.treeCache = new Map();
      for (const item of cached.entries) {
        this.treeCache.set(item.path, item);
      }
      this.cacheHits++;
      return this.treeCache;
    }

    // Conditional fetch
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/git/trees/${ref}?recursive=1`;
    const result = await this.conditionalFetch(url, cached?.etag);

    if (result.notModified && cached) {
      // 304 — tree unchanged, update timestamp
      cached.retrieved_at = new Date().toISOString();
      if (result.etag) cached.etag = result.etag;
      await this.saveCacheJson(cacheFile, cached);
      this.treeCache = new Map();
      for (const item of cached.entries) {
        this.treeCache.set(item.path, item);
      }
      return this.treeCache;
    }

    // 200 — new tree
    const data = result.data as {
      tree: Array<{ path: string; type: string; size?: number; sha: string }>;
      truncated: boolean;
    };

    if (data.truncated) {
      console.error('Warning: GitHub tree was truncated (repo has very many files). Some source files may be missed.');
    }

    const entries: TreeCacheEntry[] = [];
    this.treeCache = new Map();
    for (const item of data.tree) {
      if (item.type === 'blob') {
        const entry: TreeEntry = {
          path: item.path,
          size: item.size ?? 0,
          sha: item.sha,
        };
        this.treeCache.set(item.path, entry);
        entries.push(entry);
      }
    }

    // Save to disk cache
    const treeEntry: TreeCache = {
      entries,
      etag: result.etag,
      retrieved_at: new Date().toISOString(),
    };
    await this.saveCacheJson(cacheFile, treeEntry);

    return this.treeCache;
  }

  async readFile(relativePath: string, maxSize = 256 * 1024): Promise<string | null> {
    // Normalize path separators
    const normalized = relativePath.replace(/\\/g, '/');

    // Check in-memory cache
    if (this.fileCache.has(normalized)) return this.fileCache.get(normalized)!;

    // Check tree for existence and size
    const tree = await this.loadTree();
    const entry = tree.get(normalized);
    if (!entry) {
      this.fileCache.set(normalized, null);
      return null;
    }
    if (entry.size > maxSize) {
      this.fileCache.set(normalized, null);
      return null;
    }

    // Check blob disk cache (keyed by SHA — content-addressable, no TTL)
    const blobContent = await this.loadBlobCache(entry.sha);
    if (blobContent !== null) {
      this.fileCache.set(normalized, blobContent);
      this.cacheHits++;
      return blobContent;
    }

    // Fetch file content via Contents API (with semaphore)
    await this.sem.acquire();
    try {
      const ref = await this.resolveRef();
      const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${normalized}?ref=${ref}`;

      this.apiCalls++;
      const res = await this.fetchImpl(url, { headers: this.baseHeaders() });
      if (!res.ok) {
        this.fileCache.set(normalized, null);
        return null;
      }

      const data = await res.json() as { content?: string; encoding?: string };
      if (data.encoding !== 'base64' || typeof data.content !== 'string') {
        this.fileCache.set(normalized, null);
        return null;
      }

      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      this.fileCache.set(normalized, content);

      // Save to blob cache (keyed by SHA — reusable across runs/refs)
      await this.saveBlobCache(entry.sha, content);

      return content;
    } catch {
      this.fileCache.set(normalized, null);
      return null;
    } finally {
      this.sem.release();
    }
  }

  async listFiles(extensions: Set<string>, maxDepth: number): Promise<FileEntry[]> {
    const tree = await this.loadTree();
    const files: FileEntry[] = [];

    for (const [path, entry] of tree) {
      // Check depth (segments - 1 = directory nesting)
      const segments = path.split('/');
      if (segments.length - 1 > maxDepth) continue;

      // Skip hidden and vendor dirs
      if (segments.some(s => s.startsWith('.') || SKIP_DIRS.has(s))) continue;

      // Check extension
      const ext = extname(path);
      if (ext && extensions.has(ext)) {
        files.push({ path, size: entry.size });
      }
    }

    return files;
  }

  async stat(relativePath: string): Promise<{ size: number } | null> {
    const normalized = relativePath.replace(/\\/g, '/');
    const tree = await this.loadTree();
    const entry = tree.get(normalized);
    return entry ? { size: entry.size } : null;
  }

  async exists(relativePath: string): Promise<boolean> {
    const normalized = relativePath.replace(/\\/g, '/');
    const tree = await this.loadTree();
    return tree.has(normalized);
  }

  meta(): SourceMeta {
    return {
      type: 'remote',
      name: `${this.owner}/${this.repo}`,
      displayName: this.repo,
      ref: this.ref,
      owner: this.owner,
      repo: this.repo,
    };
  }

  /** Log cache stats to stderr. Call after all operations complete. */
  logCacheStats(): void {
    if (this.apiCalls === 0 && this.cacheHits > 0) {
      console.error(`Remote cache: all data from disk cache (0 API calls)`);
    } else if (this.cacheHits > 0) {
      console.error(`Remote cache: ${this.cacheHits} cache hits, ${this.apiCalls} API calls`);
    } else if (this.apiCalls > 0) {
      console.error(`Remote: ${this.apiCalls} API calls (cold cache)`);
    }
  }
}

// ── Path resolvers ───────────────────────────────────────────────

/**
 * Resolve the output directory for .artifact/ data.
 * Local:  repoPath/.artifact/
 * Remote: ~/.artifact/repos/owner/repo/
 */
export function resolveOutputDir(source: RepoSource, localRepoPath?: string): string {
  const m = source.meta();
  if (m.type === 'local' && localRepoPath) {
    return resolve(localRepoPath, '.artifact');
  }
  if (m.type === 'remote' && m.owner && m.repo) {
    return join(homedir(), '.artifact', 'repos', m.owner, m.repo);
  }
  throw new Error('Cannot resolve output dir: unknown source type or missing local path');
}

/** Resolve the repo name for ledger/tracking/display. */
export function resolveRepoName(source: RepoSource): string {
  return source.meta().name;
}
