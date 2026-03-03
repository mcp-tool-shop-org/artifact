/**
 * Repo Source Abstraction (Phase 15)
 *
 * Decouples truth extraction from the filesystem so Artifact can
 * analyze repos locally OR via the GitHub API without a local clone.
 *
 * Two implementations:
 *   LocalRepoSource  — wraps node:fs (existing behavior)
 *   RemoteRepoSource — GitHub REST API via native fetch (no deps)
 */

import { readFile as fsReadFile, readdir as fsReaddir, stat as fsStat } from 'node:fs/promises';
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

  constructor(owner: string, repo: string, ref?: string, token?: string) {
    this.owner = owner;
    this.repo = repo;
    this.ref = ref;
    this.token = token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  /** Resolve default branch if no ref was specified */
  private async resolveRef(): Promise<string> {
    if (this.ref) return this.ref;
    if (this.defaultRef) return this.defaultRef;

    const url = `https://api.github.com/repos/${this.owner}/${this.repo}`;
    const res = await fetch(url, { headers: this.headers() });

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

    const data = await res.json() as { default_branch: string };
    this.defaultRef = data.default_branch;
    return this.defaultRef;
  }

  /** Load the full recursive file tree (one API call, cached) */
  private async loadTree(): Promise<Map<string, TreeEntry>> {
    if (this.treeCache) return this.treeCache;

    const ref = await this.resolveRef();
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/git/trees/${ref}?recursive=1`;
    const res = await fetch(url, { headers: this.headers() });

    if (!res.ok) {
      throw new Error(`GitHub tree API error: ${res.status} for ref "${ref}"`);
    }

    const data = await res.json() as {
      tree: Array<{ path: string; type: string; size?: number; sha: string }>;
      truncated: boolean;
    };

    if (data.truncated) {
      console.error('Warning: GitHub tree was truncated (repo has very many files). Some source files may be missed.');
    }

    this.treeCache = new Map();
    for (const item of data.tree) {
      if (item.type === 'blob') {
        this.treeCache.set(item.path, {
          path: item.path,
          size: item.size ?? 0,
          sha: item.sha,
        });
      }
    }
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

    // Fetch file content via Contents API
    const ref = await this.resolveRef();
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${normalized}?ref=${ref}`;

    try {
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) {
        this.fileCache.set(normalized, null);
        return null;
      }

      const data = await res.json() as { content?: string; encoding?: string };
      if (data.encoding !== 'base64' || !data.content) {
        this.fileCache.set(normalized, null);
        return null;
      }

      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      this.fileCache.set(normalized, content);
      return content;
    } catch {
      this.fileCache.set(normalized, null);
      return null;
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
