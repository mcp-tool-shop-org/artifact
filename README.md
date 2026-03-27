<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/artifact/readme.png" width="400" alt="Artifact">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/artifact/actions"><img src="https://img.shields.io/github/actions/workflow/status/mcp-tool-shop-org/artifact/ci.yml?label=CI" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/artifact"><img src="https://img.shields.io/npm/v/@mcptoolshop/artifact" alt="npm version"></a>
  <a href="https://github.com/mcp-tool-shop-org/artifact/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/artifact/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

Repo signature artifact decision system. Runs a freshness driver against any repo and outputs a structured decision packet — tier, format, constraints, hooks, truth atoms with `file:line` citations.

The Curator (local Ollama) drives the decision. If Ollama isn't available, a deterministic fallback produces valid output using inference profiles and seeded rotation.

## Install

```bash
npm install -g @mcptoolshop/artifact
```

Or run directly:

```bash
npx @mcptoolshop/artifact doctor
```

## Quick Start

```bash
# First-run setup
artifact init
artifact doctor

# Run on a repo
artifact drive /path/to/repo

# Full ritual: drive + blueprint + review + catalog
artifact ritual /path/to/repo
```

## Commands

### Core

| Command | What it does |
|---------|-------------|
| `drive [repo-path]` | Run the Curator freshness driver |
| `infer [repo-path]` | Compute inference profile (no Ollama needed) |
| `ritual [repo-path]` | Full ritual: drive + blueprint + review + catalog |
| `blueprint [repo-path]` | Generate Blueprint Pack from latest decision |
| `buildpack [repo-path]` | Emit builder prompt packet for chat LLMs |
| `verify [repo-path] --artifact <path>` | Lint artifact against blueprint + truth bundle |
| `review [repo-path]` | Print a 4-block editorial review card |
| `catalog` | Generate season catalog |

### Setup & Diagnostics

| Command | What it does |
|---------|-------------|
| `doctor` | Environment health check (Node, Ollama, git, config) |
| `init` | First-run onboarding — creates config |
| `about` | Version, active persona, and core rules |
| `whoami` | Print active persona name + motto |
| `--version` | Print version and exit |
| `mcp` | Start MCP server (stdio transport) |

### Memory & History

| Command | What it does |
|---------|-------------|
| `memory show [--org]` | Show repo or org-level memory |
| `memory forget <name>` | Forget a repo's memory |
| `memory prune <days>` | Prune entries older than N days |
| `memory stats` | Memory statistics |

### Org-wide Curation

| Command | What it does |
|---------|-------------|
| `season list\|set\|status\|end` | Manage curation seasons |
| `org status` | Coverage, diversity score, gaps |
| `org ledger [n]` | Last N decisions |
| `org bans` | Current auto-bans with reasons |
| `config get [key]` | Read config values |
| `config set <key> <value>` | Set config (e.g., `agent_name`) |

### Batch & Publishing

| Command | What it does |
|---------|-------------|
| `crawl --org <name>` | Batch-curate all repos in a GitHub org |
| `crawl --from <file>` | Crawl repos listed in a text file |
| `publish --pages-repo <o/r>` | Push catalog to GitHub Pages |
| `privacy` | Show storage locations + data policy |
| `reset --org\|--cache\|--all` | Delete stored data (with confirmation) |

### Built Artifact Tracking

| Command | What it does |
|---------|-------------|
| `built add <repo> <path...>` | Attach artifact file paths |
| `built ls [repo-name]` | List built status |
| `built status <repo-name>` | Detailed tracking for one repo |

## Drive Options

```
--no-curator         Skip Ollama, use deterministic fallback
--curator-speak      Print Curator callouts (veto/twist/pick/risk)
--explain            Print inference profile (why this tier)
--blueprint          Also generate Blueprint Pack
--review             Also print review card
--type <type>        Repo type (R1_tooling_cli, etc.)
--web                Enable web recommendations
--web-cache-ttl <h>  Cache TTL in hours (default: 72)
--web-domains <csv>  Comma-separated domain allowlist
--web-refresh        Bypass cache, re-fetch all queries
--curate-org         Enable org-wide curation (season + bans + gaps)
```

## Output

Writes `.artifact/decision_packet.json` to the target repo:

```json
{
  "repo_name": "my-tool",
  "tier": "Fun",
  "format_candidates": ["F2_card_deck", "F9_museum_placard"],
  "constraints": ["monospace-only", "uses-failure-mode"],
  "must_include": ["one real invariant", "one failure mode", "one CLI flag"],
  "freshness_payload": {
    "weird_detail": "uses \\\\?\\ prefix to bypass Win32 parsing",
    "recent_change": "v1.0.3 added TOCTOU identity checks",
    "sharp_edge": "HMAC dot-separator must be in outer base64 layer"
  }
}
```

## Personas

Three built-in curator personas. Default: **Glyph**.

| Persona | Role | Motto |
|---------|------|-------|
| Glyph | design gremlin | No vibes without receipts. |
| Mina | museum curator | Make it specific. Make it collectible. |
| Vera | verification oracle | Truth, but make it pretty. |

```bash
artifact whoami
artifact config set agent_name vera
```

## Remote Options

All core commands support `--remote` for analyzing GitHub repos without a local clone:

```
--remote <owner/repo>  Analyze a GitHub repo without cloning
--ref <branch|tag|sha> Git ref for remote repos (default: default branch)
--remote-refresh       Bypass remote cache, re-fetch all API data
```

Results are cached at `~/.artifact/repos/owner/repo/`. Requires `GITHUB_TOKEN` for private repos and higher rate limits.

## MCP Server

Artifact includes a built-in [Model Context Protocol](https://modelcontextprotocol.io) server. Any MCP-compatible agent (Claude Code, Claude Desktop, Cursor, etc.) can call Artifact's tools directly.

### Setup

Add to your MCP config:

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

Or launch via CLI: `artifact mcp`

### Tools

| Tool | What it does |
|------|-------------|
| `artifact_truth` | Extract grounded truth atoms with `file:line` citations |
| `artifact_infer` | Compute deterministic inference profile (no Ollama) |
| `artifact_drive` | Run the full Curator freshness driver |
| `artifact_verify` | Lint artifact against blueprint + truth bundle |
| `artifact_buildpack` | Generate builder prompt packet for LLMs |
| `artifact_blueprint` | Generate Blueprint Pack from latest decision |
| `artifact_review` | Generate 4-block editorial review card |
| `artifact_catalog` | Generate season catalog |
| `artifact_org_status` | Org-wide curation health |

All source-accepting tools support both `repoPath` (local) and `remote` (owner/repo via GitHub API).

### Resources

| URI | Description |
|-----|-------------|
| `artifact://org/status` | Current org-wide curation status |
| `artifact://org/season` | Active curation season rules |
| `artifact://persona` | Active curator persona |

See the [MCP Server handbook page](https://mcp-tool-shop-org.github.io/artifact/handbook/mcp-server/) for full documentation.

## Threat Model

- **Ollama is local-only.** No data leaves your machine. Connects to `localhost` only.
- **No telemetry.** No analytics. No phone-home.
- **No secrets.** Does not read, store, or transmit credentials.
- **History is local.** `.artifact/` lives in the repo, gitignored by convention.
- **Fallback is deterministic.** If Ollama is down, output is seeded from repo signals — reproducible, not random.
- **File scope:** reads repo source files, writes only to `.artifact/` and `~/.artifact/`.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | GitHub PAT for remote/crawl/publish (5000 req/hr vs 60) |
| `OLLAMA_HOST` | Override Ollama endpoint (default: auto-detect) |
| `ARTIFACT_OLLAMA_MODEL` | Force a specific Ollama model |

## License

MIT

---

Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
