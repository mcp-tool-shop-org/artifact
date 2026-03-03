/**
 * Catalog Generator (Phase 7)
 *
 * Generates a season catalog from the org ledger.
 * Makes the collection visible, brag-worthy, and museum-ready.
 *
 * Outputs:
 *   CATALOG.md    — human-readable season catalog
 *   catalog.json  — machine-readable full index
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import type { LedgerEntry, OrgStatus, Season, Tier } from './types.js';
import { loadLedger, loadSeason, computeStatus } from './org.js';
import { FORMAT_HINTS } from './blueprint.js';

// ── Types ───────────────────────────────────────────────────────

interface CatalogEntry {
  repo_name: string;
  tier: Tier;
  format: string;
  format_hint: string;
  constraints: string[];
  signature_move: string | null;
  season: string;
  timestamp: string;
}

interface CatalogJson {
  generated_at: string;
  season: string | null;
  season_notes: string | null;
  total_entries: number;
  entries: CatalogEntry[];
  stats: {
    tier_distribution: Record<string, number>;
    format_distribution: Record<string, number>;
    signature_moves: Record<string, number>;
    diversity_score: number;
  };
}

// ── Tier display ────────────────────────────────────────────────

const TIER_LABELS: Record<Tier, string> = {
  Exec: 'Executive',
  Dev: 'Developer',
  Creator: 'Creator',
  Fun: 'Fun',
  Promotion: 'Promotion',
};

// ── Build catalog ───────────────────────────────────────────────

function ledgerToEntries(ledger: LedgerEntry[]): CatalogEntry[] {
  return ledger.map(e => ({
    repo_name: e.repo_name,
    tier: e.tier,
    format: e.format_family,
    format_hint: FORMAT_HINTS[e.format_family] ?? e.format_family,
    constraints: e.constraints,
    signature_move: e.signature_move,
    season: e.season,
    timestamp: e.timestamp,
  }));
}

function buildMarkdownCatalog(
  entries: CatalogEntry[],
  season: Season | null,
  status: OrgStatus,
): string {
  const lines: string[] = [];

  // Header
  if (season) {
    lines.push(`# ${season.name} — Artifact Catalog`);
    lines.push('');
    lines.push(`> ${season.notes}`);
    lines.push(`> Started ${season.started_at.slice(0, 10)}`);
  } else {
    lines.push('# Artifact Catalog');
    lines.push('');
    lines.push('> All decisions across the org');
  }
  lines.push('');
  lines.push(`*${entries.length} artifacts | diversity: ${status.diversity_score}/100*`);
  lines.push('');

  // Stats summary
  lines.push('## Collection Stats');
  lines.push('');
  lines.push('| Tier | Count | % |');
  lines.push('|------|------:|--:|');
  const tiers: Tier[] = ['Exec', 'Dev', 'Creator', 'Fun', 'Promotion'];
  for (const t of tiers) {
    const count = status.tier_distribution[t] ?? 0;
    const pct = entries.length > 0 ? Math.round((count / entries.length) * 100) : 0;
    if (count > 0) {
      lines.push(`| ${TIER_LABELS[t]} | ${count} | ${pct}% |`);
    }
  }
  lines.push('');

  // Signature moves used
  const moveEntries = Object.entries(status.signature_move_usage).filter(([, c]) => c > 0);
  if (moveEntries.length > 0) {
    lines.push('**Signature moves:** ' + moveEntries.map(([m, c]) => `${m} (${c}x)`).join(', '));
    lines.push('');
  }

  // Bans and gaps
  if (status.recent_bans.length > 0) {
    lines.push('**Active bans:** ' + status.recent_bans.map(b => `~~${b.split(':')[0]}~~`).join(', '));
    lines.push('');
  }

  // Catalog entries, grouped by tier
  lines.push('---');
  lines.push('');
  lines.push('## Collection');
  lines.push('');

  const byTier = new Map<Tier, CatalogEntry[]>();
  for (const e of entries) {
    const list = byTier.get(e.tier) ?? [];
    list.push(e);
    byTier.set(e.tier, list);
  }

  for (const t of tiers) {
    const tierEntries = byTier.get(t);
    if (!tierEntries || tierEntries.length === 0) continue;

    lines.push(`### ${TIER_LABELS[t]} Tier`);
    lines.push('');

    for (const e of tierEntries) {
      const move = e.signature_move ? ` \`${e.signature_move}\`` : '';
      const constraintStr = e.constraints.length > 0
        ? ` | ${e.constraints.join(', ')}`
        : '';
      lines.push(`- **${e.repo_name}** — ${e.format} ${move}`);
      lines.push(`  ${e.format_hint}${constraintStr}`);
      lines.push(`  *${e.timestamp.slice(0, 10)}*`);
    }
    lines.push('');
  }

  // Timeline view (reverse chronological)
  lines.push('---');
  lines.push('');
  lines.push('## Timeline');
  lines.push('');
  lines.push('| Date | Repo | Tier | Format | Move |');
  lines.push('|------|------|------|--------|------|');
  const sorted = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  for (const e of sorted) {
    const move = e.signature_move ?? '';
    lines.push(`| ${e.timestamp.slice(0, 10)} | ${e.repo_name} | ${e.tier} | ${e.format} | ${move} |`);
  }
  lines.push('');

  return lines.join('\n');
}

function buildJsonCatalog(
  entries: CatalogEntry[],
  season: Season | null,
  status: OrgStatus,
): CatalogJson {
  return {
    generated_at: new Date().toISOString(),
    season: season?.name ?? null,
    season_notes: season?.notes ?? null,
    total_entries: entries.length,
    entries,
    stats: {
      tier_distribution: status.tier_distribution,
      format_distribution: status.format_distribution,
      signature_moves: status.signature_move_usage,
      diversity_score: status.diversity_score,
    },
  };
}

// ── Public API ──────────────────────────────────────────────────

export interface CatalogResult {
  markdown_path: string;
  json_path: string;
  entry_count: number;
}

/**
 * Generate a catalog from the org ledger.
 * If a season is active, filters to that season's entries.
 * If --all flag, includes everything regardless.
 */
export async function generateCatalog(opts: { all?: boolean } = {}): Promise<CatalogResult> {
  const ledger = await loadLedger();
  const season = await loadSeason();
  const status = await computeStatus();

  // Filter entries
  let filtered: LedgerEntry[];
  if (opts.all || !season) {
    filtered = ledger;
  } else {
    filtered = ledger.filter(e => e.season === season.name);
  }

  const entries = ledgerToEntries(filtered);

  // Output directory
  const orgDir = join(homedir(), '.artifact', 'org');
  await mkdir(orgDir, { recursive: true });

  // Generate markdown
  const md = buildMarkdownCatalog(entries, opts.all ? null : season, status);
  const mdPath = join(orgDir, 'CATALOG.md');
  await writeFile(mdPath, md, 'utf-8');

  // Generate JSON
  const json = buildJsonCatalog(entries, opts.all ? null : season, status);
  const jsonPath = join(orgDir, 'catalog.json');
  await writeFile(jsonPath, JSON.stringify(json, null, 2) + '\n', 'utf-8');

  return {
    markdown_path: mdPath,
    json_path: jsonPath,
    entry_count: entries.length,
  };
}
