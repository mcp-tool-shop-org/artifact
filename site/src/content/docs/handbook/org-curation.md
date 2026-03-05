---
title: Org Curation
description: Seasons, bans, gaps, and portfolio management across your org.
sidebar:
  order: 4
---

Artifact supports org-wide curation for managing artifact decisions across an entire GitHub organization.

## Seasons

Seasons group decisions into themed batches:

```bash
# List available seasons
artifact season list

# Activate a season
artifact season set launch_week

# Check season status
artifact season status

# End the current season
artifact season end
```

During an active season, every `drive` and `ritual` command tags its output with the season name. The catalog command generates a season-scoped view.

## Org status

Get a bird's-eye view of your portfolio:

```bash
artifact org status
```

This reports:

- **Coverage** — how many repos have been curated vs. total
- **Diversity score** — how varied the tier/format selections are across repos
- **Gaps** — repos that haven't been curated or have stale decisions

## Decision ledger

View recent decisions across the org:

```bash
artifact org ledger 20
```

Shows the last N decisions with repo name, tier, format, and timestamp.

## Auto-bans

The system tracks patterns that should be avoided:

```bash
artifact org bans
```

Auto-bans prevent the same tier/format combination from being used too often across repos, maintaining diversity.

## Batch crawling

Curate an entire GitHub org at once:

```bash
artifact crawl --org mcp-tool-shop-org
```

Or provide a list of repos:

```bash
artifact crawl --from repos.txt
```

Each repo gets a full drive cycle. Results are cached and deduplicated. Requires `GITHUB_TOKEN` for private repos and higher rate limits.

## Publishing

Push the catalog to a GitHub Pages repo:

```bash
artifact publish --pages-repo mcp-tool-shop-org/artifact-gallery
```
