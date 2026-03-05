---
title: Handbook
description: Everything you need to know about Artifact.
sidebar:
  order: 0
---

Welcome to the Artifact handbook. This is the complete guide to running the Curator, understanding decisions, and curating across an entire org.

## What's inside

- **[Getting Started](/artifact/handbook/getting-started/)** — Install and first run
- **[Commands](/artifact/handbook/commands/)** — Full CLI reference
- **[Personas](/artifact/handbook/personas/)** — The three built-in curator personas
- **[Org Curation](/artifact/handbook/org-curation/)** — Seasons, bans, gaps, and portfolio management
- **[Configuration](/artifact/handbook/configuration/)** — Environment variables and options
- **[Security](/artifact/handbook/security/)** — Threat model and data scope

## What is Artifact?

Artifact runs a freshness driver against any repo and outputs a structured decision packet — tier, format, constraints, hooks, and truth atoms with `file:line` citations. The Curator (local Ollama) drives the decision. If Ollama isn't available, a deterministic fallback produces valid output using inference profiles and seeded rotation.

[Back to landing page](/artifact/)
