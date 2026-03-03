/**
 * History store — .artifact/history.json
 * Tracks last N decisions to prevent repetition.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { HistoryStore, HistoryEntry, Tier } from './types.js';

const HISTORY_DIR = '.artifact';
const HISTORY_FILE = 'history.json';
const MAX_ENTRIES = 25;

function historyPath(repoRoot: string): string {
  return join(repoRoot, HISTORY_DIR, HISTORY_FILE);
}

/** Load history from .artifact/history.json. Returns empty store if missing. */
export async function load(repoRoot: string, outputDir?: string): Promise<HistoryStore> {
  const path = outputDir ? join(outputDir, HISTORY_FILE) : historyPath(repoRoot);
  try {
    const raw = await readFile(path, 'utf-8');
    const parsed = JSON.parse(raw) as HistoryStore;
    if (Array.isArray(parsed.entries)) return parsed;
    return { entries: [] };
  } catch {
    return { entries: [] };
  }
}

/** Append an entry and trim to MAX_ENTRIES. Writes to disk. */
export async function append(repoRoot: string, entry: HistoryEntry, outputDir?: string): Promise<void> {
  const store = await load(repoRoot, outputDir);
  store.entries.push(entry);
  if (store.entries.length > MAX_ENTRIES) {
    store.entries = store.entries.slice(-MAX_ENTRIES);
  }
  const dir = outputDir ?? join(repoRoot, HISTORY_DIR);
  await mkdir(dir, { recursive: true });
  const path = outputDir ? join(outputDir, HISTORY_FILE) : historyPath(repoRoot);
  await writeFile(path, JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

/** Get recently used tiers (last N). */
export function recentTiers(store: HistoryStore, n = 5): Tier[] {
  return store.entries.slice(-n).map(e => e.tier);
}

/** Get recently used format families (last N entries, flattened). */
export function recentFormats(store: HistoryStore, n = 5): string[] {
  return store.entries.slice(-n).flatMap(e => e.formats);
}

/** Get recently used constraints (last N entries, flattened). */
export function recentConstraints(store: HistoryStore, n = 5): string[] {
  return store.entries.slice(-n).flatMap(e => e.constraints);
}

/** Get recently used atom IDs (last N entries, flattened). */
export function recentAtomIds(store: HistoryStore, n = 5): string[] {
  return store.entries.slice(-n).flatMap(e => e.atom_ids_used ?? []);
}
