#!/usr/bin/env node

/**
 * artifact — repo signature artifact decision system
 *
 * Commands:
 *   doctor                      Environment health check
 *   init                        First-run onboarding
 *   about                       Version + persona + core rules
 *   drive [repo-path]           Run the Curator freshness driver
 *   infer [repo-path]           Compute inference profile (no Ollama)
 *   blueprint [repo-path]       Generate Blueprint Pack from latest decision
 *   buildpack [repo-path]       Emit builder prompt packet for chat LLMs
 *   verify [repo-path]          Lint artifact against blueprint + truth bundle
 *   review [repo-path]          Print a 4-block editorial review card
 *   catalog [--all]             Generate season catalog
 *   built add|ls|status         Built artifact tracking
 *   memory show [--org]         Show memory entries
 *   memory forget <repo-name>   Forget a repo's memory
 *   memory prune <days>         Prune old entries
 *   memory stats                Memory statistics
 *   season list|set|status|end  Manage curation seasons
 *   org status|ledger|bans      Org-wide curation info
 */

import { resolve, basename, dirname } from 'node:path';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { connect } from './ollama.js';
import { drive as curatorDrive } from './curator.js';
import { driveFallback } from './fallback.js';
import { extractTruthBundle } from './truth.js';
import * as history from './history.js';
import * as mem from './memory.js';
import { buildQueryMenu, collectFindings, synthesizeBrief, saveBrief, formatWebBrief } from './web.js';
import * as org from './org.js';
import * as blueprint from './blueprint.js';
import { review } from './review.js';
import { generateCatalog } from './catalog.js';
import type { CatalogFormat } from './catalog.js';
import { buildpack } from './buildpack.js';
import { verifyArtifact, formatVerifyResult } from './verify.js';
import { loadBuiltStore, addArtifactPaths, getBuiltRecord, getToolVersion, listBuiltRecords, formatBuiltRecord, formatBuiltList } from './built.js';
import { inferProfile, formatProfileForPrompt, formatProfileForDisplay } from './infer.js';
import { getPersona, getPersonaByName, loadConfig, saveConfig, formatWhoami, formatPersonaCard, formatAbout, PERSONA_NAMES } from './persona.js';
import { LocalRepoSource, RemoteRepoSource, resolveOutputDir, resolveRepoName } from './source.js';
import type { RepoSource } from './source.js';
import type { RepoContext, RepoType, DecisionPacket, WebOptions, InferenceProfile } from './types.js';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function getVersion(): Promise<string> {
  try {
    const raw = await readFile(resolve(__dirname, '..', 'package.json'), 'utf-8');
    return JSON.parse(raw).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function usage(): never {
  console.error(`Usage: artifact <command> [options]

Commands:
  doctor                      Environment health check.
  init                        First-run onboarding (creates config).
  about                       Version, persona, and core rules.
  drive [repo-path]           Run the Curator freshness driver.
  infer [repo-path]           Compute inference profile (no Ollama).
  ritual [repo-path]          Full ritual: drive + blueprint + review + catalog.
  blueprint [repo-path]       Generate Blueprint Pack from latest decision.
  buildpack [repo-path]       Emit builder prompt packet for chat LLMs (--json for JSON).
  verify [repo-path]          Lint artifact against blueprint + truth bundle.
  review [repo-path]          Print a 4-block editorial review card (--json for JSON).
  catalog [--all] [--format]  Generate catalog (md or html).
  memory show [--org]         Show repo memory (or --org for org-level).
  memory forget <repo-name>   Forget all memory for a repo.
  memory prune <days>         Prune entries older than N days.
  memory stats                Show memory statistics.
  season list                 List available seasons.
  season set <name>           Activate a season.
  season status               Show active season rules.
  season end                  End the current season.
  whoami                      Print active persona name + motto.
  config get <key>            Read a config value.
  config set <key> <value>    Set a config value (e.g., agent_name).
  org status                  Coverage, diversity, gaps.
  org ledger [n]              Last N decisions (default: 10).
  org bans                    Current auto-bans with reasons.
  built add <repo> <path...>  Attach artifact file paths to tracking.
  built ls [repo-name]        List built status (all or one repo).
  built status <repo-name>    Detailed tracking for one repo.

Drive options:
  --no-curator         Skip Ollama, use deterministic fallback only.
  --curator-speak      Print Curator callouts (veto/twist/pick/risk).
  --explain            Print inference profile (why this tier was chosen).
  --blueprint          Also generate Blueprint Pack after drive.
  --review             Also print review card after drive.
  --type <type>        Repo type (R1_tooling_cli, etc.). Default: unknown.
  --web                Enable web recommendations.
  --web-cache-ttl <h>  Cache TTL in hours (default: 72).
  --web-domains <csv>  Comma-separated domain allowlist.
  --web-refresh        Bypass cache, re-fetch all queries.
  --curate-org         Enable org-wide curation (season + bans + gaps).
  --help               Show this help.

Infer options:
  --type <type>        Repo type (R1_tooling_cli, etc.). Default: auto-detect.
  --json               Output as JSON instead of human-readable text.

Catalog options:
  --all                Include all entries (ignore active season filter).
  --format <md|html>   Output format (default: md). html = gallery view.

Buildpack options:
  --json               Output as JSON instead of text prompt.

Verify options:
  --artifact <path>    Path to the artifact file to lint (required).
  --record             Write result to built artifact tracking store.

Ritual options:
  Runs drive --curate-org --web --blueprint --review, then updates catalog.
  Accepts all drive options plus --format for catalog output.

Remote options (for drive, infer, ritual, blueprint, review, buildpack, verify, built):
  --remote <owner/repo>  Analyze a GitHub repo without a local clone.
  --ref <branch|tag|sha> Git ref for remote repos (default: default branch).
  --remote-refresh       Bypass remote cache, re-fetch all API data.

Environment:
  GITHUB_TOKEN           GitHub PAT for higher rate limits (5000/hr vs 60/hr).

Global:
  --version                  Print version and exit.
  --help                     Show this help.`);
  return process.exit(1) as never;
}

// ── Infer command ───────────────────────────────────────────────

async function cmdInfer(args: string[]): Promise<void> {
  const jsonMode = args.includes('--json');
  const repoType: RepoType = (flagValue(args, '--type') as RepoType) ?? 'unknown';
  const { source, outputDir, repoName } = buildSource(args);

  // Extract truth atoms
  const truthBundle = await extractTruthBundle(source);
  if (source instanceof RemoteRepoSource) source.logCacheStats();
  console.error(`Truth: ${truthBundle.atoms.length} atoms from ${truthBundle.stats.scanned_files} files`);

  const profile = inferProfile(repoName, repoType, truthBundle);

  // Save to outputDir/inference.json
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    resolve(outputDir, 'inference.json'),
    JSON.stringify(profile, null, 2) + '\n',
    'utf-8',
  );

  if (jsonMode) {
    console.log(JSON.stringify(profile, null, 2));
  } else {
    console.log(formatProfileForDisplay(profile));
  }
}

// ── Drive command ───────────────────────────────────────────────

/** Parse a flag value: --flag <value> */
function flagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
}

/** Collect indices of flags that consume the next arg */
function flagValueIndices(args: string[], flags: string[]): Set<number> {
  const indices = new Set<number>();
  for (const flag of flags) {
    const idx = args.indexOf(flag);
    if (idx !== -1) indices.add(idx + 1);
  }
  return indices;
}

// ── Source builder ───────────────────────────────────────────────

interface SourceContext {
  source: RepoSource;
  outputDir: string;
  repoPath: string;  // local: actual path, remote: outputDir
  repoName: string;
}

const REMOTE_VALUE_FLAGS = ['--remote', '--ref'];

function buildSource(args: string[]): SourceContext {
  const remoteSpec = flagValue(args, '--remote');
  const ref = flagValue(args, '--ref');

  if (remoteSpec) {
    const parts = remoteSpec.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      console.error('Error: --remote must be in "owner/repo" format (e.g., --remote mcp-tool-shop-org/artifact)');
      process.exit(1);
    }
    const [owner, repo] = parts;
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.error('Warning: GITHUB_TOKEN not set. Rate limit: 60 req/hr. Private repos will fail.');
    }
    const refresh = args.includes('--remote-refresh');
    const source = new RemoteRepoSource(owner, repo, ref, token, { refresh });
    const outputDir = resolveOutputDir(source);
    const repoName = resolveRepoName(source);
    return { source, outputDir, repoPath: outputDir, repoName };
  }

  // Local mode
  const allValueFlags = ['--type', '--web-cache-ttl', '--web-domains', '--artifact', ...REMOTE_VALUE_FLAGS];
  const valueIndices = flagValueIndices(args, allValueFlags);
  const positional = args.filter((a: string, i: number) =>
    !a.startsWith('--') && !valueIndices.has(i));
  const repoPath = resolve(positional[0] ?? '.');
  const source = new LocalRepoSource(repoPath);
  const outputDir = resolveOutputDir(source, repoPath);
  const repoName = resolveRepoName(source);
  return { source, outputDir, repoPath, repoName };
}

// ── Drive command ───────────────────────────────────────────────

async function cmdDrive(args: string[]): Promise<void> {
  const noCurator = args.includes('--no-curator');
  const curatorSpeak = args.includes('--curator-speak');
  const explain = args.includes('--explain');
  const emitBlueprint = args.includes('--blueprint');
  const emitReview = args.includes('--review');
  const curateOrg = args.includes('--curate-org');
  const repoType: RepoType = (flagValue(args, '--type') as RepoType) ?? 'unknown';

  // Web options
  const webEnabled = args.includes('--web');
  const webRefresh = args.includes('--web-refresh');
  const webTtlRaw = flagValue(args, '--web-cache-ttl');
  const webDomainsRaw = flagValue(args, '--web-domains');
  const webOpts: WebOptions = {
    enabled: webEnabled,
    cacheTtlHours: webTtlRaw ? parseInt(webTtlRaw, 10) || 72 : 72,
    domains: webDomainsRaw ? webDomainsRaw.split(',').map(d => d.trim()).filter(Boolean) : [],
    refresh: webRefresh,
  };

  // Resolve source (local or remote)
  const { source, outputDir, repoPath, repoName } = buildSource(args);

  // Extract truth atoms
  const truthBundle = await extractTruthBundle(source);
  if (source instanceof RemoteRepoSource) source.logCacheStats();
  const typeStats = Object.entries(truthBundle.stats.atoms_by_type).map(([t, n]) => `${t}:${n}`).join(', ');
  console.error(`Truth: ${truthBundle.atoms.length} atoms from ${truthBundle.stats.scanned_files} files (${typeStats})`);

  const ctx: RepoContext = {
    repo_name: repoName,
    repo_type: repoType,
    truth_bundle: truthBundle,
  };

  // Load history
  const store = await history.load(repoPath, outputDir);

  // Compute inference profile (always runs, no Ollama)
  const profile = inferProfile(repoName, repoType, truthBundle);
  const profilePromptText = formatProfileForPrompt(profile);
  console.error(`Inference: archetype=${profile.repo_archetype}, bottleneck=${profile.primary_bottleneck}, evidence=${(profile.evidence_strength * 100).toFixed(0)}%`);

  // Merge with season weights if org curation is active
  let effectiveProfile = profile;
  if (curateOrg) {
    const season = await org.loadSeason();
    if (season) {
      const mergedWeights = org.mergeWeightsWithSeason(profile, season);
      effectiveProfile = { ...profile, recommended_tier_weights: mergedWeights };
      console.error(`Inference: weights merged with season "${season.name}"`);
    }
  }

  // Print explain if requested
  if (explain) {
    console.error('');
    console.error(formatProfileForDisplay(effectiveProfile));
    console.error('');
  }

  // Save inference profile
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    resolve(outputDir, 'inference.json'),
    JSON.stringify(effectiveProfile, null, 2) + '\n',
    'utf-8',
  );

  let packet: DecisionPacket;
  let ollamaHost: string | undefined;

  if (noCurator) {
    console.error('Curator: skipped (--no-curator)');
    if (webOpts.enabled) {
      console.error('Web: --web requires Ollama for synthesis. Skipped (use without --no-curator).');
    }
    packet = driveFallback(ctx, store, effectiveProfile);
    // Attach org curation metadata even in fallback mode
    if (curateOrg) {
      const curation = await org.buildCurationBrief(repoName);
      const seasonLabel = curation.season?.name ?? 'none';
      console.error(`Org: season="${seasonLabel}", ${curation.org_bans.length} bans, ${curation.org_gaps.length} gaps, move=${curation.assigned_move ?? 'none'}`);
      packet.season = curation.season?.name ?? 'none';
      packet.org_bans_applied = curation.org_bans.map(b => b.item);
      packet.org_gap_bias = curation.org_gaps;
      packet.signature_move = curation.assigned_move ?? undefined;
    }
  } else {
    const conn = await connect();
    if (conn) {
      ollamaHost = conn.host;
      console.error(`Curator: online (model=${conn.model})`);

      // Build memory brief
      const query = `${repoName} ${repoType} artifact decision`;
      const brief = await mem.buildMemoryBrief(repoPath, repoName, query, conn.host, outputDir);
      if (brief.formatted) {
        const total = brief.repo_entries.length + brief.org_entries.length;
        console.error(`Memory: ${total} relevant entries loaded (${brief.repo_entries.length} repo, ${brief.org_entries.length} org)`);
      }

      // Build web brief (if --web enabled)
      let webBriefText: string | undefined;
      if (webOpts.enabled) {
        console.error('Web: collecting findings...');
        const tier = history.recentTiers(store)[0] ?? 'Promotion'; // hint tier for query menu
        const queries = buildQueryMenu(tier, repoType, repoName);
        console.error(`Web: ${queries.length} queries queued`);

        const findings = await collectFindings(queries, repoPath, webOpts, outputDir);
        console.error(`Web: ${findings.length} findings collected`);

        const webBrief = await synthesizeBrief(findings, tier, repoName, conn);
        console.error(`Web: brief synthesized (${webBrief.web_status}, ${webBrief.recommendations.length} recommendations)`);

        await saveBrief(repoPath, webBrief, outputDir);
        webBriefText = formatWebBrief(webBrief);
      }

      // Build curation brief (if --curate-org enabled)
      let curationBriefText: string | undefined;
      let promotionMandate = false;
      if (curateOrg) {
        const curation = await org.buildCurationBrief(repoName);
        const seasonLabel = curation.season?.name ?? 'none';
        promotionMandate = curation.promotion_mandate;
        const mandateLabel = promotionMandate ? ', PROMOTION MANDATE' : '';
        console.error(`Org: season="${seasonLabel}", ${curation.org_bans.length} bans, ${curation.org_gaps.length} gaps, move=${curation.assigned_move ?? 'none'}${mandateLabel}`);
        curationBriefText = curation.formatted;
      }

      const result = await curatorDrive(conn, ctx, store, brief.formatted || undefined, webBriefText, curationBriefText, promotionMandate, profilePromptText);
      if (result) {
        packet = result;
        // Attach org curation metadata to packet
        if (curateOrg) {
          const curation = await org.buildCurationBrief(repoName);
          packet.season = curation.season?.name ?? 'none';
          packet.org_bans_applied = curation.org_bans.map(b => b.item);
          packet.org_gap_bias = curation.org_gaps;
          packet.signature_move = curation.assigned_move ?? undefined;
          if (!packet.promotion_mandate) packet.promotion_mandate = curation.promotion_mandate || undefined;
        }
        // Log promotion mandate result and track attempts
        if (promotionMandate) {
          if (packet.tier === 'Promotion') {
            console.error('Promotion: mandate fulfilled — Promotion tier selected');
            await org.recordMandateSuccess();
          } else if (packet.promotion_rejection) {
            console.error(`Promotion: mandate rejected (${packet.promotion_rejection})`);
            await org.recordMandateRejection(packet.promotion_rejection);
          } else {
            console.error('Promotion: mandate overrode Curator choice → Promotion tier');
            await org.recordMandateSuccess();
          }
        }
      } else {
        console.error('Curator: Ollama responded but output was invalid. Falling back.');
        packet = driveFallback(ctx, store, effectiveProfile);
      }
    } else {
      console.error('Curator: Ollama not available. Using fallback driver.');
      packet = driveFallback(ctx, store, effectiveProfile);
    }
  }

  // Print callouts if requested (prefixed with persona name)
  if (curatorSpeak) {
    const persona = await getPersona();
    const c = packet.callouts;
    console.error('');
    console.error(`${persona.name} says:`);
    if (c.veto) console.error(`  Veto:  ${c.veto}`);
    if (c.twist) console.error(`  Twist: ${c.twist}`);
    if (c.pick) console.error(`  Pick:  ${c.pick}`);
    if (c.risk) console.error(`  Risk:  ${c.risk}`);
    console.error('');
  }

  // Attach inference profile to packet
  packet.inference_profile = effectiveProfile;

  // Write decision packet + truth bundle
  await mkdir(outputDir, { recursive: true });
  const outPath = resolve(outputDir, 'decision_packet.json');
  await writeFile(outPath, JSON.stringify(packet, null, 2) + '\n', 'utf-8');
  const bundlePath = resolve(outputDir, 'truth_bundle.json');
  await writeFile(bundlePath, JSON.stringify(truthBundle, null, 2) + '\n', 'utf-8');

  // Append to rotation history
  await history.append(repoPath, {
    repo_name: packet.repo_name,
    tier: packet.tier,
    formats: packet.format_candidates,
    constraints: packet.constraints,
    atom_ids_used: packet.selected_hooks.map(h => h.atom_id),
    timestamp: packet.driver_meta.timestamp,
  }, outputDir);

  // Write to persistent memory (org + repo)
  await mem.writePacket(packet, repoPath, ollamaHost, outputDir);
  console.error('Memory: decision saved to repo + org stores');

  // Record to org ledger (if --curate-org)
  if (curateOrg) {
    await org.recordDecision(packet);
    console.error('Org: ledger entry recorded, status recomputed');
  }

  // Generate Blueprint Pack if requested
  if (emitBlueprint) {
    const result = await blueprint.generate(repoPath, packet, outputDir);
    if (result) {
      console.error(`Blueprint: ${result.markdown_path}`);
      console.error(`Blueprint: ${result.json_path}`);
      console.error(`Blueprint: ${result.assets_path}/`);
      if (result.missing_inputs.length > 0) {
        console.error(`Blueprint: ${result.missing_inputs.length} missing input(s) detected`);
        for (const m of result.missing_inputs) {
          console.error(`  ! ${m.what}`);
        }
      } else {
        console.error('Blueprint: all quality gates passed');
      }
    }
  }

  // Print review card if requested
  if (emitReview) {
    const card = await review(repoPath, outputDir);
    if (card) {
      console.error('');
      console.error(card.text);
    }
  }

  // Output the packet to stdout
  console.log(JSON.stringify(packet, null, 2));
}

// ── Memory commands ─────────────────────────────────────────────

async function cmdMemoryShow(args: string[]): Promise<void> {
  const isOrg = args.includes('--org');
  const entries = await mem.show(isOrg ? undefined : resolve('.'));

  if (entries.length === 0) {
    console.log(isOrg ? 'No org memory entries.' : 'No repo memory entries.');
    return;
  }

  for (const e of entries) {
    const repo = e.repo_name ? ` [${e.repo_name}]` : '';
    console.log(`${e.created_at.slice(0, 19)}${repo} (${e.type}) ${e.content.slice(0, 120)}`);
  }
  console.log(`\n${entries.length} entries total.`);
}

async function cmdMemoryForget(args: string[]): Promise<void> {
  const repoName = args[0];
  if (!repoName) {
    console.error('Usage: artifact memory forget <repo-name>');
    process.exit(1);
  }
  const removed = await mem.forget(repoName, resolve('.'));
  console.log(`Forgot ${removed} entries for "${repoName}".`);
}

async function cmdMemoryPrune(args: string[]): Promise<void> {
  const days = parseInt(args[0] ?? '90', 10);
  if (isNaN(days) || days < 1) {
    console.error('Usage: artifact memory prune <days>');
    process.exit(1);
  }
  const removed = await mem.prune(days, resolve('.'));
  console.log(`Pruned ${removed} entries older than ${days} days.`);
}

async function cmdMemoryStats(): Promise<void> {
  const s = await mem.stats(resolve('.'));
  console.log(`Org entries:  ${s.org_count}`);
  console.log(`Repo entries: ${s.repo_count}`);
  console.log(`Repos seen:   ${s.repos_seen.length > 0 ? s.repos_seen.join(', ') : 'none'}`);
  console.log(`Oldest:       ${s.oldest ?? 'n/a'}`);
  console.log(`Newest:       ${s.newest ?? 'n/a'}`);
}

// ── Season commands ──────────────────────────────────────────────

async function cmdSeasonList(): Promise<void> {
  const seasons = org.listSeasons();
  const active = await org.loadSeason();
  for (const s of seasons) {
    const marker = active?.name === s.name ? ' ← ACTIVE' : '';
    console.log(`  ${s.key.padEnd(16)} ${s.name}${marker}`);
    console.log(`${''.padEnd(18)} ${s.notes}`);
  }
}

async function cmdSeasonSet(args: string[]): Promise<void> {
  const key = args[0];
  if (!key) {
    console.error('Usage: artifact season set <name>');
    console.error(`Available: ${org.SEASON_NAMES.join(', ')}`);
    process.exit(1);
  }
  const season = await org.setSeason(key);
  if (!season) {
    console.error(`Unknown season: "${key}"`);
    console.error(`Available: ${org.SEASON_NAMES.join(', ')}`);
    process.exit(1);
  }
  console.log(`Season activated: ${season.name}`);
  console.log(`Notes: ${season.notes}`);
}

async function cmdSeasonStatus(): Promise<void> {
  const season = await org.loadSeason();
  if (!season) {
    console.log('No active season. Use "artifact season set <name>" to activate one.');
    return;
  }
  console.log(`Season: ${season.name}`);
  console.log(`Started: ${season.started_at.slice(0, 19)}`);
  console.log(`Notes: ${season.notes}`);
  const weights = Object.entries(season.tier_weights).map(([t, w]) => `${t}:${w}x`).join(', ');
  if (weights) console.log(`Tier weights: ${weights}`);
  if (season.format_bias.length > 0) console.log(`Format bias: ${season.format_bias.join(', ')}`);
  if (season.constraint_decks_enabled.length > 0) console.log(`Constraint decks: ${season.constraint_decks_enabled.join(', ')}`);
  if (season.signature_moves.length > 0) console.log(`Signature moves: ${season.signature_moves.join(', ')}`);
}

async function cmdSeasonEnd(): Promise<void> {
  const name = await org.endSeason();
  if (!name) {
    console.log('No active season to end.');
    return;
  }
  console.log(`Season ended: ${name}`);
}

// ── Org commands ─────────────────────────────────────────────────

async function cmdOrgStatus(): Promise<void> {
  const status = await org.computeStatus();
  console.log(`Total decisions: ${status.total_decisions}`);
  console.log(`Diversity score: ${status.diversity_score}/100`);

  if (status.current_season) {
    console.log(`Active season: ${status.current_season}`);
  }

  if (Object.keys(status.tier_distribution).length > 0) {
    console.log(`\nTier distribution:`);
    for (const [tier, count] of Object.entries(status.tier_distribution)) {
      const pct = Math.round((count / status.total_decisions) * 100);
      console.log(`  ${tier.padEnd(12)} ${count} (${pct}%)`);
    }
  }

  if (Object.keys(status.format_distribution).length > 0) {
    console.log(`\nFormat distribution:`);
    const sorted = Object.entries(status.format_distribution).sort((a, b) => b[1] - a[1]);
    for (const [fmt, count] of sorted) {
      console.log(`  ${fmt.padEnd(24)} ${count}`);
    }
  }

  if (status.gaps.length > 0) {
    console.log(`\nGaps:`);
    for (const g of status.gaps) {
      console.log(`  - ${g}`);
    }
  }

  if (status.recent_bans.length > 0) {
    console.log(`\nActive bans:`);
    for (const b of status.recent_bans) {
      console.log(`  - ${b}`);
    }
  }
}

async function cmdOrgLedger(args: string[]): Promise<void> {
  const n = parseInt(args[0] ?? '10', 10) || 10;
  const entries = await org.ledgerTail(n);

  if (entries.length === 0) {
    console.log('No ledger entries yet. Run "artifact drive <repo> --curate-org" to start.');
    return;
  }

  for (const e of entries) {
    const move = e.signature_move ? ` [${e.signature_move}]` : '';
    const season = e.season !== 'none' ? ` (${e.season})` : '';
    console.log(`${e.timestamp.slice(0, 19)} ${e.repo_name.padEnd(20)} ${e.tier.padEnd(10)} ${e.format_family}${move}${season}`);
  }
  console.log(`\n${entries.length} entries shown.`);
}

async function cmdOrgBans(): Promise<void> {
  const status = await org.computeStatus();

  if (status.recent_bans.length === 0) {
    console.log('No active bans. (Need 3+ ledger entries for ban computation.)');
    return;
  }

  console.log('Active org-wide bans:');
  for (const b of status.recent_bans) {
    console.log(`  - ${b}`);
  }
}

// ── Blueprint command ────────────────────────────────────────────

async function cmdBlueprint(args: string[]): Promise<void> {
  const { outputDir, repoPath, repoName } = buildSource(args);

  const result = await blueprint.generate(repoPath, undefined, outputDir);
  if (!result) {
    console.error(`No decision packet found. Run "artifact drive" first to generate a decision.`);
    process.exit(1);
  }

  console.error(`Blueprint generated for "${repoName}":`);
  console.error(`  ${result.markdown_path}`);
  console.error(`  ${result.json_path}`);
  console.error(`  ${result.assets_path}/`);

  // Print the markdown to stdout
  const { readFile: rf } = await import('node:fs/promises');
  const md = await rf(result.markdown_path, 'utf-8');
  console.log(md);
}

// ── Review command ──────────────────────────────────────────────

async function cmdReview(args: string[]): Promise<void> {
  const jsonMode = args.includes('--json');
  const { outputDir, repoPath } = buildSource(args);

  const result = await review(repoPath, outputDir);
  if (!result) {
    console.error(`No decision packet found. Run "artifact drive" first to generate a decision.`);
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify(result.json, null, 2));
  } else {
    console.log(result.text);
  }
}

// ── Catalog command ─────────────────────────────────────────────

async function cmdCatalog(args: string[]): Promise<void> {
  const all = args.includes('--all');
  const formatRaw = flagValue(args, '--format');
  const format: CatalogFormat = formatRaw === 'html' ? 'html' : 'md';
  const result = await generateCatalog({ all, format });

  console.error(`Catalog generated (${result.entry_count} entries):`);
  console.error(`  ${result.markdown_path}`);
  console.error(`  ${result.json_path}`);
  if (result.html_path) {
    console.error(`  ${result.html_path}`);
  }

  // Print to stdout
  const { readFile: rf } = await import('node:fs/promises');
  if (format === 'html' && result.html_path) {
    const html = await rf(result.html_path, 'utf-8');
    console.log(html);
  } else {
    const md = await rf(result.markdown_path, 'utf-8');
    console.log(md);
  }
}

// ── Buildpack command ───────────────────────────────────────────

async function cmdBuildpack(args: string[]): Promise<void> {
  const jsonMode = args.includes('--json');
  const { outputDir, repoPath } = buildSource(args);

  const result = await buildpack(repoPath, outputDir);
  if (!result) {
    console.error(`No decision packet found. Run "artifact drive" first to generate a decision.`);
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify(result.json, null, 2));
  } else {
    console.log(result.text);
  }
}

// ── Verify command ─────────────────────────────────────────────

async function cmdVerify(args: string[]): Promise<void> {
  const artifactPath = flagValue(args, '--artifact');
  const jsonMode = args.includes('--json');
  const record = args.includes('--record');
  const { outputDir, repoPath, repoName } = buildSource(args);

  if (!artifactPath) {
    console.error('Usage: artifact verify [repo-path] --artifact <path> [--record]');
    console.error('  --artifact <path>  Path to the generated artifact file to lint.');
    console.error('  --record           Write result to built artifact tracking store.');
    process.exit(1);
  }

  const result = await verifyArtifact(repoPath, artifactPath, { record }, outputDir);
  if (!result) {
    console.error(`Could not load decision packet, truth bundle, or artifact file.`);
    console.error(`  Repo: ${repoPath}`);
    console.error(`  Artifact: ${artifactPath}`);
    console.error('Run "artifact drive" first, and verify the artifact path exists.');
    process.exit(1);
  }

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatVerifyResult(result, repoName));
  }

  if (!result.passed) {
    process.exit(1);
  }
}

// ── Ritual command ──────────────────────────────────────────────

async function cmdRitual(args: string[]): Promise<void> {
  // Ritual = drive --curate-org --web --blueprint --review + catalog update
  const driveArgs = [...args];

  // Inject ritual defaults if not already present
  if (!driveArgs.includes('--curate-org')) driveArgs.push('--curate-org');
  if (!driveArgs.includes('--web')) driveArgs.push('--web');
  if (!driveArgs.includes('--blueprint')) driveArgs.push('--blueprint');
  if (!driveArgs.includes('--review')) driveArgs.push('--review');

  // Extract catalog format preference
  const formatRaw = flagValue(args, '--format');
  const catalogFormat: CatalogFormat = formatRaw === 'html' ? 'html' : 'md';

  // Run the drive
  await cmdDrive(driveArgs);

  // Update catalog
  console.error('');
  console.error('--- Catalog Update ---');
  const catalogResult = await generateCatalog({ all: true, format: catalogFormat });
  console.error(`Catalog: ${catalogResult.entry_count} entries`);
  console.error(`  ${catalogResult.markdown_path}`);
  if (catalogResult.html_path) {
    console.error(`  ${catalogResult.html_path}`);
  }

  // Suggest next repo based on gaps
  const status = await org.computeStatus();
  const gaps = status.gaps.filter(g => g.startsWith('prefer '));
  if (gaps.length > 0) {
    console.error('');
    console.error('--- Next Suggested ---');
    for (const g of gaps) {
      console.error(`  ${g}`);
    }
  }

  console.error('');
  console.error(`Diversity: ${status.diversity_score}/100`);
}

// ── Whoami command ──────────────────────────────────────────────

async function cmdWhoami(args: string[]): Promise<void> {
  const verbose = args.includes('--verbose') || args.includes('-v');
  const persona = await getPersona();

  if (verbose) {
    console.log(formatPersonaCard(persona));
  } else {
    console.log(formatWhoami(persona));
  }
}

// ── Config command ──────────────────────────────────────────────

async function cmdConfigGet(args: string[]): Promise<void> {
  const key = args[0];
  if (!key) {
    const config = await loadConfig();
    for (const [k, v] of Object.entries(config)) {
      console.log(`${k} = ${v}`);
    }
    return;
  }
  const config = await loadConfig();
  const val = config[key];
  if (val !== undefined) {
    console.log(`${key} = ${val}`);
  } else {
    console.error(`Unknown config key: ${key}`);
    process.exit(1);
  }
}

async function cmdConfigSet(args: string[]): Promise<void> {
  const key = args[0];
  const value = args[1];
  if (!key || !value) {
    console.error('Usage: artifact config set <key> <value>');
    console.error('Keys: agent_name');
    console.error(`Available personas: ${PERSONA_NAMES.join(', ')}`);
    process.exit(1);
  }

  if (key === 'agent_name') {
    const lower = value.toLowerCase();
    if (!PERSONA_NAMES.includes(lower)) {
      console.error(`Unknown persona: "${value}"`);
      console.error(`Available: ${PERSONA_NAMES.join(', ')}`);
      process.exit(1);
    }
  }

  const config = await loadConfig();
  config[key] = value.toLowerCase();
  await saveConfig(config);
  console.log(`Set ${key} = ${value.toLowerCase()}`);
}

// ── Doctor command ──────────────────────────────────────────────

async function cmdDoctor(): Promise<void> {
  const checks: Array<{ label: string; status: 'pass' | 'warn' | 'info' | 'FAIL'; detail: string }> = [];

  // 1. Node version
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.slice(1), 10);
  checks.push({
    label: 'Node',
    status: major >= 20 ? 'pass' : 'FAIL',
    detail: `${nodeVersion} (>= 20 required)`,
  });

  // 2. ~/.artifact/ writable
  const configDir = resolve(homedir(), '.artifact');
  try {
    await mkdir(configDir, { recursive: true });
    const testFile = resolve(configDir, '.doctor-test');
    await writeFile(testFile, 'ok', 'utf-8');
    await unlink(testFile);
    checks.push({ label: '~/.artifact/', status: 'pass', detail: 'writable' });
  } catch {
    checks.push({ label: '~/.artifact/', status: 'FAIL', detail: 'not writable' });
  }

  // 3. Config valid
  try {
    const config = await loadConfig();
    checks.push({ label: 'Config', status: 'pass', detail: `persona=${config.agent_name}` });
  } catch {
    checks.push({ label: 'Config', status: 'warn', detail: 'could not parse config.json' });
  }

  // 4. Ollama
  try {
    const conn = await connect();
    if (conn) {
      checks.push({ label: 'Ollama', status: 'pass', detail: `model=${conn.model}` });
    } else {
      checks.push({ label: 'Ollama', status: 'warn', detail: 'not running (fallback driver will be used)' });
    }
  } catch {
    checks.push({ label: 'Ollama', status: 'warn', detail: 'not running (fallback driver will be used)' });
  }

  // 5. Git
  try {
    const gitOut = execSync('git --version', { encoding: 'utf-8' }).trim();
    const ver = gitOut.replace('git version ', '');
    checks.push({ label: 'Git', status: 'pass', detail: ver });
  } catch {
    checks.push({ label: 'Git', status: 'warn', detail: 'not found' });
  }

  // 6. Last run
  try {
    await readFile(resolve('.', '.artifact', 'decision_packet.json'), 'utf-8');
    checks.push({ label: 'Last run', status: 'info', detail: 'decision packet found in current directory' });
  } catch {
    checks.push({ label: 'Last run', status: 'info', detail: 'no decision packet in current directory' });
  }

  // Print
  console.log('artifact doctor');
  for (const c of checks) {
    console.log(`  [${c.status}] ${c.label}: ${c.detail}`);
  }
}

// ── Init command ────────────────────────────────────────────────

async function cmdInit(): Promise<void> {
  const configDir = resolve(homedir(), '.artifact');
  const configFile = resolve(configDir, 'config.json');

  // Check if config already exists
  let existing = false;
  try {
    await readFile(configFile, 'utf-8');
    existing = true;
  } catch {
    // doesn't exist yet
  }

  if (existing) {
    const config = await loadConfig();
    const persona = getPersonaByName(config.agent_name);
    console.log(formatWhoami(persona));
    console.log('');
    console.log(`Config already exists at ${configFile}`);
    console.log(`  persona: ${config.agent_name}`);
    console.log('');
    console.log('Run "artifact whoami --verbose" for full persona details.');
    return;
  }

  // Create default config
  await saveConfig({ agent_name: 'glyph' });
  const persona = getPersonaByName('glyph');
  console.log(formatWhoami(persona));
  console.log('');
  console.log(`Config created at ${configFile}`);
  console.log('  persona: glyph');
  console.log('');
  console.log('Run "artifact drive <repo>" to generate your first decision.');
  console.log('Run "artifact whoami --verbose" for full persona details.');
}

// ── About command ──────────────────────────────────────────────

async function cmdAbout(): Promise<void> {
  const version = await getVersion();
  const persona = await getPersona();
  console.log(formatAbout(version, persona));
}

// ── Built commands ──────────────────────────────────────────────

async function cmdBuiltAdd(args: string[]): Promise<void> {
  const remoteSpec = flagValue(args, '--remote');

  let repoName: string;
  let paths: string[];

  if (remoteSpec) {
    // Remote mode: artifact built add --remote owner/repo <path...>
    const valueIndices = flagValueIndices(args, REMOTE_VALUE_FLAGS);
    const positional = args.filter((a, i) => !a.startsWith('--') && !valueIndices.has(i));
    if (positional.length < 1) {
      console.error('Usage: artifact built add --remote <owner/repo> <path...>');
      process.exit(1);
    }
    repoName = remoteSpec;
    paths = positional;
  } else {
    // Local mode: artifact built add <repo-path> <path...>
    if (args.length < 2) {
      console.error('Usage: artifact built add <repo-path> <path...>');
      console.error('  Attach artifact file paths to the built tracking store.');
      process.exit(1);
    }
    repoName = basename(resolve(args[0]));
    paths = args.slice(1);
  }

  const toolVersion = await getToolVersion();
  const persona = await getPersona();
  const record = await addArtifactPaths(repoName, paths, toolVersion, persona.name);

  console.log(`Attached ${paths.length} path(s) to "${repoName}"`);
  console.log(`  status: ${record.built_status}`);
  console.log(`  paths:  ${record.artifact_paths.join(', ')}`);
}

async function cmdBuiltLs(args: string[]): Promise<void> {
  const filterRepo = args[0];
  const store = await loadBuiltStore();
  const records = listBuiltRecords(store, filterRepo);
  console.log(formatBuiltList(records));
}

async function cmdBuiltStatus(args: string[]): Promise<void> {
  const repoName = args[0];
  if (!repoName) {
    console.error('Usage: artifact built status <repo-name>');
    process.exit(1);
  }

  const record = await getBuiltRecord(repoName);
  if (!record) {
    console.error(`No built record for "${repoName}".`);
    console.error('Use "artifact built add" to attach artifact paths first.');
    process.exit(1);
  }

  console.log(formatBuiltRecord(record));
}

// ── Main router ─────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help') usage();

  if (cmd === '--version') {
    const version = await getVersion();
    console.log(version);
    return;
  }

  if (cmd === 'doctor') {
    await cmdDoctor();
  } else if (cmd === 'init') {
    await cmdInit();
  } else if (cmd === 'about') {
    await cmdAbout();
  } else if (cmd === 'drive') {
    await cmdDrive(args.slice(1));
  } else if (cmd === 'infer') {
    await cmdInfer(args.slice(1));
  } else if (cmd === 'ritual') {
    await cmdRitual(args.slice(1));
  } else if (cmd === 'blueprint') {
    await cmdBlueprint(args.slice(1));
  } else if (cmd === 'buildpack') {
    await cmdBuildpack(args.slice(1));
  } else if (cmd === 'verify') {
    await cmdVerify(args.slice(1));
  } else if (cmd === 'review') {
    await cmdReview(args.slice(1));
  } else if (cmd === 'catalog') {
    await cmdCatalog(args.slice(1));
  } else if (cmd === 'memory') {
    const subCmd = args[1];
    if (subCmd === 'show') {
      await cmdMemoryShow(args.slice(2));
    } else if (subCmd === 'forget') {
      await cmdMemoryForget(args.slice(2));
    } else if (subCmd === 'prune') {
      await cmdMemoryPrune(args.slice(2));
    } else if (subCmd === 'stats') {
      await cmdMemoryStats();
    } else {
      console.error(`Unknown memory command: ${subCmd}`);
      usage();
    }
  } else if (cmd === 'season') {
    const subCmd = args[1];
    if (subCmd === 'list') {
      await cmdSeasonList();
    } else if (subCmd === 'set') {
      await cmdSeasonSet(args.slice(2));
    } else if (subCmd === 'status') {
      await cmdSeasonStatus();
    } else if (subCmd === 'end') {
      await cmdSeasonEnd();
    } else {
      console.error(`Unknown season command: ${subCmd}`);
      usage();
    }
  } else if (cmd === 'whoami') {
    await cmdWhoami(args.slice(1));
  } else if (cmd === 'config') {
    const subCmd = args[1];
    if (subCmd === 'get' || !subCmd) {
      await cmdConfigGet(args.slice(2));
    } else if (subCmd === 'set') {
      await cmdConfigSet(args.slice(2));
    } else {
      console.error(`Unknown config command: ${subCmd}`);
      usage();
    }
  } else if (cmd === 'org') {
    const subCmd = args[1];
    if (subCmd === 'status') {
      await cmdOrgStatus();
    } else if (subCmd === 'ledger') {
      await cmdOrgLedger(args.slice(2));
    } else if (subCmd === 'bans') {
      await cmdOrgBans();
    } else {
      console.error(`Unknown org command: ${subCmd}`);
      usage();
    }
  } else if (cmd === 'built') {
    const subCmd = args[1];
    if (subCmd === 'add') {
      await cmdBuiltAdd(args.slice(2));
    } else if (subCmd === 'ls') {
      await cmdBuiltLs(args.slice(2));
    } else if (subCmd === 'status') {
      await cmdBuiltStatus(args.slice(2));
    } else {
      console.error(`Unknown built command: ${subCmd ?? '(none)'}`);
      console.error('Available: add, ls, status');
      usage();
    }
  } else {
    console.error(`Unknown command: ${cmd}`);
    usage();
  }
}

main().catch(err => {
  console.error('artifact: fatal error:', err instanceof Error ? err.message : err);
  process.exit(2);
});
