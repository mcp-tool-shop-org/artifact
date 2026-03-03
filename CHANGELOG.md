# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.3.0] - 2026-03-03

### Added

- Phase 15: Remote Repo Analysis — `--remote owner/repo` flag analyzes GitHub repos without local clone
- Phase 16: Disk Cache + ETag Conditional Requests — warm cache = 0 API calls, blob SHA content-addressable caching
- Phase 17: Batch Crawl — `artifact crawl --org <name>` curates an entire GitHub org in one command
- `artifact crawl --from <file>` — crawl repos listed in a text file (one owner/repo per line)
- `--dry-run` — list repos that would be crawled without processing
- `--skip-curated` — skip repos that already have a decision packet
- `--remote-refresh` — force re-fetch, ignoring disk cache TTL
- Rate-limit aware backoff — sleeps until reset when GitHub API remaining is low
- Per-repo error isolation — failed repos don't crash the batch
- Auto catalog regeneration + org health stats at end of crawl
- Remote output dir: `~/.artifact/repos/<owner>/<repo>/`

## [1.2.0] - 2026-03-03

### Added

- Phase 14: Built Artifact Tracking
- Built store at `~/.artifact/org/built.json` — mutable tracking for built/verified artifacts
- `artifact built add <repo> <path...>` — attach artifact file paths
- `artifact built ls [repo-name]` — list built status across repos
- `artifact built status <repo-name>` — detailed tracking for one repo
- `artifact verify --record` — write verification results to built store
- HTML gallery: built-status badges (Verified ✓, Unverified □, Failed ✗) next to tier badges
- HTML gallery: built-status filter buttons
- Markdown catalog: "Built" column in timeline table
- JSON catalog: `built_status` field on entries

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
