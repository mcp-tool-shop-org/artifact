<p align="center">
  <strong>artifact</strong>
</p>

<p align="center">
  Repo signature artifact decision system — checklist tree + Ollama-powered Curator freshness driver.
</p>

## What it does

`artifact` runs a freshness driver against any repo and outputs a structured decision packet — a JSON file that tells you which artifact tier, format family, constraints, and hooks to use for that repo's signature artifact.

The Curator (powered by a local Ollama model) silently drives the decision. If Ollama isn't available, a deterministic fallback produces valid output using seeded hashing and rotation.

## Install

```bash
npm install -g @mcptoolshop/artifact
```

Or run directly:

```bash
npx @mcptoolshop/artifact drive .
```

## Usage

```bash
# Run on current repo
artifact drive .

# Run on a specific repo path
artifact drive /path/to/repo

# Skip Ollama, use deterministic fallback
artifact drive . --no-curator

# Specify repo type for better tier selection
artifact drive . --type R1_tooling_cli
```

### Output

Writes `.artifact/decision_packet.json` and prints it to stdout:

```json
{
  "repo_name": "my-tool",
  "tier": "Fun",
  "format_candidates": ["F2_card_deck", "F9_museum_placard"],
  "constraints": ["monospace-only", "uses-failure-mode"],
  "must_include": ["one real invariant", "one failure mode", "one CLI flag"],
  "ban_list": ["F1_board_game"],
  "freshness_payload": {
    "weird_detail": "uses \\\\?\\ prefix to bypass Win32 parsing",
    "recent_change": "v1.0.3 added TOCTOU identity checks",
    "sharp_edge": "HMAC dot-separator must be in outer base64 layer"
  },
  "driver_meta": {
    "host": "http://127.0.0.1:11434",
    "model": "qwen2.5:14b",
    "mode": "ollama",
    "timestamp": "2026-03-03T12:00:00.000Z"
  }
}
```

### History & Rotation

Each run appends to `.artifact/history.json`. The Curator reads history to avoid repeating tiers, format families, and constraints across runs.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `OLLAMA_HOST` | Override Ollama endpoint (default: auto-detect) |
| `ARTIFACT_OLLAMA_MODEL` | Force a specific Ollama model |

### Repo Types

| Code | Type |
|------|------|
| `R1_tooling_cli` | Tooling/CLI |
| `R2_library_sdk` | Library/SDK |
| `R3_service_server` | Service/Server |
| `R4_template_scaffold` | Template/Scaffold |
| `R5_spec_protocol` | Spec/Protocol |
| `R6_demo_showcase` | Demo/Showcase |
| `R7_data_registry` | Data/Registry |
| `R8_product_app` | Product/App |
| `R9_brand_meta` | Brand/Meta |

## Threat Model

- **Ollama is local-only.** No data leaves your machine. The driver connects to `localhost` by default.
- **No telemetry.** No network calls except to local Ollama.
- **History is local.** `.artifact/history.json` lives in the repo and is gitignored by convention.
- **Fallback is deterministic.** If Ollama is down, output is seeded from repo name + date — reproducible, not random.

## License

MIT

---

Built by [MCP Tool Shop](https://mcp-tool-shop.github.io/)
