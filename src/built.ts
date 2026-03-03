/**
 * Built Artifact Tracking (Phase 14)
 *
 * Mutable store that tracks which repos have built artifacts,
 * their verification status, file paths, and iteration counts.
 *
 * Storage: ~/.artifact/org/built.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { BuiltStatus, BuiltRecord, BuiltStore } from './types.js';

// ── Paths ────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

function builtStorePath(): string {
  return join(homedir(), '.artifact', 'org', 'built.json');
}

// ── Store I/O ────────────────────────────────────────────────────

/** Load the built store, returning empty store on missing/corrupt */
export async function loadBuiltStore(): Promise<BuiltStore> {
  try {
    const raw = await readFile(builtStorePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && typeof parsed.repos === 'object') {
      return parsed as BuiltStore;
    }
    return { version: 1, repos: {} };
  } catch {
    return { version: 1, repos: {} };
  }
}

/** Save the built store */
export async function saveBuiltStore(store: BuiltStore): Promise<void> {
  const p = builtStorePath();
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

// ── Record operations ────────────────────────────────────────────

/** Get a single record by repo name */
export async function getBuiltRecord(repoName: string): Promise<BuiltRecord | null> {
  const store = await loadBuiltStore();
  return store.repos[repoName] ?? null;
}

/** Read tool version from package.json */
export async function getToolVersion(): Promise<string> {
  try {
    const raw = await readFile(resolve(__dirname, '..', 'package.json'), 'utf-8');
    return JSON.parse(raw).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Attach artifact file paths to a repo record.
 * Creates the record if it doesn't exist.
 * Deduplicates paths. Sets status to built_unverified if was blueprint_only.
 */
export async function addArtifactPaths(
  repoName: string,
  paths: string[],
  toolVersion: string,
  persona: string,
): Promise<BuiltRecord> {
  const store = await loadBuiltStore();
  const now = new Date().toISOString();

  let record = store.repos[repoName];
  if (!record) {
    record = {
      repo_name: repoName,
      built_status: 'built_unverified',
      artifact_paths: [],
      verified_at: null,
      verified_by: null,
      tool_version: toolVersion,
      persona,
      iterations: 0,
      rating: null,
      updated_at: now,
    };
  }

  // Deduplicate paths
  const existing = new Set(record.artifact_paths);
  for (const p of paths) {
    existing.add(p);
  }
  record.artifact_paths = [...existing];

  // Upgrade status if was blueprint_only
  if (record.built_status === 'blueprint_only') {
    record.built_status = 'built_unverified';
  }

  record.tool_version = toolVersion;
  record.persona = persona;
  record.updated_at = now;
  store.repos[repoName] = record;

  await saveBuiltStore(store);
  return record;
}

/**
 * Record a verify result for a repo.
 * Sets verified_pass or verified_fail, increments iterations,
 * updates verified_at and verified_by.
 */
export async function recordVerifyResult(
  repoName: string,
  passed: boolean,
  toolVersion: string,
  persona: string,
): Promise<BuiltRecord> {
  const store = await loadBuiltStore();
  const now = new Date().toISOString();

  let record = store.repos[repoName];
  if (!record) {
    record = {
      repo_name: repoName,
      built_status: passed ? 'verified_pass' : 'verified_fail',
      artifact_paths: [],
      verified_at: now,
      verified_by: persona,
      tool_version: toolVersion,
      persona,
      iterations: 1,
      rating: null,
      updated_at: now,
    };
  } else {
    record.built_status = passed ? 'verified_pass' : 'verified_fail';
    record.iterations += 1;
    record.verified_at = now;
    record.verified_by = persona;
    record.tool_version = toolVersion;
    record.persona = persona;
    record.updated_at = now;
  }

  store.repos[repoName] = record;
  await saveBuiltStore(store);
  return record;
}

/**
 * List built records, optionally filtered by repo name.
 * Sorted by updated_at descending.
 */
export function listBuiltRecords(store: BuiltStore, filterRepo?: string): BuiltRecord[] {
  let records = Object.values(store.repos);
  if (filterRepo) {
    records = records.filter(r => r.repo_name === filterRepo);
  }
  return records.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

// ── Badge definitions ────────────────────────────────────────────

export interface StatusBadge {
  label: string;
  color: string;
  icon: string;
}

const BADGES: Record<BuiltStatus, StatusBadge> = {
  blueprint_only: { label: 'Blueprint Only', color: '#6b7280', icon: '&#x2702;' },
  built_unverified: { label: 'Unverified', color: '#f59e0b', icon: '&#x25A1;' },
  verified_pass: { label: 'Verified', color: '#10b981', icon: '&#x2713;' },
  verified_fail: { label: 'Failed', color: '#f85149', icon: '&#x2717;' },
};

/** Get badge info for a built status */
export function builtStatusBadge(status: BuiltStatus): StatusBadge {
  return BADGES[status];
}

// ── Formatting ──────────────────────────────────────────────────

/** Format a single record for detailed CLI display */
export function formatBuiltRecord(record: BuiltRecord): string {
  const badge = builtStatusBadge(record.built_status);
  const lines: string[] = [];

  lines.push(`${record.repo_name} — ${badge.label}`);
  lines.push(`  status:     ${record.built_status}`);
  lines.push(`  paths:      ${record.artifact_paths.length > 0 ? record.artifact_paths.join(', ') : 'none'}`);
  lines.push(`  verified:   ${record.verified_at ? record.verified_at.slice(0, 19) : 'never'}`);
  lines.push(`  verified by:${record.verified_by ? ` ${record.verified_by}` : ' n/a'}`);
  lines.push(`  iterations: ${record.iterations}`);
  lines.push(`  persona:    ${record.persona}`);
  lines.push(`  version:    ${record.tool_version}`);
  if (record.rating !== null) {
    lines.push(`  rating:     ${record.rating}/5`);
  }
  lines.push(`  updated:    ${record.updated_at.slice(0, 19)}`);

  return lines.join('\n');
}

/** Format a list of records for tabular CLI display */
export function formatBuiltList(records: BuiltRecord[]): string {
  if (records.length === 0) {
    return 'No built artifacts tracked yet.';
  }

  const lines: string[] = [];
  // Header
  lines.push(`${'Repo'.padEnd(24)} ${'Status'.padEnd(18)} ${'Paths'.padEnd(6)} ${'Iters'.padEnd(6)} ${'Verified'.padEnd(20)}`);
  lines.push(`${'─'.repeat(24)} ${'─'.repeat(18)} ${'─'.repeat(6)} ${'─'.repeat(6)} ${'─'.repeat(20)}`);

  for (const r of records) {
    const badge = builtStatusBadge(r.built_status);
    const verified = r.verified_at ? r.verified_at.slice(0, 19) : 'never';
    lines.push(
      `${r.repo_name.padEnd(24)} ${badge.label.padEnd(18)} ${String(r.artifact_paths.length).padEnd(6)} ${String(r.iterations).padEnd(6)} ${verified}`,
    );
  }

  lines.push(`\n${records.length} tracked repos.`);
  return lines.join('\n');
}
