---
title: Security
description: Threat model and data scope.
sidebar:
  order: 6
---

## Threat model

- **Ollama is local-only.** No data leaves your machine. Connects to `localhost` only.
- **No telemetry.** No analytics. No phone-home.
- **No secrets.** Does not read, store, or transmit credentials.
- **History is local.** `.artifact/` lives in the repo, gitignored by convention.
- **Fallback is deterministic.** If Ollama is down, output is seeded from repo signals — reproducible, not random.
- **File scope:** reads repo source files, writes only to `.artifact/` and `~/.artifact/`.

## Data touched

Artifact reads source files in the target repo to extract truth atoms — invariants, CLI flags, error strings, guarantees, and sharp edges. It parses `package.json`, `pyproject.toml`, and similar manifests for metadata.

When using `--remote`, it fetches public repo data from the GitHub API. This requires a `GITHUB_TOKEN` for private repos and better rate limits.

## Data NOT touched

- No credentials are read, stored, or transmitted
- No network requests beyond local Ollama and optional GitHub API
- No telemetry is collected or sent
- No file contents are sent to external services

## Write scope

Artifact writes to exactly two locations:

1. **Per-repo:** `.artifact/` inside the target repo — contains `decision_packet.json`, generated blueprints, and review cards. This directory is typically gitignored.
2. **Global:** `~/.artifact/` in your home directory — contains config, org-level state (seasons, ledger, bans), memory entries, and cached remote repo data.

No other directories are written to. No temporary files are created outside these paths.

## Privacy command

View exactly what Artifact stores and where:

```bash
artifact privacy
```

This shows all storage locations and the data policy.

## Reset

Delete stored data when you're done:

```bash
artifact reset --cache    # Clear remote repo cache
artifact reset --org      # Clear org-level data
artifact reset --all      # Clear everything (with confirmation)
```
