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
import type { LedgerEntry, OrgStatus, Season, Tier, BuiltStatus } from './types.js';
import { loadLedger, loadSeason, computeStatus } from './org.js';
import { FORMAT_HINTS } from './blueprint.js';
import { loadBuiltStore, builtStatusBadge } from './built.js';

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
  built_status: BuiltStatus | null;
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

function ledgerToEntries(
  ledger: LedgerEntry[],
  builtMap: Record<string, BuiltStatus>,
): CatalogEntry[] {
  return ledger.map(e => ({
    repo_name: e.repo_name,
    tier: e.tier,
    format: e.format_family,
    format_hint: FORMAT_HINTS[e.format_family] ?? e.format_family,
    constraints: e.constraints,
    signature_move: e.signature_move,
    season: e.season,
    timestamp: e.timestamp,
    built_status: builtMap[e.repo_name] ?? null,
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
  lines.push('| Date | Repo | Tier | Format | Move | Built |');
  lines.push('|------|------|------|--------|------|-------|');
  const sorted = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  for (const e of sorted) {
    const move = e.signature_move ?? '';
    const built = e.built_status ? builtStatusBadge(e.built_status).label : '';
    lines.push(`| ${e.timestamp.slice(0, 10)} | ${e.repo_name} | ${e.tier} | ${e.format} | ${move} | ${built} |`);
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

// ── HTML Catalog ─────────────────────────────────────────────────

const TIER_COLORS: Record<Tier, string> = {
  Exec: '#6366f1',   // indigo
  Dev: '#10b981',    // emerald
  Creator: '#f59e0b', // amber
  Fun: '#ec4899',    // pink
  Promotion: '#3b82f6', // blue
};

const MOVE_ICONS: Record<string, string> = {
  stamp_seal: '&#x2713;',      // checkmark
  checksum_box: '&#x25A3;',    // filled square
  margin_notes: '&#x270E;',    // pencil
  catalog_number: '&#x0023;',  // hash
  card_back_pattern: '&#x2736;', // star
  fold_marks: '&#x2702;',      // scissors
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildHtmlCatalog(
  entries: CatalogEntry[],
  season: Season | null,
  status: OrgStatus,
): string {
  const title = season ? `${season.name} — Artifact Catalog` : 'Artifact Catalog';
  const subtitle = season ? season.notes : 'All decisions across the org';

  // Unique values for filters
  const allTiers = [...new Set(entries.map(e => e.tier))];
  const allSeasons = [...new Set(entries.map(e => e.season))].filter(s => s !== 'none');
  const allMoves = [...new Set(entries.map(e => e.signature_move).filter(Boolean))] as string[];
  const allFormats = [...new Set(entries.map(e => e.format))];
  const allBuiltStatuses = [...new Set(entries.map(e => e.built_status).filter(Boolean))] as BuiltStatus[];

  // Sort reverse chronological
  const sorted = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Build cards HTML
  const cardsHtml = sorted.map(e => {
    const color = TIER_COLORS[e.tier] || '#888';
    const moveIcon = e.signature_move ? (MOVE_ICONS[e.signature_move] ?? '') : '';
    const moveLabel = e.signature_move ?? '';
    const constraintTags = e.constraints.map(c =>
      `<span class="tag constraint">${escapeHtml(c)}</span>`
    ).join('');
    const seasonTag = e.season !== 'none'
      ? `<span class="tag season">${escapeHtml(e.season)}</span>`
      : '';

    const builtBadgeHtml = e.built_status
      ? (() => { const b = builtStatusBadge(e.built_status); return `<span class="built-badge" style="background:${b.color}">${b.icon} ${b.label}</span>`; })()
      : '';

    return `<div class="card" data-tier="${e.tier}" data-season="${escapeHtml(e.season)}" data-format="${escapeHtml(e.format)}" data-move="${escapeHtml(moveLabel)}" data-built="${e.built_status ?? ''}">
  <div class="card-header">
    <span class="tier-badge" style="background:${color}">${TIER_LABELS[e.tier]}</span>${builtBadgeHtml}
    <span class="date">${e.timestamp.slice(0, 10)}</span>
  </div>
  <h3 class="repo-name">${escapeHtml(e.repo_name)}</h3>
  <div class="format">${escapeHtml(e.format)}</div>
  <div class="hint">${escapeHtml(e.format_hint)}</div>
  <div class="card-footer">
    <div class="tags">${constraintTags}${seasonTag}</div>
    <div class="move" title="${escapeHtml(moveLabel)}">${moveIcon} ${escapeHtml(moveLabel)}</div>
  </div>
</div>`;
  }).join('\n');

  // Stats bar
  const tierStats = allTiers.map(t => {
    const count = status.tier_distribution[t] ?? 0;
    const pct = entries.length > 0 ? Math.round((count / entries.length) * 100) : 0;
    const color = TIER_COLORS[t] || '#888';
    return `<div class="stat"><span class="stat-bar" style="background:${color};width:${Math.max(pct, 5)}%"></span><span class="stat-label">${TIER_LABELS[t]} ${count} (${pct}%)</span></div>`;
  }).join('\n');

  // Filter buttons
  const tierFilters = allTiers.map(t =>
    `<button class="filter-btn" data-filter="tier" data-value="${t}" style="border-color:${TIER_COLORS[t]}">${TIER_LABELS[t]}</button>`
  ).join('');

  const moveFilters = allMoves.map(m =>
    `<button class="filter-btn" data-filter="move" data-value="${escapeHtml(m)}">${MOVE_ICONS[m] ?? ''} ${escapeHtml(m)}</button>`
  ).join('');

  const seasonFilters = allSeasons.map(s =>
    `<button class="filter-btn" data-filter="season" data-value="${escapeHtml(s)}">${escapeHtml(s)}</button>`
  ).join('');

  const builtFilters = allBuiltStatuses.map(s => {
    const b = builtStatusBadge(s);
    return `<button class="filter-btn" data-filter="built" data-value="${s}" style="border-color:${b.color}">${b.icon} ${b.label}</button>`;
  }).join('');

  // Bans
  const bansHtml = status.recent_bans.length > 0
    ? `<div class="bans">${status.recent_bans.map(b => `<span class="ban">${escapeHtml(b.split(':')[0])}</span>`).join(' ')}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;color:#c9d1d9;min-height:100vh}
.container{max-width:1200px;margin:0 auto;padding:2rem 1.5rem}
header{text-align:center;margin-bottom:2.5rem}
h1{font-size:2rem;color:#f0f6fc;margin-bottom:.5rem;letter-spacing:-.02em}
.subtitle{color:#8b949e;font-size:1.1rem;margin-bottom:.25rem}
.meta{color:#484f58;font-size:.85rem}
.stats{display:flex;flex-direction:column;gap:.4rem;margin:1.5rem 0;max-width:400px;margin-left:auto;margin-right:auto}
.stat{display:flex;align-items:center;gap:.5rem;height:1.5rem}
.stat-bar{height:100%;border-radius:3px;min-width:4px}
.stat-label{font-size:.8rem;color:#8b949e;white-space:nowrap}
.filters{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center;margin:1.5rem 0}
.filter-group{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center}
.filter-group-label{font-size:.7rem;text-transform:uppercase;color:#484f58;letter-spacing:.05em;margin-right:.25rem}
.filter-btn{background:transparent;color:#8b949e;border:1px solid #30363d;border-radius:2rem;padding:.25rem .75rem;font-size:.8rem;cursor:pointer;transition:all .15s}
.filter-btn:hover{color:#f0f6fc;border-color:#58a6ff}
.filter-btn.active{background:#1f6feb;color:#f0f6fc;border-color:#1f6feb}
.reset-btn{background:transparent;color:#484f58;border:1px solid #21262d;border-radius:2rem;padding:.25rem .75rem;font-size:.75rem;cursor:pointer}
.reset-btn:hover{color:#f85149;border-color:#f85149}
.bans{text-align:center;margin:.75rem 0}
.ban{display:inline-block;font-size:.75rem;color:#f85149;text-decoration:line-through;margin:0 .35rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem;margin-top:1.5rem}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.25rem;transition:all .2s;position:relative}
.card:hover{border-color:#58a6ff;transform:translateY(-2px)}
.card.hidden{display:none}
.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem}
.tier-badge{font-size:.7rem;font-weight:600;color:#f0f6fc;padding:.15rem .5rem;border-radius:2rem;text-transform:uppercase;letter-spacing:.04em}
.built-badge{font-size:.6rem;font-weight:600;color:#f0f6fc;padding:.1rem .4rem;border-radius:2rem;margin-left:.35rem;letter-spacing:.03em}
.date{font-size:.75rem;color:#484f58}
.repo-name{font-size:1.15rem;color:#f0f6fc;margin-bottom:.35rem;font-weight:600}
.format{font-size:.85rem;color:#58a6ff;font-family:'SF Mono',Consolas,monospace;margin-bottom:.35rem}
.hint{font-size:.8rem;color:#8b949e;line-height:1.4;margin-bottom:.75rem}
.card-footer{display:flex;justify-content:space-between;align-items:flex-end}
.tags{display:flex;flex-wrap:wrap;gap:.25rem}
.tag{font-size:.65rem;padding:.1rem .4rem;border-radius:3px;border:1px solid #30363d;color:#8b949e}
.tag.season{border-color:#3fb950;color:#3fb950}
.move{font-size:.8rem;color:#484f58;white-space:nowrap}
.count-label{text-align:center;color:#484f58;font-size:.8rem;margin-top:1rem}
footer{text-align:center;margin-top:3rem;padding:1.5rem 0;border-top:1px solid #21262d;color:#484f58;font-size:.75rem}
@media(max-width:640px){.grid{grid-template-columns:1fr}.container{padding:1rem}}
</style>
</head>
<body>
<div class="container">
<header>
  <h1>${escapeHtml(title)}</h1>
  <div class="subtitle">${escapeHtml(subtitle)}</div>
  <div class="meta">${entries.length} artifacts &middot; diversity ${status.diversity_score}/100</div>
</header>

<div class="stats">
${tierStats}
</div>

${bansHtml}

<div class="filters">
  <div class="filter-group">
    <span class="filter-group-label">Tier</span>
    ${tierFilters}
  </div>
  <div class="filter-group">
    <span class="filter-group-label">Move</span>
    ${moveFilters}
  </div>
${allSeasons.length > 0 ? `  <div class="filter-group">
    <span class="filter-group-label">Season</span>
    ${seasonFilters}
  </div>` : ''}
${allBuiltStatuses.length > 0 ? `  <div class="filter-group">
    <span class="filter-group-label">Built</span>
    ${builtFilters}
  </div>` : ''}
  <button class="reset-btn" onclick="resetFilters()">Reset</button>
</div>

<div class="grid" id="grid">
${cardsHtml}
</div>
<div class="count-label" id="count"></div>
</div>

<footer>
  Generated ${new Date().toISOString().slice(0, 19)} &middot; Artifact by MCP Tool Shop
</footer>

<script>
(function(){
  const cards=document.querySelectorAll('.card');
  const btns=document.querySelectorAll('.filter-btn');
  const countEl=document.getElementById('count');
  const active={};
  function update(){
    let shown=0;
    cards.forEach(c=>{
      let vis=true;
      for(const[k,v]of Object.entries(active)){
        if(v&&c.dataset[k]!==v)vis=false;
      }
      c.classList.toggle('hidden',!vis);
      if(vis)shown++;
    });
    countEl.textContent=shown<cards.length?shown+' of '+cards.length+' shown':'';
  }
  btns.forEach(b=>{
    b.addEventListener('click',()=>{
      const f=b.dataset.filter,v=b.dataset.value;
      if(active[f]===v){delete active[f];b.classList.remove('active');}
      else{
        btns.forEach(x=>{if(x.dataset.filter===f)x.classList.remove('active');});
        active[f]=v;b.classList.add('active');
      }
      update();
    });
  });
  window.resetFilters=function(){
    for(const k in active)delete active[k];
    btns.forEach(b=>b.classList.remove('active'));
    update();
  };
})();
</script>
</body>
</html>`;
}

// ── Public API ──────────────────────────────────────────────────

export type CatalogFormat = 'md' | 'html';

export interface CatalogResult {
  markdown_path: string;
  json_path: string;
  html_path?: string;
  entry_count: number;
}

/**
 * Generate a catalog from the org ledger.
 * If a season is active, filters to that season's entries.
 * If --all flag, includes everything regardless.
 */
export async function generateCatalog(opts: { all?: boolean; format?: CatalogFormat } = {}): Promise<CatalogResult> {
  const ledger = await loadLedger();
  const season = await loadSeason();
  const status = await computeStatus();
  const builtStore = await loadBuiltStore();

  // Build a map of repo → built status for quick lookup
  const builtMap: Record<string, BuiltStatus> = {};
  for (const [name, record] of Object.entries(builtStore.repos)) {
    builtMap[name] = record.built_status;
  }

  // Filter entries
  let filtered: LedgerEntry[];
  if (opts.all || !season) {
    filtered = ledger;
  } else {
    filtered = ledger.filter(e => e.season === season.name);
  }

  const entries = ledgerToEntries(filtered, builtMap);

  // Output directory
  const orgDir = join(homedir(), '.artifact', 'org');
  await mkdir(orgDir, { recursive: true });

  // Generate markdown (always)
  const md = buildMarkdownCatalog(entries, opts.all ? null : season, status);
  const mdPath = join(orgDir, 'CATALOG.md');
  await writeFile(mdPath, md, 'utf-8');

  // Generate JSON (always)
  const json = buildJsonCatalog(entries, opts.all ? null : season, status);
  const jsonPath = join(orgDir, 'catalog.json');
  await writeFile(jsonPath, JSON.stringify(json, null, 2) + '\n', 'utf-8');

  const result: CatalogResult = {
    markdown_path: mdPath,
    json_path: jsonPath,
    entry_count: entries.length,
  };

  // Generate HTML (if requested)
  if (opts.format === 'html') {
    const html = buildHtmlCatalog(entries, opts.all ? null : season, status);
    const htmlPath = join(orgDir, 'CATALOG.html');
    await writeFile(htmlPath, html, 'utf-8');
    result.html_path = htmlPath;
  }

  return result;
}

// ── Publish bundle ──────────────────────────────────────────────

export interface PublishBundle {
  dir: string;        // ~/.artifact/org/publish/
  files: string[];    // filenames in dir
}

/**
 * Generate a self-contained publish directory at ~/.artifact/org/publish/.
 * Contains index.html + catalog.json + status.json — ready for deployment.
 */
export async function generatePublishBundle(): Promise<PublishBundle> {
  // Ensure catalog + HTML exist
  await generateCatalog({ all: true, format: 'html' });

  const orgDir = join(homedir(), '.artifact', 'org');
  const publishDir = join(orgDir, 'publish');
  await mkdir(publishDir, { recursive: true });

  // index.html from CATALOG.html
  const html = await readFile(join(orgDir, 'CATALOG.html'), 'utf-8');
  await writeFile(join(publishDir, 'index.html'), html, 'utf-8');

  // catalog.json (copy)
  const catalog = await readFile(join(orgDir, 'catalog.json'), 'utf-8');
  await writeFile(join(publishDir, 'catalog.json'), catalog, 'utf-8');

  // status.json from org status
  const status = await computeStatus();
  await writeFile(join(publishDir, 'status.json'), JSON.stringify(status, null, 2) + '\n', 'utf-8');

  return {
    dir: publishDir,
    files: ['index.html', 'catalog.json', 'status.json'],
  };
}
