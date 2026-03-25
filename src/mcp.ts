#!/usr/bin/env node

/**
 * Artifact MCP Server
 *
 * Exposes Artifact's repo signature decision system as MCP tools.
 * Agents can drive the Curator, extract truth atoms, verify artifacts,
 * and query org-wide curation state — all via the Model Context Protocol.
 *
 * Entry points:
 *   - `artifact-mcp` binary (stdio transport)
 *   - `artifact mcp` subcommand (same thing)
 *
 * Every tool accepts `repoPath` (local) or `remote` (owner/repo) for
 * source resolution. JSON-only output — no console printing.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { LocalRepoSource, RemoteRepoSource } from './source.js';
import { extractTruthBundle } from './truth.js';
import { inferProfile } from './infer.js';
import { connect } from './ollama.js';
import { drive as curatorDrive } from './curator.js';
import { driveFallback } from './fallback.js';
import { verifyArtifact } from './verify.js';
import { buildpack } from './buildpack.js';
import { generate as blueprintGenerate, loadPacket, loadTruthBundle } from './blueprint.js';
import { review } from './review.js';
import { generateCatalog } from './catalog.js';
import { computeStatus, loadSeason, buildCurationBrief } from './org.js';
import { getPersona } from './persona.js';
import * as history from './history.js';
import * as mem from './memory.js';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import type { RepoSource } from './source.js';
import type { RepoContext, RepoType, InferenceProfile } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Helpers ──────────────────────────────────────────────────────

async function getVersion(): Promise<string> {
  try {
    const raw = await readFile(resolve(__dirname, '..', 'package.json'), 'utf-8');
    return JSON.parse(raw).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Build a RepoSource from tool params — local path or remote owner/repo. */
async function buildSource(params: {
  repoPath?: string;
  remote?: string;
  ref?: string;
}): Promise<RepoSource> {
  if (params.remote) {
    const parts = params.remote.split('/');
    if (parts.length !== 2) throw new Error(`Invalid remote: "${params.remote}" — expected "owner/repo"`);
    const token = process.env.GITHUB_TOKEN;
    return new RemoteRepoSource(parts[0], parts[1], params.ref, token ?? undefined);
  }
  const p = resolve(params.repoPath ?? '.');
  if (!existsSync(p)) throw new Error(`Path not found: ${p}`);
  return new LocalRepoSource(p);
}

/** Resolve repo path — local only, for commands that write to .artifact/ */
function resolveRepoPath(params: { repoPath?: string }): string {
  return resolve(params.repoPath ?? '.');
}

/** Auto-detect repo type from source metadata. */
function detectRepoType(source: RepoSource): RepoType {
  return 'unknown';
}

/** Build a RepoContext from a source + truth bundle. */
async function buildContext(
  source: RepoSource,
  repoType: RepoType = 'unknown',
): Promise<{ ctx: RepoContext; profile: InferenceProfile }> {
  const bundle = await extractTruthBundle(source);
  const meta = source.meta();
  const name = meta.displayName;
  const profile = inferProfile(name, repoType, bundle);
  const ctx: RepoContext = {
    repo_name: name,
    repo_type: profile.repo_archetype,
    truth_bundle: bundle,
  };
  return { ctx, profile };
}

// ── Shared Zod schemas ───────────────────────────────────────────

const RepoParams = {
  repoPath: z.string().optional().describe('Local path to the repo (default: cwd)'),
  remote: z.string().optional().describe('Remote repo as "owner/repo" (uses GitHub API)'),
  ref: z.string().optional().describe('Git ref for remote repos (branch, tag, or SHA)'),
};

const RepoTypeParam = z.enum([
  'R1_tooling_cli', 'R2_library_sdk', 'R3_service_server',
  'R4_template_scaffold', 'R5_spec_protocol', 'R6_demo_showcase',
  'R7_data_registry', 'R8_product_app', 'R9_brand_meta', 'unknown',
]).optional().describe('Repo type classification (default: auto-detect)');

// ── Server ───────────────────────────────────────────────────────

const server = new McpServer({
  name: 'artifact',
  version: await getVersion(),
});

// ── Tools ────────────────────────────────────────────────────────

// 1. artifact_truth — Extract truth atoms from a repo
server.tool(
  'artifact_truth',
  'Extract grounded truth atoms (facts with file:line citations) from a repo. Returns typed atoms: taglines, invariants, CLI commands, error strings, sharp edges, and more.',
  {
    ...RepoParams,
  },
  async (params) => {
    const source = await buildSource(params);
    const bundle = await extractTruthBundle(source);
    return { content: [{ type: 'text', text: JSON.stringify(bundle, null, 2) }] };
  },
);

// 2. artifact_infer — Compute inference profile (no Ollama)
server.tool(
  'artifact_infer',
  'Compute a deterministic inference profile: archetype, primary user, bottleneck, maturity, risk, and tier weights. No Ollama required.',
  {
    ...RepoParams,
    repoType: RepoTypeParam,
  },
  async (params) => {
    const source = await buildSource(params);
    const bundle = await extractTruthBundle(source);
    const meta = source.meta();
    const profile = inferProfile(meta.displayName, params.repoType ?? 'unknown', bundle);
    return { content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }] };
  },
);

// 3. artifact_drive — Run the full Curator freshness driver
server.tool(
  'artifact_drive',
  'Run the Curator freshness driver on a repo. Produces a full DecisionPacket with tier, format candidates, constraints, hooks, and freshness payload. Uses Ollama if available, deterministic fallback otherwise.',
  {
    ...RepoParams,
    repoType: RepoTypeParam,
    noCurator: z.boolean().optional().describe('Skip Ollama, use deterministic fallback only'),
    curateOrg: z.boolean().optional().describe('Enable org-wide curation (season + bans + gaps)'),
  },
  async (params) => {
    const source = await buildSource(params);
    const { ctx, profile } = await buildContext(source, params.repoType ?? 'unknown');
    const hist = await history.load(ctx.repo_name);

    let packet;

    if (params.noCurator) {
      packet = driveFallback(ctx, hist, profile);
    } else {
      const conn = await connect();
      if (conn) {
        // Build optional briefs
        const repoRoot = params.remote ? undefined : resolveRepoPath(params);
        const memResult = repoRoot
          ? await mem.buildMemoryBrief(repoRoot, ctx.repo_name, `drive ${ctx.repo_name}`)
          : null;
        const memBrief = memResult?.formatted || undefined;
        let curationBrief: string | undefined;
        if (params.curateOrg) {
          const brief = await buildCurationBrief(ctx.repo_name);
          curationBrief = brief.formatted;
        }
        const profileLines = [
          `Archetype: ${profile.repo_archetype}`,
          `Primary user: ${profile.primary_user}`,
          `Bottleneck: ${profile.primary_bottleneck}`,
          `Maturity: ${profile.maturity}`,
          `Risk: ${profile.risk_profile}`,
        ].join('\n');

        packet = await curatorDrive(
          conn, ctx, hist, memBrief || undefined,
          undefined, curationBrief, undefined, profileLines,
        );
        if (!packet) {
          // Curator failed, fall back
          packet = driveFallback(ctx, hist, profile);
        }
      } else {
        packet = driveFallback(ctx, hist, profile);
      }
    }

    // Attach inference profile
    packet.inference_profile = profile;

    // Save history
    await history.append(ctx.repo_name, {
      repo_name: ctx.repo_name,
      tier: packet.tier,
      formats: packet.format_candidates,
      constraints: packet.constraints,
      atom_ids_used: packet.selected_hooks.map(h => h.atom_id),
      timestamp: new Date().toISOString(),
    });

    // Save memory (only for local repos)
    if (!params.remote) {
      const rp = resolveRepoPath(params);
      await mem.write({
        type: 'decision_packet',
        scope: 'repo',
        repo_name: ctx.repo_name,
        content: mem.packetToContent(packet),
        data: packet,
        embedding: null,
        tags: ['drive', 'mcp'],
      }, rp);
    }

    // Write decision packet to .artifact/ if local
    if (!params.remote) {
      const repoPath = resolveRepoPath(params);
      const { writeFile, mkdir } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const outDir = join(repoPath, '.artifact');
      await mkdir(outDir, { recursive: true });
      await writeFile(join(outDir, 'decision_packet.json'), JSON.stringify(packet, null, 2));
    }

    return { content: [{ type: 'text', text: JSON.stringify(packet, null, 2) }] };
  },
);

// 4. artifact_verify — Lint an artifact against its blueprint + truth bundle
server.tool(
  'artifact_verify',
  'Verify a built artifact against its blueprint and truth bundle. Checks must-include items, truth citations, banned phrases, freshness grounding, and constraint compliance. Returns pass/fail + fix list.',
  {
    repoPath: z.string().optional().describe('Local path to the repo (default: cwd)'),
    artifactPath: z.string().describe('Path to the artifact file to verify'),
  },
  async (params) => {
    const repoPath = resolveRepoPath(params);
    const result = await verifyArtifact(repoPath, params.artifactPath, { record: true });
    if (!result) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'No decision packet or truth bundle found. Run artifact_drive first.' }) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// 5. artifact_buildpack — Emit a builder prompt packet
server.tool(
  'artifact_buildpack',
  'Generate a builder prompt packet (buildpack) for chat LLMs. Contains the decision packet, truth atoms, blueprint constraints, and persona instructions — everything an LLM needs to build the artifact.',
  {
    repoPath: z.string().optional().describe('Local path to the repo (default: cwd)'),
  },
  async (params) => {
    const repoPath = resolveRepoPath(params);
    const result = await buildpack(repoPath);
    if (!result) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'No decision packet found. Run artifact_drive first.' }) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// 6. artifact_blueprint — Generate a Blueprint Pack
server.tool(
  'artifact_blueprint',
  'Generate a Blueprint Pack from the latest decision packet. The blueprint contains format hints, constraint rules, truth bundle, and persona-specific guidance.',
  {
    repoPath: z.string().optional().describe('Local path to the repo (default: cwd)'),
  },
  async (params) => {
    const repoPath = resolveRepoPath(params);
    const result = await blueprintGenerate(repoPath);
    if (!result) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'No decision packet found. Run artifact_drive first.' }) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// 7. artifact_review — Print a 4-block editorial review card
server.tool(
  'artifact_review',
  'Generate a 4-block editorial review card: Identity, Decision, Freshness, Verdict. Evaluates the latest decision packet and flags violations.',
  {
    repoPath: z.string().optional().describe('Local path to the repo (default: cwd)'),
  },
  async (params) => {
    const repoPath = resolveRepoPath(params);
    const result = await review(repoPath);
    if (!result) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'No decision packet found. Run artifact_drive first.' }) }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// 8. artifact_catalog — Generate a season catalog
server.tool(
  'artifact_catalog',
  'Generate a catalog of all artifact decisions in the current season. Returns structured data about every repo that has been curated.',
  {
    all: z.boolean().optional().describe('Include all entries, not just current season'),
  },
  async (params) => {
    const result = await generateCatalog({ all: params.all, format: 'md' });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  },
);

// 9. artifact_org_status — Org-wide curation health
server.tool(
  'artifact_org_status',
  'Get org-wide curation health: coverage, diversity score, tier/format distribution, gaps, active bans, and current season.',
  {},
  async () => {
    const status = await computeStatus();
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
  },
);

// ── Resources ────────────────────────────────────────────────────

// Resource: org status snapshot
server.resource(
  'org-status',
  'artifact://org/status',
  { description: 'Current org-wide curation status — coverage, diversity, gaps, bans' },
  async () => {
    const status = await computeStatus();
    return { contents: [{ uri: 'artifact://org/status', text: JSON.stringify(status, null, 2), mimeType: 'application/json' }] };
  },
);

// Resource: active season
server.resource(
  'org-season',
  'artifact://org/season',
  { description: 'Active curation season — tier weights, format biases, bans, signature moves' },
  async () => {
    const season = await loadSeason();
    const payload = season ?? { active: false, message: 'No active season' };
    return { contents: [{ uri: 'artifact://org/season', text: JSON.stringify(payload, null, 2), mimeType: 'application/json' }] };
  },
);

// Resource: active persona
server.resource(
  'persona',
  'artifact://persona',
  { description: 'Active curator persona — name, role, motto, voice rules' },
  async () => {
    const persona = await getPersona();
    return { contents: [{ uri: 'artifact://persona', text: JSON.stringify(persona, null, 2), mimeType: 'application/json' }] };
  },
);

// ── Start ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  console.error('artifact-mcp: fatal error:', err instanceof Error ? err.message : err);
  process.exit(2);
});
