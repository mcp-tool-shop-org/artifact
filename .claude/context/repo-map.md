# Repo Map — @mcptoolshop/artifact

## Stack

- TypeScript (Node.js)
- 24 source modules, ~9,200 lines
- Node built-in test runner (14 test files)
- Dual entry: CLI (`bin/artifact`) + MCP server (`bin/artifact-mcp`)
- Dependencies: 2 (minimal)

## Entry points

| Entry | File | Purpose |
|-------|------|---------|
| CLI | `src/cli.ts` (1,433 lines) | Command router, all user-facing commands |
| MCP | `src/mcp.ts` (391 lines) | 9 tools + 3 resources via stdio transport |

## Module architecture

| Layer | Modules | Purpose |
|-------|---------|---------|
| Truth extraction | `truth.ts`, `source.ts` | Extract TruthAtoms from repos (local or remote via GitHub API) |
| Inference | `infer.ts` | Compute InferenceProfile (archetype, user, bottleneck, maturity, risk, tier weights) |
| Decision | `curator.ts`, `fallback.ts`, `ollama.ts` | Drive DecisionPacket via Ollama or deterministic fallback |
| Output | `blueprint.ts`, `review.ts`, `buildpack.ts`, `catalog.ts` | Generate downstream artifacts from decisions |
| Verification | `verify.ts` | Lint built artifacts against blueprint + truth bundle |
| Org governance | `org.ts`, `crawl.ts`, `publish.ts` | Seasons, bans, gaps, batch curation, GitHub Pages publish |
| State | `memory.ts`, `history.ts`, `built.ts` | Decision history, repo memory, built artifact tracking |
| Identity | `persona.ts`, `constants.ts`, `types.ts` | Curator personas, tier/format catalogs, shared types |

## Primary seam: Ollama fallback determinism

The highest-risk boundary is the decision path split between Curator (Ollama) and fallback (deterministic):

### Decision flow

```
CLI/MCP receives drive request
  → --no-curator flag? → driveFallback() directly
  → else: connect() to Ollama
    → connection succeeds?
      → curatorDrive() → valid JSON response?
        → yes: validated DecisionPacket (mode: 'ollama')
        → no: "output was invalid. Falling back." → driveFallback()
      → connection fails: "Ollama not available. Using fallback driver." → driveFallback()
```

### Three fallback trigger paths (cli.ts)

1. **Line 344**: `--no-curator` flag → direct fallback, no connection attempt
2. **Line 426**: Ollama responded but output invalid → fallback with stderr warning
3. **Line 430**: Ollama not available (connect() returned null) → fallback with stderr warning

### Fallback mechanics (fallback.ts)

- Seeded hash: `hash(repo_name + YYYY-MM-DD)` — deterministic, reproducible same-day
- Weighted tier selection from InferenceProfile if available
- History-aware: avoids recently used tiers, formats, atom IDs
- All hooks trace to real truth atoms
- Freshness payload uses real atoms or explicit "unknown — no X atoms found"
- `driver_meta.mode` = `'fallback'`, `host` = null, `model` = null

### Contract surfaces that must stay synchronized

| Surface | Ollama path | Fallback path | Must match? |
|---------|-------------|---------------|-------------|
| DecisionPacket schema | Yes | Yes | **Identical** |
| driver_meta.mode | `'ollama'` | `'fallback'` | **Must differ** |
| Hook atom_id validation | curator.ts L177-188 | fallback.ts L64-83 | Both require real atom IDs |
| Freshness "unknown" handling | curator.ts L216-231 | fallback.ts L155-173 | Both use "unknown — no X atoms found" |
| CLI stderr messaging | "online (model=X)" | "not available" or "invalid" | **Must be distinct and truthful** |

### Secondary risky surfaces

| Surface | Risk | Location |
|---------|------|----------|
| Exit code contract | 0/1/2 only; crawl exits 1 on any failure | cli.ts |
| Ollama model selection | Prefers instruct-tagged, skips code-only/embed, size cap | ollama.ts |
| Remote source caching | Disk cache keyed by SHA/ETag, TTL-based | source.ts |
| Promotion mandate override | Forces Promotion tier unless valid rejection provided | curator.ts L251-265 |
| Persona system | Voice rules per persona; affects review card tone | persona.ts |

## Validation

- `npm test` — 14 test files via Node `--test`
- `npm run build` — TypeScript compilation
- Key test: `fallback.test.ts` — hash determinism, seeded picking, weighted tier selection, packet validity
