---
title: Commands
description: Full CLI reference for Artifact.
sidebar:
  order: 2
---

## Core commands

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

## Setup & diagnostics

| Command | What it does |
|---------|-------------|
| `doctor` | Environment health check (Node, Ollama, git, config) |
| `init` | First-run onboarding — creates config |
| `about` | Version, active persona, and core rules |
| `whoami` | Print active persona name + motto |
| `--version` | Print version and exit |
| `config get [key]` | Read config values |
| `config set <key> <value>` | Set config (e.g., `agent_name`) |
| `privacy` | Show storage locations + data policy |
| `mcp` | Start MCP server (stdio transport) |

## Memory & history

| Command | What it does |
|---------|-------------|
| `memory show [--org]` | Show repo or org-level memory |
| `memory forget <name>` | Forget a repo's memory |
| `memory prune <days>` | Prune entries older than N days |
| `memory stats` | Memory statistics |

## Org-wide curation

| Command | What it does |
|---------|-------------|
| `season list\|set\|status\|end` | Manage curation seasons |
| `org status` | Coverage, diversity score, gaps |
| `org ledger [n]` | Last N decisions |
| `org bans` | Current auto-bans with reasons |

## Built artifact tracking

| Command | What it does |
|---------|-------------|
| `built add <repo> <path...>` | Attach artifact file paths to tracking |
| `built ls [repo-name]` | List built status (all or one repo) |
| `built status <repo-name>` | Detailed tracking for one repo |

Artifacts move through four statuses: `blueprint_only` (decision made, nothing built), `built_unverified` (files attached, not yet verified), `verified_pass` (verified and passed), and `verified_fail` (verified and failed).

## Batch & publishing

| Command | What it does |
|---------|-------------|
| `crawl --org <name>` | Batch-curate all repos in a GitHub org |
| `crawl --from <file>` | Crawl repos listed in a text file |
| `publish --pages-repo <o/r>` | Push catalog to GitHub Pages |
| `privacy` | Show storage locations + data policy |
| `reset --org\|--cache\|--all` | Delete stored data (with confirmation) |

## Drive options

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
--curate-org         Enable org-wide curation
```

## Remote options

All core commands support `--remote` for analyzing GitHub repos without a local clone:

```
--remote <owner/repo>  Analyze a GitHub repo without cloning
--ref <branch|tag|sha> Git ref for remote repos (default: default branch)
--remote-refresh       Bypass remote cache, re-fetch all API data
```

Results are cached at `~/.artifact/repos/owner/repo/`. Requires `GITHUB_TOKEN` for private repos and higher rate limits.

## Infer options

```
--type <type>        Repo type (R1_tooling_cli, etc.). Default: auto-detect.
--json               Output as JSON instead of human-readable text.
```

## Verify options

```
--artifact <path>    Path to the artifact file to lint (required).
--record             Write result to built artifact tracking store.
```

## Ritual options

The `ritual` command chains drive, blueprint, review, and catalog in one pass. It runs with `--curate-org --web --blueprint --review` enabled. It accepts all drive options plus `--format` for catalog output.

## Crawl options

```
--org <name>           Crawl all non-fork, non-archived repos in a GitHub org.
--from <file>          Crawl repos listed in a text file (one owner/repo per line).
--dry-run              List repos that would be crawled, then exit.
--skip-curated         Skip repos that already have a decision packet.
--no-blueprint         Skip blueprint generation (default: on).
--review               Also generate review cards.
--web                  Enable web recommendations.
--format <md|html>     Catalog format (default: md).
--publish              Publish catalog after crawl completes.
--pages-repo <o/r>     Target repo for publishing (required with --publish).
```

## Publish options

```
--pages-repo <owner/repo>  Target repo with GitHub Pages enabled (required).
--branch <name>            Branch to push to (default: main).
--path <dir>               Directory in repo (default: docs).
--message <msg>            Commit message.
--dry-run                  Show what would be published without pushing.
```
