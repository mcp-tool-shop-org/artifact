/**
 * Batch Crawl (Phase 17)
 *
 * Curate an entire GitHub org (or repo list) in one command.
 * Runs the fallback driver per repo with rate-aware backoff,
 * progress reporting, and per-repo error isolation.
 *
 * Leverages Phase 16 disk cache — warm repos cost 0 API calls.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { RemoteRepoSource, resolveOutputDir, resolveRepoName } from './source.js';
import type { RemoteSourceOptions } from './source.js';
import { extractTruthBundle } from './truth.js';
import { driveFallback } from './fallback.js';
import { inferProfile, formatProfileForPrompt } from './infer.js';
import * as history from './history.js';
import * as mem from './memory.js';
import * as org from './org.js';
import * as blueprint from './blueprint.js';
import { review } from './review.js';
import { generateCatalog } from './catalog.js';
import type { CatalogFormat } from './catalog.js';
import { publish } from './publish.js';
import type { RepoContext, RepoType, DecisionPacket } from './types.js';

// ── Types ────────────────────────────────────────────────────────

export interface RepoInfo {
  owner: string;
  repo: string;
  fullName: string;
  archived: boolean;
  fork: boolean;
  size: number;
}

export interface CrawlOptions {
  // Which repos
  org?: string;
  fromFile?: string;

  // Behavior
  skipCurated?: boolean;
  dryRun?: boolean;

  // Drive flags
  noCurator?: boolean;
  web?: boolean;
  emitBlueprint?: boolean;
  emitReview?: boolean;
  curateOrg?: boolean;
  format?: CatalogFormat;

  // Rate control
  token?: string;
  minRateRemaining?: number;

  // Publish
  publish?: boolean;
  pagesRepo?: string;
}

export interface CrawlResult {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{ repo: string; error: string }>;
}

// ── GitHub API helpers ──────────────────────────────────────────

function apiHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

/** Parse Link header for next page URL */
function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

// ── Org discovery ───────────────────────────────────────────────

export async function discoverOrgRepos(orgName: string, token?: string): Promise<RepoInfo[]> {
  const repos: RepoInfo[] = [];
  let url: string | null = `https://api.github.com/orgs/${orgName}/repos?type=sources&per_page=100&sort=pushed&direction=desc`;

  while (url) {
    const res = await fetch(url, { headers: apiHeaders(token) });

    if (res.status === 404) {
      throw new Error(`Organization "${orgName}" not found on GitHub.`);
    }
    if (res.status === 403) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      if (remaining === '0') {
        throw new Error(
          'GitHub API rate limit reached during org discovery.'
          + (token ? '' : ' Set GITHUB_TOKEN for 5000 req/hr.'),
        );
      }
      throw new Error('GitHub API forbidden (403). Check your token permissions.');
    }
    if (!res.ok) {
      throw new Error(`GitHub org API error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as Array<{
      name: string;
      full_name: string;
      owner: { login: string };
      archived: boolean;
      fork: boolean;
      size: number;
    }>;

    for (const r of data) {
      repos.push({
        owner: r.owner.login,
        repo: r.name,
        fullName: r.full_name,
        archived: r.archived,
        fork: r.fork,
        size: r.size,
      });
    }

    url = parseNextLink(res.headers.get('link'));
  }

  // Filter out forks and archived
  return repos.filter(r => !r.fork && !r.archived);
}

// ── List file loading ───────────────────────────────────────────

export async function loadRepoList(filePath: string): Promise<string[]> {
  const raw = await readFile(resolve(filePath), 'utf-8');
  return raw.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

// ── Rate-limit checker ──────────────────────────────────────────

interface RateLimitInfo {
  remaining: number;
  reset: Date;
  limit: number;
}

async function checkRateLimit(token?: string): Promise<RateLimitInfo> {
  try {
    const res = await fetch('https://api.github.com/rate_limit', {
      headers: apiHeaders(token),
    });
    if (!res.ok) {
      return { remaining: 999, reset: new Date(), limit: 60 };
    }
    const data = await res.json() as {
      resources: { core: { remaining: number; reset: number; limit: number } };
    };
    return {
      remaining: data.resources.core.remaining,
      reset: new Date(data.resources.core.reset * 1000),
      limit: data.resources.core.limit,
    };
  } catch {
    return { remaining: 999, reset: new Date(), limit: 60 };
  }
}

async function waitForRateLimit(info: RateLimitInfo, minRemaining: number): Promise<boolean> {
  if (info.remaining >= minRemaining) return false;

  const sleepMs = Math.max(0, info.reset.getTime() - Date.now()) + 2000;
  const sleepSec = Math.ceil(sleepMs / 1000);
  console.error(`\nRate limit low (${info.remaining}/${info.limit} remaining). Sleeping ${sleepSec}s until reset...`);
  await new Promise(r => setTimeout(r, sleepMs));
  return true;
}

// ── Per-repo drive ──────────────────────────────────────────────

interface DriveResult {
  atoms: number;
  tier: string;
  format: string;
  apiCalls: string;
}

async function driveRepo(
  owner: string,
  repo: string,
  token: string | undefined,
  opts: {
    curateOrg?: boolean;
    emitBlueprint?: boolean;
    emitReview?: boolean;
  },
): Promise<DriveResult> {
  const source = new RemoteRepoSource(owner, repo, undefined, token);
  const outputDir = resolveOutputDir(source);
  const repoName = resolveRepoName(source);

  // Extract truth
  const truthBundle = await extractTruthBundle(source);

  // Capture cache stats before logging
  const statsLines: string[] = [];
  const origError = console.error;
  console.error = (msg: string) => {
    if (typeof msg === 'string' && msg.startsWith('Remote')) {
      statsLines.push(msg);
    }
  };
  source.logCacheStats();
  console.error = origError;
  const apiCallsLabel = statsLines[0] ?? `${truthBundle.atoms.length} atoms`;

  if (truthBundle.atoms.length === 0) {
    throw new Error('0 truth atoms extracted (repo may be empty)');
  }

  const repoType: RepoType = 'unknown';
  const ctx: RepoContext = {
    repo_name: repoName,
    repo_type: repoType,
    truth_bundle: truthBundle,
  };

  // Inference
  const profile = inferProfile(repoName, repoType, truthBundle);

  // Merge with season weights if org curation
  let effectiveProfile = profile;
  if (opts.curateOrg) {
    const season = await org.loadSeason();
    if (season) {
      const mergedWeights = org.mergeWeightsWithSeason(profile, season);
      effectiveProfile = { ...profile, recommended_tier_weights: mergedWeights };
    }
  }

  // Load history + drive
  const store = await history.load(outputDir, outputDir);
  let packet: DecisionPacket = driveFallback(ctx, store, effectiveProfile);

  // Attach org curation metadata
  if (opts.curateOrg) {
    const curation = await org.buildCurationBrief(repoName);
    packet.season = curation.season?.name ?? 'none';
    packet.org_bans_applied = curation.org_bans.map(b => b.item);
    packet.org_gap_bias = curation.org_gaps;
    packet.signature_move = curation.assigned_move ?? undefined;
  }

  packet.inference_profile = effectiveProfile;

  // Save outputs
  await mkdir(outputDir, { recursive: true });
  await writeFile(resolve(outputDir, 'decision_packet.json'), JSON.stringify(packet, null, 2) + '\n', 'utf-8');
  await writeFile(resolve(outputDir, 'truth_bundle.json'), JSON.stringify(truthBundle, null, 2) + '\n', 'utf-8');
  await writeFile(resolve(outputDir, 'inference.json'), JSON.stringify(effectiveProfile, null, 2) + '\n', 'utf-8');

  // History
  await history.append(outputDir, {
    repo_name: packet.repo_name,
    tier: packet.tier,
    formats: packet.format_candidates,
    constraints: packet.constraints,
    atom_ids_used: packet.selected_hooks.map(h => h.atom_id),
    timestamp: packet.driver_meta.timestamp,
  }, outputDir);

  // Memory
  await mem.writePacket(packet, outputDir, undefined, outputDir);

  // Org ledger
  if (opts.curateOrg) {
    await org.recordDecision(packet);
  }

  // Blueprint
  if (opts.emitBlueprint) {
    await blueprint.generate(outputDir, packet, outputDir);
  }

  // Review (log but don't output to stdout)
  if (opts.emitReview) {
    await review(outputDir, outputDir);
  }

  return {
    atoms: truthBundle.atoms.length,
    tier: packet.tier,
    format: packet.format_candidates[0] ?? 'unknown',
    apiCalls: apiCallsLabel,
  };
}

// ── Main crawl loop ─────────────────────────────────────────────

export async function crawlRepos(opts: CrawlOptions): Promise<CrawlResult> {
  const minRate = opts.minRateRemaining ?? 10;
  const result: CrawlResult = { total: 0, succeeded: 0, failed: 0, skipped: 0, errors: [] };

  // ── Discover repos ──
  let repoSpecs: Array<{ owner: string; repo: string }> = [];

  if (opts.org) {
    console.error(`Discovering repos in ${opts.org}...`);
    const repos = await discoverOrgRepos(opts.org, opts.token);
    repoSpecs = repos.map(r => ({ owner: r.owner, repo: r.repo }));
    console.error(`Found ${repoSpecs.length} repos (excluding forks + archived)\n`);
  } else if (opts.fromFile) {
    const lines = await loadRepoList(opts.fromFile);
    for (const line of lines) {
      const parts = line.split('/');
      if (parts.length === 2 && parts[0] && parts[1]) {
        repoSpecs.push({ owner: parts[0], repo: parts[1] });
      } else {
        console.error(`Skipping invalid entry: "${line}" (expected owner/repo)`);
      }
    }
    console.error(`Loaded ${repoSpecs.length} repos from ${opts.fromFile}\n`);
  } else {
    console.error('Error: specify --org <name> or --from <file>');
    return result;
  }

  result.total = repoSpecs.length;

  // ── Dry run ──
  if (opts.dryRun) {
    console.error('Dry run — repos that would be crawled:\n');
    for (const spec of repoSpecs) {
      const fullName = `${spec.owner}/${spec.repo}`;
      const source = new RemoteRepoSource(spec.owner, spec.repo, undefined, opts.token);
      const outputDir = resolveOutputDir(source);
      const hasCurated = existsSync(resolve(outputDir, 'decision_packet.json'));
      const label = hasCurated ? '(curated)' : '(new)';
      console.error(`  ${fullName} ${label}`);
    }
    console.error(`\n${repoSpecs.length} repos total.`);
    return result;
  }

  // ── Check initial rate limit ──
  const initialRate = await checkRateLimit(opts.token);
  console.error(`Rate limit: ${initialRate.remaining}/${initialRate.limit} remaining\n`);

  // ── Process repos ──
  for (let i = 0; i < repoSpecs.length; i++) {
    const spec = repoSpecs[i];
    const fullName = `${spec.owner}/${spec.repo}`;

    // Skip curated if requested
    if (opts.skipCurated) {
      const source = new RemoteRepoSource(spec.owner, spec.repo, undefined, opts.token);
      const outputDir = resolveOutputDir(source);
      if (existsSync(resolve(outputDir, 'decision_packet.json'))) {
        console.error(`[${i + 1}/${repoSpecs.length}] ${fullName} — skipped (already curated)`);
        result.skipped++;
        continue;
      }
    }

    // Rate-limit check (every 3 repos to avoid wasting a call)
    if (i > 0 && i % 3 === 0) {
      const rateInfo = await checkRateLimit(opts.token);
      await waitForRateLimit(rateInfo, minRate);
    }

    console.error(`[${i + 1}/${repoSpecs.length}] ${fullName}...`);

    try {
      const driveResult = await driveRepo(spec.owner, spec.repo, opts.token, {
        curateOrg: opts.curateOrg,
        emitBlueprint: opts.emitBlueprint,
        emitReview: opts.emitReview,
      });

      console.error(`  ✓ ${driveResult.atoms} atoms, ${driveResult.tier} → ${driveResult.format} (${driveResult.apiCalls})`);
      result.succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${msg}`);
      result.failed++;
      result.errors.push({ repo: fullName, error: msg });
    }
  }

  // ── Generate catalog ──
  console.error('\n--- Catalog ---');
  const catalogFormat: CatalogFormat = opts.format ?? 'md';
  const catalogResult = await generateCatalog({ all: true, format: catalogFormat });
  console.error(`  ${catalogResult.entry_count} entries`);
  console.error(`  ${catalogResult.markdown_path}`);
  if (catalogResult.html_path) {
    console.error(`  ${catalogResult.html_path}`);
  }

  // ── Org health ──
  console.error('\n--- Org Health ---');
  const status = await org.computeStatus();
  console.error(`  Diversity: ${status.diversity_score}/100`);
  if (status.gaps.length > 0) {
    console.error('  Gaps:');
    for (const g of status.gaps) {
      console.error(`    ${g}`);
    }
  }

  // ── Publish ──
  if (opts.publish && opts.pagesRepo) {
    const pubToken = opts.token ?? process.env.GITHUB_TOKEN;
    if (!pubToken) {
      console.error('\n  Publish skipped: GITHUB_TOKEN not set.');
    } else {
      console.error('\n--- Publish ---');
      try {
        const pubResult = await publish({ pagesRepo: opts.pagesRepo, token: pubToken });
        console.error(`  ${pubResult.filesUpdated} files → ${pubResult.pagesUrl}`);
      } catch (err) {
        console.error(`  Publish failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // ── Summary ──
  console.error('\n--- Crawl Complete ---');
  console.error(`  Processed: ${result.total} repos`);
  console.error(`  Succeeded: ${result.succeeded}`);
  if (result.skipped > 0) console.error(`  Skipped:   ${result.skipped}`);
  if (result.failed > 0) {
    console.error(`  Failed:    ${result.failed}`);
    console.error('\n  Errors:');
    for (const e of result.errors) {
      console.error(`    ${e.repo} — ${e.error}`);
    }
  }

  return result;
}
