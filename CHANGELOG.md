# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-03-03

### Added

- `artifact doctor` — environment health check (Node, config, Ollama, git)
- `artifact init` — first-run onboarding, creates `~/.artifact/config.json`
- `artifact about` — version, persona, and core rules
- `artifact --version` flag

## [1.0.0] - 2026-03-03

### Added

- Phase 1: Freshness Driver MVP — Curator (Ollama) + deterministic fallback
- Phase 2: Truth Extraction — TruthAtom mining from repo source files
- Phase 3: History + Rotation — tier/format/constraint deduplication
- Phase 4: Memory System — persistent repo + org memory with Ollama embeddings
- Phase 5: Web Intelligence — query menu, findings collection, brief synthesis
- Phase 6: Review Mode — 4-block editorial review card with atom citations
- Phase 7: Org-wide Curation — seasons, bans, gaps, signature moves, ledger
- Phase 8: Catalog System — season catalog generation (markdown + HTML gallery)
- Phase 9: Blueprint Pack — structured blueprint with quality gates + asset stubs
- Phase 10: Builder Pack + Verifier — prompt packet for chat LLMs + artifact linter
- Phase 11: Decision Inference Engine — deterministic tier selection from repo signals
- Phase 12: Persona System — Glyph, Mina, Vera personas with configurable identity
- Full ritual mode: `artifact ritual` runs drive + blueprint + review + catalog
