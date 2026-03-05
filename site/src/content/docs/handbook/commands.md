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

## Batch & publishing

| Command | What it does |
|---------|-------------|
| `crawl --org <name>` | Batch-curate all repos in a GitHub org |
| `crawl --from <file>` | Crawl repos listed in a text file |
| `publish --pages-repo <o/r>` | Push catalog to GitHub Pages |
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
