#!/usr/bin/env node

/**
 * artifact — repo signature artifact decision system
 *
 * Commands:
 *   drive [repo-path]           Run the Curator freshness driver
 *   memory show [--org]         Show memory entries
 *   memory forget <repo-name>   Forget a repo's memory
 *   memory prune <days>         Prune old entries
 *   memory stats                Memory statistics
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
import type { RepoContext, RepoType, DecisionPacket, WebOptions } from './types.js';

function usage(): never {
  console.error(`Usage: artifact <command> [options]

Commands:
  drive [repo-path]           Run the Curator freshness driver.
  memory show [--org]         Show repo memory (or --org for org-level).
  memory forget <repo-name>   Forget all memory for a repo.
  memory prune <days>         Prune entries older than N days.
  memory stats                Show memory statistics.

Drive options:
  --no-curator         Skip Ollama, use deterministic fallback only.
  --curator-speak      Print Curator callouts (veto/twist/pick/risk).
  --type <type>        Repo type (R1_tooling_cli, etc.). Default: unknown.
  --web                Enable web recommendations.
  --web-cache-ttl <h>  Cache TTL in hours (default: 72).
  --web-domains <csv>  Comma-separated domain allowlist.
  --web-refresh        Bypass cache, re-fetch all queries.
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

      const result = await curatorDrive(conn, ctx, store, brief.formatted || undefined, webBriefText);
      if (result) {
        packet = result;
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

  // Write decision packet
  const outDir = resolve(repoPath, '.artifact');
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, 'decision_packet.json');
  await writeFile(outPath, JSON.stringify(packet, null, 2) + '\n', 'utf-8');

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

// ── Main router ─────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help') usage();

  if (cmd === 'drive') {
    await cmdDrive(args.slice(1));
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
  } else {
    console.error(`Unknown command: ${cmd}`);
    usage();
  }
}

main().catch(err => {
  console.error('artifact: fatal error:', err instanceof Error ? err.message : err);
  process.exit(2);
});
