/**
 * Memory Store — persistent RAG memory for the Curator.
 *
 * Three scopes:
 *   Org:     ~/.artifact/org-memory.json (global preferences, house rules, cross-repo patterns)
 *   Repo:    <repo>/.artifact/memory.json (per-repo decisions, motifs, outlines)
 *   Session: in-memory only (ephemeral scratch, not persisted)
 *
 * Everything is local, inspectable, and deleteable.
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import type { DecisionPacket } from './types.js';
import { cosineSimilarity, keywordSimilarity, embed, findEmbedModel } from './embed.js';

// ── Types ───────────────────────────────────────────────────────

export type MemoryScope = 'org' | 'repo';
export type MemoryEntryType = 'decision_packet' | 'preference' | 'veto' | 'postmortem' | 'rule';

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  type: MemoryEntryType;
  repo_name: string | null;
  content: string;            // Human-readable summary for retrieval
  data: unknown;              // Structured data (full packet, etc.)
  embedding: number[] | null; // Vector for semantic search
  created_at: string;
  tags: string[];
}

export interface MemoryStore {
  entries: MemoryEntry[];
}

export interface MemoryBrief {
  repo_entries: MemoryEntry[];
  org_entries: MemoryEntry[];
  formatted: string;
}

// ── Paths ───────────────────────────────────────────────────────

const ORG_DIR = join(homedir(), '.artifact');
const ORG_FILE = 'org-memory.json';
const REPO_FILE = 'memory.json';
const REPO_DIR = '.artifact';
const MAX_ENTRIES_PER_STORE = 100;

function orgPath(): string {
  return join(ORG_DIR, ORG_FILE);
}

function repoMemoryPath(repoRoot: string, outputDir?: string): string {
  if (outputDir) return join(outputDir, REPO_FILE);
  return join(repoRoot, REPO_DIR, REPO_FILE);
}

// ── ID generation ───────────────────────────────────────────────

function entryId(type: string, content: string, timestamp: string): string {
  return createHash('sha256')
    .update(`${type}:${content}:${timestamp}`)
    .digest('hex')
    .slice(0, 16);
}

// ── Redaction ───────────────────────────────────────────────────

const SECRET_PATTERNS = [
  /(?:api[_-]?key|token|secret|password|credential|auth)\s*[:=]\s*['"]?[a-zA-Z0-9_\-./+]{16,}/gi,
  /(?:sk|pk|ghp|gho|ghs|ghu|github_pat)_[a-zA-Z0-9]{20,}/g,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
];

function redact(text: string): string {
  let cleaned = text;
  for (const pattern of SECRET_PATTERNS) {
    cleaned = cleaned.replace(pattern, '[REDACTED]');
  }
  return cleaned;
}

// ── Store I/O ───────────────────────────────────────────────────

async function loadStore(path: string): Promise<MemoryStore> {
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as MemoryStore;
    if (Array.isArray(parsed.entries)) return parsed;
    return { entries: [] };
  } catch {
    return { entries: [] };
  }
}

async function saveStore(path: string, store: MemoryStore): Promise<void> {
  const dir = join(path, '..');
  await mkdir(dir, { recursive: true });
  // Trim to max
  if (store.entries.length > MAX_ENTRIES_PER_STORE) {
    store.entries = store.entries.slice(-MAX_ENTRIES_PER_STORE);
  }
  await writeFile(path, JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

// ── Public API ──────────────────────────────────────────────────

/** Load org-level memory */
export async function loadOrg(): Promise<MemoryStore> {
  return loadStore(orgPath());
}

/** Load repo-level memory */
export async function loadRepo(repoRoot: string, outputDir?: string): Promise<MemoryStore> {
  return loadStore(repoMemoryPath(repoRoot, outputDir));
}

/** Write an entry to the appropriate store */
export async function write(
  entry: Omit<MemoryEntry, 'id' | 'created_at'>,
  repoRoot?: string,
  ollamaHost?: string,
  outputDir?: string,
): Promise<MemoryEntry> {
  const now = new Date().toISOString();
  const full: MemoryEntry = {
    ...entry,
    id: entryId(entry.type, entry.content, now),
    content: redact(entry.content),
    created_at: now,
  };

  // Try to compute embedding if Ollama is available
  if (!full.embedding && ollamaHost) {
    const embedModel = await findEmbedModel(ollamaHost);
    if (embedModel) {
      full.embedding = await embed(ollamaHost, embedModel, full.content);
    }
  }

  if (entry.scope === 'org') {
    const store = await loadOrg();
    store.entries.push(full);
    await saveStore(orgPath(), store);
  } else if (repoRoot) {
    const store = await loadRepo(repoRoot, outputDir);
    store.entries.push(full);
    await saveStore(repoMemoryPath(repoRoot, outputDir), store);
  }

  return full;
}

/** Convert a DecisionPacket to a memory-ready content string */
export function packetToContent(packet: DecisionPacket): string {
  const hooks = packet.selected_hooks.map(h => `${h.role}=${h.atom_id}`).join(', ');
  return [
    `Repo: ${packet.repo_name}`,
    `Tier: ${packet.tier}`,
    `Formats: ${packet.format_candidates.join(', ')}`,
    `Constraints: ${packet.constraints.join(', ')}`,
    `Hooks: ${hooks || 'none'}`,
    `Must include: ${packet.must_include.join('; ')}`,
    `Weird detail: ${packet.freshness_payload.weird_detail}`,
    `Sharp edge: ${packet.freshness_payload.sharp_edge}`,
    `Driver: ${packet.driver_meta.mode} (${packet.driver_meta.model ?? 'fallback'})`,
  ].join(' | ');
}

/** Write a DecisionPacket to both org and repo memory */
export async function writePacket(
  packet: DecisionPacket,
  repoRoot: string,
  ollamaHost?: string,
  outputDir?: string,
): Promise<void> {
  const content = packetToContent(packet);

  // Repo memory — full packet
  await write({
    scope: 'repo',
    type: 'decision_packet',
    repo_name: packet.repo_name,
    content,
    data: packet,
    embedding: null,
    tags: [packet.tier, ...packet.format_candidates, ...packet.constraints],
  }, repoRoot, ollamaHost, outputDir);

  // Org memory — compact summary (for cross-repo variety tracking)
  await write({
    scope: 'org',
    type: 'decision_packet',
    repo_name: packet.repo_name,
    content,
    data: { tier: packet.tier, formats: packet.format_candidates, constraints: packet.constraints },
    embedding: null,
    tags: [packet.tier, packet.repo_name],
  }, undefined, ollamaHost);
}

// ── Retrieval ───────────────────────────────────────────────────

interface SearchOptions {
  query: string;
  topK?: number;
  threshold?: number;
  ollamaHost?: string;
}

/** Search a store by semantic similarity (embeddings) or keyword fallback */
async function searchStore(
  store: MemoryStore,
  opts: SearchOptions,
): Promise<MemoryEntry[]> {
  const { query, topK = 5, threshold = 0.15, ollamaHost } = opts;
  if (store.entries.length === 0) return [];

  // Try embedding-based search
  let queryEmbedding: number[] | null = null;
  if (ollamaHost) {
    const embedModel = await findEmbedModel(ollamaHost);
    if (embedModel) {
      queryEmbedding = await embed(ollamaHost, embedModel, query);
    }
  }

  const scored = store.entries.map(entry => {
    let score: number;
    if (queryEmbedding && entry.embedding) {
      score = cosineSimilarity(queryEmbedding, entry.embedding);
    } else {
      // Keyword fallback
      score = keywordSimilarity(query, entry.content);
    }
    return { entry, score };
  });

  return scored
    .filter(s => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.entry);
}

/** Build a memory brief for the Curator — compact, relevant, no noise */
export async function buildMemoryBrief(
  repoRoot: string,
  repoName: string,
  query: string,
  ollamaHost?: string,
  outputDir?: string,
): Promise<MemoryBrief> {
  const orgStore = await loadOrg();
  const repoStore = await loadRepo(repoRoot, outputDir);

  const searchOpts: SearchOptions = { query, topK: 3, ollamaHost };

  // Search both stores
  const repoResults = await searchStore(repoStore, searchOpts);
  const orgResults = await searchStore(orgStore, {
    ...searchOpts,
    topK: 5,
  });

  // Filter org results to exclude this repo's own entries (avoid echo)
  const orgFiltered = orgResults.filter(e => e.repo_name !== repoName);

  // Format for injection
  const lines: string[] = [];

  if (repoResults.length > 0) {
    lines.push('=== REPO MEMORY (previous decisions for this repo) ===');
    for (const e of repoResults) {
      lines.push(`[${e.created_at.slice(0, 10)}] ${e.content}`);
    }
  }

  if (orgFiltered.length > 0) {
    lines.push('');
    lines.push('=== ORG MEMORY (decisions across other repos — avoid repetition) ===');
    for (const e of orgFiltered) {
      lines.push(`[${e.created_at.slice(0, 10)}] ${e.content}`);
    }
  }

  return {
    repo_entries: repoResults,
    org_entries: orgFiltered,
    formatted: lines.length > 0 ? lines.join('\n') : '',
  };
}

// ── CLI helpers ─────────────────────────────────────────────────

/** Show all entries for a given scope/repo */
export async function show(repoRoot?: string, outputDir?: string): Promise<MemoryEntry[]> {
  if (repoRoot) {
    const store = await loadRepo(repoRoot, outputDir);
    return store.entries;
  }
  const store = await loadOrg();
  return store.entries;
}

/** Forget all entries for a specific repo (from both org and repo stores) */
export async function forget(repoName: string, repoRoot?: string, outputDir?: string): Promise<number> {
  let removed = 0;

  // Clean org memory
  const orgStore = await loadOrg();
  const orgBefore = orgStore.entries.length;
  orgStore.entries = orgStore.entries.filter(e => e.repo_name !== repoName);
  removed += orgBefore - orgStore.entries.length;
  await saveStore(orgPath(), orgStore);

  // Clean repo memory
  if (repoRoot) {
    const memPath = repoMemoryPath(repoRoot, outputDir);
    if (existsSync(memPath)) {
      const repoStore = await loadRepo(repoRoot, outputDir);
      removed += repoStore.entries.length;
      await rm(memPath);
    }
  }

  return removed;
}

/** Prune entries older than N days */
export async function prune(maxAgeDays: number, repoRoot?: string): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeDays * 86400_000).toISOString();
  let removed = 0;

  // Prune org
  const orgStore = await loadOrg();
  const orgBefore = orgStore.entries.length;
  orgStore.entries = orgStore.entries.filter(e => e.created_at >= cutoff);
  removed += orgBefore - orgStore.entries.length;
  await saveStore(orgPath(), orgStore);

  // Prune repo if specified
  if (repoRoot) {
    const repoStore = await loadRepo(repoRoot);
    const repoBefore = repoStore.entries.length;
    repoStore.entries = repoStore.entries.filter(e => e.created_at >= cutoff);
    removed += repoBefore - repoStore.entries.length;
    await saveStore(repoMemoryPath(repoRoot), repoStore);
  }

  return removed;
}

/** Memory stats summary */
export async function stats(repoRoot?: string): Promise<{
  org_count: number;
  repo_count: number;
  repos_seen: string[];
  oldest: string | null;
  newest: string | null;
}> {
  const orgStore = await loadOrg();
  const repoStore = repoRoot ? await loadRepo(repoRoot) : { entries: [] };

  const allEntries = [...orgStore.entries, ...repoStore.entries];
  const repos = [...new Set(allEntries.map(e => e.repo_name).filter(Boolean))] as string[];
  const dates = allEntries.map(e => e.created_at).sort();

  return {
    org_count: orgStore.entries.length,
    repo_count: repoStore.entries.length,
    repos_seen: repos,
    oldest: dates[0] ?? null,
    newest: dates[dates.length - 1] ?? null,
  };
}
