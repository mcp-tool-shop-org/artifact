/**
 * Web Recommendations Engine (Phase 3.1)
 *
 * Web findings are a SEPARATE input stream — they never become TruthAtoms.
 * TruthAtoms stay deterministic + repo-derived.
 * Web findings inform recommendations only: formats, patterns, trends.
 *
 * Search: DuckDuckGo HTML (no API key, no deps)
 * Cache: .artifact/web/cache.json (TTL default 72h)
 * Synthesis: Ollama turns raw findings into a structured WebBrief
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { OllamaConnection } from './ollama.js';
import { generate } from './ollama.js';
import type {
  Tier, RepoType, WebFinding, WebBrief, WebRecommendation,
  WebCache, WebCacheEntry, WebOptions,
} from './types.js';

// ── Constants ────────────────────────────────────────────────────

const SEARCH_TIMEOUT_MS = 15_000;
const MAX_SNIPPET_CHARS = 300;
const MAX_FINDINGS_PER_QUERY = 5;
const CACHE_DIR = '.artifact/web';
const CACHE_FILE = 'cache.json';
const BRIEF_FILE = 'brief.json';

// ── Query Menu (keyed to tier) ───────────────────────────────────

type QueryTemplate = { template: string; tags: string[] };

const TIER_QUERIES: Record<Tier, QueryTemplate[]> = {
  Exec: [
    { template: 'best practices {artifact_type} documentation security disclosure {year}', tags: ['compliance', 'exec'] },
    { template: 'one-page executive summary developer tool examples {year}', tags: ['format-trend', 'exec'] },
  ],
  Dev: [
    { template: 'developer tool quickstart card examples cheatsheet {year}', tags: ['format-trend', 'dev'] },
    { template: '{repo_type} debug decision tree documentation examples', tags: ['format-trend', 'dev'] },
  ],
  Creator: [
    { template: 'printable developer zine sticker field manual examples {year}', tags: ['format-trend', 'creator'] },
    { template: 'developer tool branding identity presskit examples {year}', tags: ['format-trend', 'creator'] },
  ],
  Fun: [
    { template: 'developer board game card game documentation examples {year}', tags: ['format-trend', 'fun'] },
    { template: 'museum placard field manual style developer docs examples', tags: ['format-trend', 'fun'] },
  ],
  Promotion: [
    { template: 'developer tool launch kit examples Hacker News GitHub {year}', tags: ['promotion', 'launch'] },
    { template: 'shareable formats developer tools GIF one-slide pitch {year}', tags: ['format-trend', 'promotion'] },
  ],
};

// General queries (always included)
const GENERAL_QUERIES: QueryTemplate[] = [
  { template: 'signature artifact unique developer tool documentation trend {year}', tags: ['format-trend', 'general'] },
];

// ── Query Expansion ──────────────────────────────────────────────

function expandTemplate(tmpl: string, vars: Record<string, string>): string {
  let result = tmpl;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), val);
  }
  return result;
}

/** Build the query list for a given tier + repo context */
export function buildQueryMenu(
  tier: Tier,
  repoType: RepoType,
  repoName: string,
): Array<{ query: string; tags: string[] }> {
  const year = new Date().getFullYear().toString();
  const artifactType = tier.toLowerCase();
  const repoTypeLabel = repoType.replace(/^R\d_/, '').replace(/_/g, ' ');
  const vars = { year, artifact_type: artifactType, repo_type: repoTypeLabel, repo_name: repoName };

  const tierTemplates = TIER_QUERIES[tier] ?? [];
  const all = [...tierTemplates, ...GENERAL_QUERIES];

  return all.map(t => ({
    query: expandTemplate(t.template, vars),
    tags: t.tags,
  }));
}

// ── DuckDuckGo HTML Search ───────────────────────────────────────

interface RawResult {
  title: string;
  url: string;
  snippet: string;
}

/** Parse DuckDuckGo HTML results — robust regex extraction */
function parseDDGResults(html: string): RawResult[] {
  const results: RawResult[] = [];

  // DDG HTML results have <a class="result__a"> for titles/links
  // and <a class="result__snippet"> for snippets
  // We'll use a broader pattern to catch result blocks
  const resultBlocks = html.split(/class="result\s/);

  for (const block of resultBlocks.slice(1)) { // skip first (before results)
    // Extract URL from result__a href
    const urlMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/);
    if (!urlMatch) continue;

    let url = urlMatch[1];
    // DDG proxies URLs through redirect — extract actual URL
    const uddgMatch = url.match(/[?&]uddg=([^&]+)/);
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1]);
    }

    // Extract title text
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)/);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract snippet text
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([^<]+)/);
    let snippet = snippetMatch ? snippetMatch[1].trim() : '';

    // Strip HTML tags from snippet
    snippet = snippet.replace(/<[^>]+>/g, '').trim();
    if (snippet.length > MAX_SNIPPET_CHARS) {
      snippet = snippet.slice(0, MAX_SNIPPET_CHARS) + '...';
    }

    if (title && url && url.startsWith('http')) {
      results.push({ title, url, snippet });
    }
  }

  return results.slice(0, MAX_FINDINGS_PER_QUERY);
}

/** Search DuckDuckGo HTML endpoint — no API key needed */
async function searchDDG(query: string, domains?: string[]): Promise<RawResult[]> {
  const q = domains?.length
    ? `${query} ${domains.map(d => `site:${d}`).join(' OR ')}`
    : query;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
    const params = new URLSearchParams({ q });
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'artifact/1.0 (repo-signature-tool)',
      },
      body: params.toString(),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return [];
    const html = await res.text();
    return parseDDGResults(html);
  } catch {
    return [];
  }
}

// ── Finding construction ─────────────────────────────────────────

function findingId(query: string, url: string): string {
  return createHash('sha256')
    .update(`${query}:${url}`)
    .digest('hex')
    .slice(0, 12);
}

function domainFrom(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

function resultToFinding(raw: RawResult, query: string, tags: string[]): WebFinding {
  return {
    id: findingId(query, raw.url),
    query,
    title: raw.title,
    source: { domain: domainFrom(raw.url), url: raw.url },
    published_at: null,
    retrieved_at: new Date().toISOString(),
    snippet: raw.snippet,
    tags,
    confidence: raw.snippet.length > 50 ? 0.7 : 0.4,
  };
}

// ── Cache I/O ────────────────────────────────────────────────────

function queryHash(query: string): string {
  return createHash('sha256').update(query.toLowerCase().trim()).digest('hex').slice(0, 16);
}

function cachePath(repoRoot: string, outputDir?: string): string {
  if (outputDir) return join(outputDir, 'web', CACHE_FILE);
  return join(repoRoot, CACHE_DIR, CACHE_FILE);
}

async function loadCache(repoRoot: string, outputDir?: string): Promise<WebCache> {
  try {
    const raw = await readFile(cachePath(repoRoot, outputDir), 'utf-8');
    const parsed = JSON.parse(raw) as WebCache;
    if (parsed.entries && typeof parsed.entries === 'object') return parsed;
    return { entries: {} };
  } catch {
    return { entries: {} };
  }
}

async function saveCache(repoRoot: string, cache: WebCache, outputDir?: string): Promise<void> {
  const dir = outputDir ? join(outputDir, 'web') : join(repoRoot, CACHE_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(cachePath(repoRoot, outputDir), JSON.stringify(cache, null, 2) + '\n', 'utf-8');
}

function isCacheValid(entry: WebCacheEntry): boolean {
  const age = Date.now() - new Date(entry.retrieved_at).getTime();
  return age < entry.ttl_hours * 3600_000;
}

// ── Collect findings (with caching) ──────────────────────────────

export async function collectFindings(
  queries: Array<{ query: string; tags: string[] }>,
  repoRoot: string,
  opts: WebOptions,
  outputDir?: string,
): Promise<WebFinding[]> {
  const cache = await loadCache(repoRoot, outputDir);
  const allFindings: WebFinding[] = [];
  let cacheHits = 0;

  for (const { query, tags } of queries) {
    const hash = queryHash(query);

    // Check cache (unless --web-refresh)
    if (!opts.refresh && cache.entries[hash] && isCacheValid(cache.entries[hash])) {
      allFindings.push(...cache.entries[hash].findings);
      cacheHits++;
      continue;
    }

    // Search
    const results = await searchDDG(query, opts.domains.length > 0 ? opts.domains : undefined);
    const findings = results.map(r => resultToFinding(r, query, tags));

    // Cache
    cache.entries[hash] = {
      query,
      query_hash: hash,
      findings,
      retrieved_at: new Date().toISOString(),
      ttl_hours: opts.cacheTtlHours,
    };

    allFindings.push(...findings);
  }

  // Save updated cache
  await saveCache(repoRoot, cache, outputDir);

  if (cacheHits > 0) {
    console.error(`Web: ${cacheHits}/${queries.length} queries served from cache`);
  }

  return allFindings;
}

// ── Synthesize WebBrief via Ollama ───────────────────────────────

function buildSynthesisPrompt(findings: WebFinding[], tier: Tier, repoName: string): string {
  const findingsList = findings.map((f, i) =>
    `[${f.id}] "${f.title}" (${f.source.domain})\n  Snippet: ${f.snippet}\n  Tags: ${f.tags.join(', ')}`
  ).join('\n\n');

  return `You are a synthesis engine. Analyze web findings and produce structured recommendations for artifact selection.

CONTEXT:
- Repo: "${repoName}"
- Target tier: ${tier}
- These findings are about FORMAT TRENDS, PATTERNS, and EXAMPLES — NOT about the repo itself.

WEB FINDINGS:
${findingsList}

YOUR JOB:
Produce 2-4 actionable recommendations based on the findings. Each recommendation should:
1. Suggest a format, pattern, or approach that's currently working well
2. Explain WHY NOW (what makes it timely)
3. Specify what it applies to (tier, format family, or constraint)
4. Cite the finding IDs that support it

RESPOND WITH ONLY THIS JSON (no markdown fences, no text outside):
{
  "focus": "one sentence describing what you were looking for",
  "recommendations": [
    {
      "recommendation": "one sentence — what to do",
      "why_now": "one sentence — why it's timely",
      "apply_to": "tier, format family code, or constraint name",
      "citations": ["finding_id_1", "finding_id_2"]
    }
  ]
}`;
}

interface SynthesisResponse {
  focus?: string;
  recommendations?: Array<{
    recommendation?: string;
    why_now?: string;
    apply_to?: string;
    citations?: string[];
  }>;
}

function parseSynthesis(raw: string): SynthesisResponse | null {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as SynthesisResponse;
  } catch {
    return null;
  }
}

function validateRecommendations(
  recs: SynthesisResponse['recommendations'],
  findingIds: Set<string>,
): WebRecommendation[] {
  if (!Array.isArray(recs)) return [];

  return recs
    .filter(r =>
      typeof r?.recommendation === 'string' && r.recommendation.length > 0 &&
      typeof r?.why_now === 'string' &&
      typeof r?.apply_to === 'string')
    .map(r => ({
      recommendation: r!.recommendation!,
      why_now: r!.why_now ?? '',
      apply_to: r!.apply_to ?? '',
      citations: Array.isArray(r!.citations)
        ? r!.citations.filter((c): c is string => typeof c === 'string' && findingIds.has(c))
        : [],
    }))
    .slice(0, 4);
}

/** Synthesize web findings into a WebBrief using Ollama */
export async function synthesizeBrief(
  findings: WebFinding[],
  tier: Tier,
  repoName: string,
  conn: OllamaConnection | null,
): Promise<WebBrief> {
  // No findings → unavailable
  if (findings.length === 0) {
    return {
      focus: 'no web findings available',
      recommendations: [],
      finding_count: 0,
      web_status: 'unavailable',
    };
  }

  // No Ollama → return raw findings summary without synthesis
  if (!conn) {
    return {
      focus: `${findings.length} findings collected but Ollama unavailable for synthesis`,
      recommendations: [],
      finding_count: findings.length,
      web_status: 'partial',
    };
  }

  const prompt = buildSynthesisPrompt(findings, tier, repoName);
  const raw = await generate(conn, prompt);

  if (!raw) {
    return {
      focus: `${findings.length} findings collected but synthesis failed`,
      recommendations: [],
      finding_count: findings.length,
      web_status: 'partial',
    };
  }

  const parsed = parseSynthesis(raw);
  if (!parsed) {
    return {
      focus: `${findings.length} findings collected but synthesis output invalid`,
      recommendations: [],
      finding_count: findings.length,
      web_status: 'partial',
    };
  }

  const findingIds = new Set(findings.map(f => f.id));
  const recs = validateRecommendations(parsed.recommendations, findingIds);

  return {
    focus: typeof parsed.focus === 'string' ? parsed.focus : `web scan for ${tier} tier patterns`,
    recommendations: recs,
    finding_count: findings.length,
    web_status: recs.length > 0 ? 'ok' : 'partial',
  };
}

// ── Save brief to disk ──────────────────────────────────────────

export async function saveBrief(repoRoot: string, brief: WebBrief, outputDir?: string): Promise<void> {
  const dir = outputDir ? join(outputDir, 'web') : join(repoRoot, CACHE_DIR);
  await mkdir(dir, { recursive: true });
  const path = join(dir, BRIEF_FILE);
  await writeFile(path, JSON.stringify(brief, null, 2) + '\n', 'utf-8');
}

// ── Format brief for Curator prompt injection ────────────────────

export function formatWebBrief(brief: WebBrief): string {
  if (brief.web_status === 'unavailable' || brief.recommendations.length === 0) return '';

  const lines: string[] = ['=== WEB BRIEF (external patterns — NOT repo facts) ==='];
  lines.push(`Focus: ${brief.focus}`);
  lines.push(`Status: ${brief.web_status} (${brief.finding_count} findings)`);
  lines.push('');

  for (const rec of brief.recommendations) {
    lines.push(`- ${rec.recommendation}`);
    lines.push(`  Why now: ${rec.why_now}`);
    lines.push(`  Apply to: ${rec.apply_to}`);
    if (rec.citations.length > 0) {
      lines.push(`  Citations: ${rec.citations.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('RULES: Web findings can influence tier/format/constraint ranking.');
  lines.push('Web CANNOT introduce facts about the repo. Any web-backed callout must cite finding IDs.');

  return lines.join('\n');
}
