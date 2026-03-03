#!/usr/bin/env node

/**
 * artifact drive [repo-path]
 *
 * Runs the Curator freshness driver against a repo.
 * Outputs .artifact/decision_packet.json.
 */

import { resolve, basename } from 'node:path';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { connect } from './ollama.js';
import { drive as curatorDrive } from './curator.js';
import { driveFallback } from './fallback.js';
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

/** Try to extract truth atoms from package.json if present. Phase 1 minimal extraction. */
async function extractBasicAtoms(repoPath: string, repoName: string): Promise<string[]> {
  const atoms: string[] = [];

  // package.json
  const pkgPath = resolve(repoPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const raw = await readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      if (typeof pkg.description === 'string' && pkg.description) {
        atoms.push(`description: ${pkg.description}`);
      }
      if (typeof pkg.name === 'string') {
        atoms.push(`package name: ${pkg.name}`);
      }
      if (pkg.bin && typeof pkg.bin === 'object') {
        const cmds = Object.keys(pkg.bin);
        atoms.push(`CLI commands: ${cmds.join(', ')}`);
      }
      if (Array.isArray(pkg.keywords) && pkg.keywords.length > 0) {
        atoms.push(`keywords: ${pkg.keywords.join(', ')}`);
      }
    } catch { /* ignore */ }
  }

  // pyproject.toml — just check existence
  if (existsSync(resolve(repoPath, 'pyproject.toml'))) {
    atoms.push('Python project (pyproject.toml present)');
  }

  // README.md first line
  const readmePath = resolve(repoPath, 'README.md');
  if (existsSync(readmePath)) {
    try {
      const raw = await readFile(readmePath, 'utf-8');
      const firstLine = raw.split('\n').find((l: string) => l.trim().length > 0);
      if (firstLine) atoms.push(`README first line: ${firstLine.trim().slice(0, 120)}`);
    } catch { /* ignore */ }
  }

  if (atoms.length === 0) {
    atoms.push(`repo name: ${repoName}`);
  }

  return atoms;
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

  // Extract basic truth atoms (Phase 1)
  const truthAtoms = await extractBasicAtoms(repoPath, repoName);

  const ctx: RepoContext = {
    repo_name: repoName,
    repo_type: repoType,
    truth_atoms: truthAtoms,
  };

  // Load history
  const store = await history.load(repoPath);

  let packet: DecisionPacket;

  if (noCurator) {
    console.error('Curator: skipped (--no-curator)');
    packet = driveFallback(ctx, store);
  } else {
    // Try Ollama
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

  // Append to history
  await history.append(repoPath, {
    repo_name: packet.repo_name,
    tier: packet.tier,
    formats: packet.format_candidates,
    constraints: packet.constraints,
    timestamp: packet.driver_meta.timestamp,
  });

  // Output the packet to stdout for piping
  console.log(JSON.stringify(packet, null, 2));
}

main().catch(err => {
  console.error('artifact: fatal error:', err instanceof Error ? err.message : err);
  process.exit(2);
});
