---
title: Getting Started
description: Install Artifact and run your first decision.
sidebar:
  order: 1
---

## Install

Install globally via npm:

```bash
npm install -g @mcptoolshop/artifact
```

Or run directly:

```bash
npx @mcptoolshop/artifact doctor
```

## First-run setup

Run the onboarding wizard and health check:

```bash
artifact init
artifact doctor
```

`init` creates your config directory and default settings. `doctor` checks that Node, Ollama, and git are available and reports any issues.

## Run on a repo

Point the Curator at any local repo:

```bash
artifact drive /path/to/repo
```

This scans the repo's source files, mines truth atoms (invariants, CLI flags, error strings, guarantees, sharp edges), computes an inference profile, and runs the Curator to select a tier and format. The output is written to `.artifact/decision_packet.json` in the target repo.

## The full ritual

Run the complete pipeline in one command:

```bash
artifact ritual /path/to/repo
```

This chains: drive → blueprint → review → catalog. Each step builds on the previous output.

## Without Ollama

If Ollama isn't running, every command still works. The deterministic fallback uses seeded rotation and inference weights to produce valid output. Add `--no-curator` to skip Ollama explicitly:

```bash
artifact drive . --no-curator
```
