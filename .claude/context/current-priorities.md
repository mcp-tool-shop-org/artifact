# Current Priorities — @mcptoolshop/artifact

## Status

Locked (Role OS lockdown 2026-03-24). Primary seam: Ollama fallback determinism.

## Classification

Lock candidate (now locked).

## Seam family

Fallback/provider truth — same family as any tool where a primary path and a fallback path must produce structurally identical output with honestly distinct metadata.

## Must-preserve invariants (10)

1. **DecisionPacket schema identity** — Ollama and fallback paths produce the same schema. No optional fields that only appear in one mode.
2. **driver_meta.mode honesty** — `'ollama'` vs `'fallback'` must always reflect the actual path taken. Never `'ollama'` when fallback drove.
3. **Hook atom_id validity** — every `selected_hooks[].atom_id` must reference a real TruthAtom. Both paths enforce this.
4. **Freshness grounding** — `freshness_payload` values trace to real atoms or are explicitly `"unknown — no X atoms found"`. Never invented.
5. **Fallback determinism** — same repo + same date = same fallback output. Seeded hash contract must not be broken.
6. **Stderr truth** — CLI must print distinct messages for: Ollama online, Ollama unavailable, Ollama invalid response, --no-curator skip. These are the operator's only signal.
7. **Exit code contract** — 0 = success, 1 = validation/runtime error, 2 = fatal. Crawl exits 1 if any repo failed.
8. **Localhost boundary** — Ollama connection is localhost-only. No external API calls except GitHub API for `--remote` (requires explicit token).
9. **No telemetry** — zero analytics, zero phone-home, zero data collection.
10. **Machine-consumable output** — all JSON to stdout, errors/status to stderr. No markdown wrapping in machine output paths.

## Banned detours

- Adding cloud/remote model providers (violates localhost boundary)
- Making fallback "smarter" with heuristics that break determinism
- Adding "quality scores" that imply fallback is worse (fallback is different, not worse)
- Introducing conversational Curator interactions (JSON-only contract)
- Softening "unknown" freshness values into invented alternatives
