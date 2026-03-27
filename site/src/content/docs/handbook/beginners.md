---
title: Beginners
description: New to Artifact? Start here for a step-by-step introduction.
sidebar:
  order: 99
---

New to Artifact? This page walks you through everything from installation to your first decision packet, one step at a time.

## What is Artifact?

Artifact is a repo signature decision system. Point it at any code repository and it scans the source files to extract grounded facts (called truth atoms), then selects a tier, format, and set of constraints for creating a documentation artifact about that repo.

Every decision is traceable. Truth atoms carry `file:line` citations back to the actual source code. Nothing is hallucinated -- if Artifact says a repo has a specific invariant or CLI flag, you can verify it at the exact line number.

Artifact uses a local Ollama model (the Curator) to make creative decisions about tier and format. If Ollama is not installed or not running, a deterministic fallback produces valid output using inference profiles and seeded rotation. No internet connection is required.

## Who is this for?

Artifact is designed for:

- **Developers maintaining open-source repos** who want structured, grounded documentation artifacts instead of generic README polish.
- **Org leads managing many repos** who need portfolio-wide consistency, diversity tracking, and batch curation across an entire GitHub organization.
- **AI agent builders** who want to give their agents access to truth extraction, inference profiling, and artifact verification via the MCP server.
- **Technical writers** who want a decision framework that forces specificity -- every claim traces to a real line of code.

You do not need ML experience or Ollama expertise. The tool works out of the box with no LLM at all.

## Installation

Install globally from npm:

```bash
npm install -g @mcptoolshop/artifact
```

This gives you two binaries: `artifact` (the CLI) and `artifact-mcp` (the MCP server).

Alternatively, run any command without installing:

```bash
npx @mcptoolshop/artifact doctor
```

**Requirements:**

- Node.js 20 or later
- git (for repo scanning)
- Ollama (optional -- the Curator uses it, but everything works without it)

## Your first run

### Step 1: Health check

Run the doctor command to verify your environment:

```bash
artifact doctor
```

This checks for Node.js, git, Ollama availability, and reports your config directory. Fix any issues it reports before continuing.

### Step 2: Initialize config

```bash
artifact init
```

This creates `~/.artifact/config.json` with default settings (persona set to Glyph).

### Step 3: Run the Curator on a repo

Navigate to any code repository and run:

```bash
artifact drive .
```

Or point at a repo path:

```bash
artifact drive /path/to/my-project
```

Artifact scans the repo, extracts truth atoms from `package.json`, `README.md`, `CHANGELOG.md`, and source files, computes an inference profile, then runs the Curator to select a tier and format.

The output is written to `.artifact/decision_packet.json` in the target repo.

### Step 4: Read the decision

Open `.artifact/decision_packet.json` to see what Artifact decided. The key fields are:

- **tier** -- one of Exec, Dev, Creator, Fun, or Promotion
- **format_candidates** -- 2-3 specific format templates from that tier
- **constraints** -- creative constraints like "monospace-only" or "uses-failure-mode"
- **freshness_payload** -- three real facts mined from your source code
- **selected_hooks** -- truth atom references that anchor the decision

### Step 5: Try the full ritual

For the complete pipeline in one command:

```bash
artifact ritual /path/to/my-project
```

This chains: drive (decision) then blueprint (action brief) then review (editorial card) then catalog (season view).

## Key concepts

### Truth atoms

Truth atoms are grounded facts extracted from repo source files. Each atom has a type, a value, and a `file:line` citation. Types include:

| Type | What it captures |
|------|-----------------|
| `repo_tagline` | The repo's description from package.json or first paragraph of README |
| `core_purpose` | Sentences describing what the repo does |
| `invariant` | Guarantees, constraints, and "never/always" rules from code comments |
| `cli_command` | Binary names and script commands |
| `cli_flag` | Command-line flags like `--no-curator` |
| `error_string` | Error messages from throw/Error statements |
| `sharp_edge` | Caveats, limitations, and warnings |
| `config_key` | Environment variables from `process.env` references |
| `recent_change` | Bullet points from the latest CHANGELOG section |
| `anti_goal` | Explicit non-goals (e.g., "no telemetry", "local-only") |
| `core_object` | Key nouns from headings, bold terms, and filenames |

### Tiers and formats

Every decision assigns one of five tiers, each with ten format templates:

| Tier | Purpose | Example formats |
|------|---------|----------------|
| **Exec** | Executive summaries, risk overviews | Brief, system map, risk placard |
| **Dev** | Developer references, integration guides | Quickstart card, debug tree, API contract |
| **Creator** | Visual assets, design artifacts | Logo variants, icon set, sticker sheet |
| **Fun** | Playful, creative artifacts | Board game, card deck, museum placard |
| **Promotion** | Marketing and adoption artifacts | One-slide pitch, demo script, launch post kit |

### Inference profiles

Before the Curator picks a tier, the inference engine computes a deterministic profile with no LLM needed. It answers: given this repo's archetype, maturity, risk, and primary bottleneck, what kind of artifact will move it forward most?

View a repo's profile:

```bash
artifact infer /path/to/repo
```

Add `--json` for machine-readable output.

### Personas

Three built-in personas shape the Curator's creative voice:

- **Glyph** (default) -- design gremlin. Playful, visual, slightly chaotic but with rules.
- **Mina** -- museum curator. Meticulous, collection-native, placard-style brevity.
- **Vera** -- verification oracle. Security-minded, evidence-first, warm but firm.

Check your active persona:

```bash
artifact whoami
```

Switch personas:

```bash
artifact config set agent_name vera
```

## Common workflows

### Analyze a single repo

```bash
artifact drive /path/to/repo
```

Add `--explain` to see why the inference engine chose those tier weights. Add `--curator-speak` to see the Curator's editorial callouts (veto, twist, pick, risk).

### Generate a blueprint

After running `drive`, generate a Blueprint Pack with format hints, constraint rules, and atom-seeded prompt slots:

```bash
artifact blueprint /path/to/repo
```

This writes `ARTIFACT_BLUEPRINT.md` and `blueprint.json` to `.artifact/` in the target repo.

### Verify a built artifact

After building an artifact (manually or with an LLM), verify it against the decision:

```bash
artifact verify /path/to/repo --artifact /path/to/my-artifact.md
```

This checks must-include items, truth atom citations, banned phrases, freshness grounding, and constraint compliance. Returns pass or fail with a fix list.

### Analyze a remote GitHub repo

No local clone needed:

```bash
artifact drive --remote owner/repo
```

Results are cached at `~/.artifact/repos/`. Set `GITHUB_TOKEN` for private repos and higher rate limits (5000 requests/hour vs 60).

### Batch-curate an entire org

```bash
artifact crawl --org my-github-org
```

This runs a full drive cycle on every non-fork, non-archived repo in the org.

## Troubleshooting

### "Ollama not available" warning

This is not an error. Artifact works without Ollama using the deterministic fallback. If you want the full Curator experience, install Ollama from [ollama.com](https://ollama.com) and run it. Any model works; Artifact auto-detects what is available.

### Empty or minimal truth atoms

If the decision packet has few atoms, the repo may be missing key signals. Artifact looks for:

- A `description` field in `package.json` or `pyproject.toml`
- Usage examples and invariant statements in `README.md`
- A `CHANGELOG.md` with versioned sections
- Source files with CLI flags, error messages, and constraint comments

Adding these to your repo improves extraction quality.

### Decision packet not written

Ensure you have write permissions to the target repo directory. Artifact writes to `.artifact/` inside the target repo. If running with `--remote`, the decision is returned as JSON but not persisted to disk.

### "No decision packet found"

Commands like `blueprint`, `review`, `verify`, and `buildpack` require a prior `drive` run. Run `artifact drive` first, then chain the subsequent commands.

## Next steps

- **[Commands](/artifact/handbook/commands/)** -- full CLI reference with all flags
- **[Configuration](/artifact/handbook/configuration/)** -- environment variables, tiers, repo types, output locations
- **[Personas](/artifact/handbook/personas/)** -- detailed persona profiles and how they shape decisions
- **[Org Curation](/artifact/handbook/org-curation/)** -- seasons, bans, and portfolio management
- **[MCP Server](/artifact/handbook/mcp-server/)** -- use Artifact as a tool server for AI agents
- **[Security](/artifact/handbook/security/)** -- threat model and data scope

## Glossary

- **Truth atom** -- A grounded fact extracted from a repo's source files. Each atom has a type (e.g., `invariant`, `cli_flag`), a value, a confidence score, and a `file:line` citation pointing to where it was found.
- **Tier** -- One of five categories (Exec, Dev, Creator, Fun, Promotion) that determines what kind of artifact to create for a repo.
- **Format family** -- A specific template within a tier. Each tier has ten format families (e.g., `D1_quickstart_card` in the Dev tier, `F2_card_deck` in the Fun tier).
- **Decision packet** -- The JSON output of a `drive` run. Contains the selected tier, format candidates, constraints, hooks, freshness payload, and Curator callouts. Written to `.artifact/decision_packet.json`.
- **Inference profile** -- A deterministic assessment computed without Ollama. Analyzes the repo's archetype, maturity, risk, primary user, and bottleneck to produce weighted tier recommendations.
- **Curator** -- The Ollama-powered decision engine that selects tier, format, and constraints. Uses truth atoms and inference profiles as input. Falls back to a deterministic algorithm when Ollama is unavailable.
- **Blueprint Pack** -- A generated action brief (`ARTIFACT_BLUEPRINT.md` + `blueprint.json`) that contains format hints, constraint rules, and atom-seeded prompt slots for building the artifact.
- **Persona** -- A named creative voice (Glyph, Mina, or Vera) that shapes the Curator's style. Affects callout tone, format preferences, and review card language.
- **Season** -- An org-level curation grouping. Decisions made during a season are tagged and tracked together. Seasons influence tier weights and format bias.
- **Freshness payload** -- Three hand-picked signals from the repo's source code: a weird true detail, a recent change, and a sharp edge. Forces the artifact to contain repo-specific content.
- **Constraint** -- A creative restriction applied to the artifact (e.g., "monospace-only", "uses-failure-mode", "one-page"). Drawn from four decks: Material, Mechanic, Tone, and Structure.
- **Hook** -- A truth atom selected by the Curator to anchor the artifact. Each hook references an atom ID and has a role (e.g., `invariant_hook`, `name_hook`).
- **Callout** -- One of four editorial signals from the Curator: veto (what to avoid), twist (the uniqueness lock), pick (the top format choice), and risk (what could go wrong).
- **MCP** -- Model Context Protocol. An open standard for connecting AI agents to tool servers. Artifact's MCP server exposes all core commands as structured tools.
