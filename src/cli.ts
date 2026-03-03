#!/usr/bin/env node

/**
 * artifact drive [repo-path]
 *
 * Runs the Curator freshness driver against a repo.
 * Phase 2: extracts truth atoms, grounds all decisions in repo facts.
 * Outputs .artifact/decision_packet.json.
 */

import { resolve, basename } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { connect } from './ollama.js';
import { drive as curatorDrive } from './curator.js';
import { driveFallback } from './fallback.js';
import { extractTruthBundle } from './truth.js';
import * as history from './history.js';
import type { RepoContext, RepoType, DecisionPacket } from './types.js';

function usage(): never {
  console.error(`Usage: artifact drive [repo-path]

Commands:
  drive   Run the Curator freshness driver on a repo.
          Outputs .artifact/decision_packet.json.

Options:
  --no-curator   Skip Ollama, use deterministic fallback only.
  --type <type>  Repo type (R1_tooling_cli, R2_library_sdk, etc.). Default: unknown.
  --help         Show this help.`);
  return process.exit(1) as never;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args[0] !== 'drive') {
    usage();
  }

  // Parse flags
  const noCurator = args.includes('--no-curator');
  const typeIdx = args.indexOf('--type');
  const repoType: RepoType = typeIdx !== -1 && args[typeIdx + 1]
    ? args[typeIdx + 1] as RepoType
    : 'unknown';

  // Repo path: first non-flag arg after "drive", or cwd
  const positional = args.slice(1).filter((a: string) => !a.startsWith('--') && (typeIdx === -1 || args.indexOf(a) !== typeIdx + 1));
  const repoPath = resolve(positional[0] ?? '.');
  const repoName = basename(repoPath);

  // Extract truth atoms (Phase 2)
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

  if (noCurator) {
    console.error('Curator: skipped (--no-curator)');
    packet = driveFallback(ctx, store);
  } else {
    const conn = await connect();
    if (conn) {
      console.error(`Curator: online (model=${conn.model})`);
      const result = await curatorDrive(conn, ctx, store);
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

  // Write decision packet
  const outDir = resolve(repoPath, '.artifact');
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, 'decision_packet.json');
  await writeFile(outPath, JSON.stringify(packet, null, 2) + '\n', 'utf-8');

  // Append to history (including atom IDs used)
  await history.append(repoPath, {
    repo_name: packet.repo_name,
    tier: packet.tier,
    formats: packet.format_candidates,
    constraints: packet.constraints,
    atom_ids_used: packet.selected_hooks.map(h => h.atom_id),
    timestamp: packet.driver_meta.timestamp,
  });

  // Output the packet to stdout for piping
  console.log(JSON.stringify(packet, null, 2));
}

main().catch(err => {
  console.error('artifact: fatal error:', err instanceof Error ? err.message : err);
  process.exit(2);
});
