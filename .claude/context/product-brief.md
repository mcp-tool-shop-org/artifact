# Product Brief — @mcptoolshop/artifact

## What this is

Repo signature artifact decision system. Extracts grounded truth atoms from any repo (file:line citations), computes an inference profile (archetype, maturity, risk, tier weights), then drives a structured DecisionPacket that tells you which tier, format, constraints, and hooks to use for building a repo artifact. Operates via CLI and MCP server.

Two driver modes: Ollama-powered Curator (localhost LLM, JSON-in/JSON-out) and deterministic fallback (seeded hashing + truth atoms, no model required).

## Type

CLI + MCP server (dual interface, identical output contract)

## Core value

Every decision traces to a truth atom with a file:line citation. No invented claims. No ungrounded freshness. No hallucinated repo facts.

## What it is not

- Not a conversational tool — the Curator is JSON-in/JSON-out, not chat
- Not a content generator — it decides what to build, not builds it
- Not a linter — verify command checks artifacts against blueprints, but the product is the decision system
- Not cloud-dependent — localhost Ollama only, no external API calls, no telemetry

## Anti-thesis (7 statements)

1. Must never present fallback output as equivalent to Curator output — mode must be visible and distinct
2. Must never produce a DecisionPacket with hooks that don't trace to real atom IDs
3. Must never hide Ollama unavailability — the system must say when it's using fallback
4. Must never soften failure classification to make output "feel" more complete
5. Must never let the freshness payload contain invented facts — unknown is the correct answer when atoms are missing
6. Must never blur checker/runtime failure with decision-quality degradation
7. Must never trade deterministic fallback reproducibility for "more interesting" output

## Highest-risk seam

**Ollama fallback determinism** — the boundary between Curator-driven and fallback-driven output is the seam where truth is most likely to drift. Generic orchestration will try to make fallback "friendlier" or less visibly degraded, which is exactly how determinism and truthfulness get lost.
