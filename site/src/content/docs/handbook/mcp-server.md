---
title: MCP Server
description: Use Artifact as a Model Context Protocol server — give AI agents direct access to truth extraction, the Curator, verification, and org curation.
sidebar:
  order: 8
---

Artifact ships a built-in [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server. This means any MCP-compatible agent — Claude Code, Claude Desktop, Cursor, Windsurf, or your own agent — can call Artifact's tools directly, without shelling out to the CLI.

## Why MCP?

The CLI is designed for humans. The MCP server is designed for agents.

| CLI | MCP Server |
|-----|-----------|
| Text output, colored, formatted | JSON-only, structured |
| One command at a time | Multiple tools in one session |
| Manual repo path arguments | Source resolution built in |
| Human reads the review card | Agent reads structured findings |

When an agent uses Artifact via MCP, it gets the same decision engine — same truth extraction, same inference profiles, same Curator — but in a format it can reason about and act on.

## Quick Start

### Claude Code / Claude Desktop

Add to your MCP config (`claude_desktop_config.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "artifact": {
      "command": "artifact-mcp",
      "env": {
        "GITHUB_TOKEN": "your-token-here"
      }
    }
  }
}
```

Or if installed locally in a project:

```json
{
  "mcpServers": {
    "artifact": {
      "command": "npx",
      "args": ["@mcptoolshop/artifact", "mcp"],
      "env": {
        "GITHUB_TOKEN": "your-token-here"
      }
    }
  }
}
```

### CLI launch

```bash
# Direct binary
artifact-mcp

# Via subcommand
artifact mcp
```

Both use stdio transport. The server starts, registers tools and resources, and waits for MCP messages on stdin.

## Tools

### `artifact_truth`

Extract grounded truth atoms from a repo. Returns typed atoms with `file:line` citations — taglines, invariants, CLI commands, error strings, sharp edges, and more.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoPath` | string? | Local path (default: cwd) |
| `remote` | string? | Remote repo as `owner/repo` |
| `ref` | string? | Git ref for remote repos |

### `artifact_infer`

Compute a deterministic inference profile — no Ollama required. Returns archetype, primary user, bottleneck, maturity, risk, and tier weights.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoPath` | string? | Local path (default: cwd) |
| `remote` | string? | Remote repo as `owner/repo` |
| `ref` | string? | Git ref for remote repos |
| `repoType` | enum? | Repo type classification (auto-detect if omitted) |

### `artifact_drive`

Run the full Curator freshness driver. Produces a DecisionPacket with tier, format candidates, constraints, hooks, and freshness payload. Uses Ollama when available, deterministic fallback otherwise.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoPath` | string? | Local path (default: cwd) |
| `remote` | string? | Remote repo as `owner/repo` |
| `ref` | string? | Git ref for remote repos |
| `repoType` | enum? | Repo type classification |
| `noCurator` | boolean? | Skip Ollama, force deterministic fallback |
| `curateOrg` | boolean? | Enable org-wide curation (season + bans + gaps) |

### `artifact_verify`

Verify a built artifact against its blueprint and truth bundle. Checks must-include items, truth citations, banned phrases, freshness grounding, and constraint compliance.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoPath` | string? | Local path (default: cwd) |
| `artifactPath` | string | Path to the artifact file to verify |

### `artifact_buildpack`

Generate a builder prompt packet for chat LLMs. Contains everything an LLM needs to build the artifact: decision packet, truth atoms, blueprint constraints, persona instructions.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoPath` | string? | Local path (default: cwd) |

### `artifact_blueprint`

Generate a Blueprint Pack from the latest decision packet. Contains format hints, constraint rules, truth bundle, and persona-specific guidance.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoPath` | string? | Local path (default: cwd) |

### `artifact_review`

Generate a 4-block editorial review card: Pick, Why, Required Twist, Risks. Evaluates the latest decision and flags violations.

| Parameter | Type | Description |
|-----------|------|-------------|
| `repoPath` | string? | Local path (default: cwd) |

### `artifact_catalog`

Generate a catalog of all artifact decisions in the current season.

| Parameter | Type | Description |
|-----------|------|-------------|
| `all` | boolean? | Include all entries, not just current season |

### `artifact_org_status`

Get org-wide curation health: coverage, diversity score, tier/format distribution, gaps, active bans, and current season. No parameters required.

## Resources

MCP resources are read-only data an agent can pull at any time without calling a tool.

| URI | Description |
|-----|-------------|
| `artifact://org/status` | Current org-wide curation status |
| `artifact://org/season` | Active curation season rules |
| `artifact://persona` | Active curator persona (name, role, motto, voice) |

## Agent Workflows

### Full ritual via MCP

An agent can replicate the CLI `ritual` command by chaining tools:

1. `artifact_drive` — get the decision packet
2. `artifact_blueprint` — generate the blueprint
3. `artifact_review` — evaluate the decision
4. `artifact_catalog` — update the catalog

### Remote analysis

Every source-accepting tool supports `remote` for GitHub repos:

```json
{
  "name": "artifact_infer",
  "arguments": {
    "remote": "mcp-tool-shop-org/artifact",
    "ref": "main"
  }
}
```

No local clone needed. Results are cached at `~/.artifact/repos/`.

### Verify loop

An agent building an artifact can use the verify loop:

1. `artifact_drive` — get decision
2. `artifact_buildpack` — get builder prompt
3. *(agent builds the artifact)*
4. `artifact_verify` — check compliance
5. *(fix issues, repeat step 4)*

## Environment Variables

| Variable | Purpose |
|----------|------------|
| `GITHUB_TOKEN` | GitHub PAT for remote repos (5000 req/hr vs 60) |
| `OLLAMA_HOST` | Override Ollama endpoint (default: auto-detect) |
| `ARTIFACT_OLLAMA_MODEL` | Force a specific Ollama model |

## Security

The MCP server inherits Artifact's security model:

- **Ollama stays local.** No data leaves your machine via Ollama.
- **No telemetry.** No analytics. No phone-home.
- **File scope:** reads repo source files, writes only to `.artifact/` and `~/.artifact/`.
- **stdio only.** No network listener. The agent connects via stdin/stdout.
