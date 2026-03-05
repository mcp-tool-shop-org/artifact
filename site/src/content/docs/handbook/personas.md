---
title: Personas
description: The three built-in curator personas and how they shape decisions.
sidebar:
  order: 3
---

Artifact ships with three built-in curator personas. Each has a distinct voice and design sensibility that influences tier selection, format recommendations, and callout style.

## The three personas

| Persona | Role | Motto |
|---------|------|-------|
| **Glyph** | Design gremlin | No vibes without receipts. |
| **Mina** | Museum curator | Make it specific. Make it collectible. |
| **Vera** | Verification oracle | Truth, but make it pretty. |

## Switching personas

Check your current persona:

```bash
artifact whoami
```

Switch to a different one:

```bash
artifact config set agent_name vera
artifact config set agent_name mina
artifact config set agent_name glyph
```

The default persona is **Glyph**.

## How personas affect output

Each persona has different preferences for:

- **Tier selection** — Glyph favors bold tiers, Mina favors collectible formats, Vera favors verified/truth-heavy outputs
- **Format candidates** — the persona's taste influences which format templates are recommended
- **Callouts** — when `--curator-speak` is enabled, the persona's voice appears in veto, twist, pick, and risk callouts
- **Constraints** — certain constraints are weighted differently per persona

The persona is a creative filter, not a hard override. The inference engine provides the base signal; the persona nudges the final selection.
