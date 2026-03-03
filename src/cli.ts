#!/usr/bin/env node

/**
 * artifact — repo signature artifact decision system
 *
 * Commands:
 *   drive [repo-path]           Run the Curator freshness driver
 *   blueprint [repo-path]       Generate Blueprint Pack from latest decision
 *   review [repo-path]          Print a 4-block editorial review card
 *   memory show [--org]         Show memory entries
 *   memory forget <repo-name>   Forget a repo's memory
 *   memory prune <days>         Prune old entries
 *   memory stats                Memory statistics
 *   season list|set|status|end  Manage curation seasons
 *   org status|ledger|bans      Org-wide curation info
 */

import { resolve, basename } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
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
import type { RepoContext, RepoType, DecisionPacket, WebOptions } from './types.js';

function usage(): never {
  console.error(`Usage: artifact <command> [options]

Commands:
  drive [repo-path]           Run the Curator freshness driver.
  blueprint [repo-path]       Generate Blueprint Pack from latest decision.
  review [repo-path]          Print a 4-block editorial review card.
  memory show [--org]         Show repo memory (or --org for org-level).
  memory forget <repo-name>   Forget all memory for a repo.
  memory prune <days>         Prune entries older than N days.
  memory stats                Show memory statistics.
  season list                 List available seasons.
  season set <name>           Activate a season.
  season status               Show active season rules.
  season end                  End the current season.
  org status                  Coverage, diversity, gaps.
  org ledger [n]              Last N decisions (default: 10).
  org bans                    Current auto-bans with reasons.

Drive options:
  --no-curator         Skip Ollama, use deterministic fallback only.
  --curator-speak      Print Curator callouts (veto/twist/pick/risk).
  --blueprint          Also generate Blueprint Pack after drive.
  --type <type>        Repo type (R1_tooling_cli, etc.). Default: unknown.
  --web                Enable web recommendations.
  --web-cache-ttl <h>  Cache TTL in hours (default: 72).
  --web-domains <csv>  Comma-separated domain allowlist.
  --web-refresh        Bypass cache, re-fetch all queries.
  --curate-org         Enable org-wide curation (season + bans + gaps).
  --help               Show this help.`);
  return process.exit(1) as never;
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

async function cmdDrive(args: string[]): Promise<void> {
  const noCurator = args.includes('--no-curator');
  const curatorSpeak = args.includes('--curator-speak');
  const emitBlueprint = args.includes('--blueprint');
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

  // Filter positional args (skip flags and their values)
  const valueFlags = ['--type', '--web-cache-ttl', '--web-domains'];
  const valueIndices = flagValueIndices(args, valueFlags);
  const positional = args.filter((a: string, i: number) =>
    !a.startsWith('--') && !valueIndices.has(i));
  const repoPath = resolve(positional[0] ?? '.');
  const repoName = basename(repoPath);

  // Extract truth atoms
  const truthBundle = await extractTruthBundle(repoPath);
  const typeStats = Object.entries(truthBundle.stats.atoms_by_type).map(([t, n]) => `${t}:${n}`).join(', ');
  console.error(`Truth: ${truthBundle.atoms.length} atoms from ${truthBundle.stats.scanned_files} files (${typeStats})`);

  const ctx: RepoContext = {
    repo_name: repoName,
    repo_type: repoType,
    truth_bundle: truthBundle,
  };

  // Load history
  const store = await history.load(repoPath);

  let packet: DecisionPacket;
  let ollamaHost: string | undefined;

  if (noCurator) {
    console.error('Curator: skipped (--no-curator)');
    if (webOpts.enabled) {
      console.error('Web: --web requires Ollama for synthesis. Skipped (use without --no-curator).');
    }
    packet = driveFallback(ctx, store);
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
      const brief = await mem.buildMemoryBrief(repoPath, repoName, query, conn.host);
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

        const findings = await collectFindings(queries, repoPath, webOpts);
        console.error(`Web: ${findings.length} findings collected`);

        const webBrief = await synthesizeBrief(findings, tier, repoName, conn);
        console.error(`Web: brief synthesized (${webBrief.web_status}, ${webBrief.recommendations.length} recommendations)`);

        await saveBrief(repoPath, webBrief);
        webBriefText = formatWebBrief(webBrief);
      }

      // Build curation brief (if --curate-org enabled)
      let curationBriefText: string | undefined;
      if (curateOrg) {
        const curation = await org.buildCurationBrief(repoName);
        const seasonLabel = curation.season?.name ?? 'none';
        console.error(`Org: season="${seasonLabel}", ${curation.org_bans.length} bans, ${curation.org_gaps.length} gaps, move=${curation.assigned_move ?? 'none'}`);
        curationBriefText = curation.formatted;
      }

      const result = await curatorDrive(conn, ctx, store, brief.formatted || undefined, webBriefText, curationBriefText);
      if (result) {
        packet = result;
        // Attach org curation metadata to packet
        if (curateOrg) {
          const curation = await org.buildCurationBrief(repoName);
          packet.season = curation.season?.name ?? 'none';
          packet.org_bans_applied = curation.org_bans.map(b => b.item);
          packet.org_gap_bias = curation.org_gaps;
          packet.signature_move = curation.assigned_move ?? undefined;
        }
      } else {
        console.error('Curator: Ollama responded but output was invalid. Falling back.');
        packet = driveFallback(ctx, store);
      }
    } else {
      console.error('Curator: Ollama not available. Using fallback driver.');
      packet = driveFallback(ctx, store);
    }
  }

  // Print callouts if requested
  if (curatorSpeak) {
    const c = packet.callouts;
    console.error('');
    if (c.veto) console.error(`  Veto:  ${c.veto}`);
    if (c.twist) console.error(`  Twist: ${c.twist}`);
    if (c.pick) console.error(`  Pick:  ${c.pick}`);
    if (c.risk) console.error(`  Risk:  ${c.risk}`);
    console.error('');
  }

  // Write decision packet + truth bundle
  const outDir = resolve(repoPath, '.artifact');
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, 'decision_packet.json');
  await writeFile(outPath, JSON.stringify(packet, null, 2) + '\n', 'utf-8');
  const bundlePath = resolve(outDir, 'truth_bundle.json');
  await writeFile(bundlePath, JSON.stringify(truthBundle, null, 2) + '\n', 'utf-8');

  // Append to rotation history
  await history.append(repoPath, {
    repo_name: packet.repo_name,
    tier: packet.tier,
    formats: packet.format_candidates,
    constraints: packet.constraints,
    atom_ids_used: packet.selected_hooks.map(h => h.atom_id),
    timestamp: packet.driver_meta.timestamp,
  });

  // Write to persistent memory (org + repo)
  await mem.writePacket(packet, repoPath, ollamaHost);
  console.error('Memory: decision saved to repo + org stores');

  // Record to org ledger (if --curate-org)
  if (curateOrg) {
    await org.recordDecision(packet);
    console.error('Org: ledger entry recorded, status recomputed');
  }

  // Generate Blueprint Pack if requested
  if (emitBlueprint) {
    const result = await blueprint.generate(repoPath, packet);
    if (result) {
      console.error(`Blueprint: ${result.markdown_path}`);
      console.error(`Blueprint: ${result.json_path}`);
      console.error(`Blueprint: ${result.assets_path}/`);
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
  const repoPath = resolve(args[0] ?? '.');
  const repoName = basename(repoPath);

  const result = await blueprint.generate(repoPath);
  if (!result) {
    console.error(`No decision packet found at ${resolve(repoPath, '.artifact', 'decision_packet.json')}`);
    console.error('Run "artifact drive" first to generate a decision.');
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
  const repoPath = resolve(args[0] ?? '.');

  const card = await review(repoPath);
  if (!card) {
    console.error(`No decision packet found at ${resolve(repoPath, '.artifact', 'decision_packet.json')}`);
    console.error('Run "artifact drive" first to generate a decision.');
    process.exit(1);
  }

  console.log(card);
}

// ── Main router ─────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help') usage();

  if (cmd === 'drive') {
    await cmdDrive(args.slice(1));
  } else if (cmd === 'blueprint') {
    await cmdBlueprint(args.slice(1));
  } else if (cmd === 'review') {
    await cmdReview(args.slice(1));
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
  } else {
    console.error(`Unknown command: ${cmd}`);
    usage();
  }
}

main().catch(err => {
  console.error('artifact: fatal error:', err instanceof Error ? err.message : err);
  process.exit(2);
});
