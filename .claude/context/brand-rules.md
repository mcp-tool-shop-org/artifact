# Brand Rules — @mcptoolshop/artifact

## Tone

Decisive and grounded. Artifact is a decision system, not an advisor. It picks a tier, format, and constraints — it does not suggest them. Output is structured, citeable, and traceable.

## Domain language

| Term | Meaning | Must not be confused with |
|------|---------|--------------------------|
| TruthAtom | A grounded fact extracted from a repo with file:line citation | Generic "metadata" or "info" |
| DecisionPacket | The structured output of a drive run (tier, formats, constraints, hooks, freshness) | A "recommendation" or "suggestion" |
| Curator | The Ollama-powered decision driver (JSON-in/JSON-out, not conversational) | A chatbot or advisor |
| Fallback | Deterministic seeded driver that operates without Ollama | A "degraded mode" or "error state" |
| InferenceProfile | Computed repo characteristics (archetype, maturity, risk, tier weights) | An "opinion" or "assessment" |
| Hook | A selected TruthAtom with a role assignment for artifact construction | A "tag" or "keyword" |
| Freshness payload | Three grounded facts (weird detail, recent change, sharp edge) from atoms | Invented "interesting facts" |
| Callout | Curator reasoning (veto, twist, pick, risk) — structured, not prose | "Commentary" or "thoughts" |

## Enforcement bans

### Language that must never appear in artifact output or docs

- "probably" / "likely" / "might be" when describing a decision (decisions are made, not hedged)
- "recommendation" / "suggestion" when the system has already decided
- "degraded" / "limited" when describing fallback mode (fallback is a valid operating mode, not an error)
- "approximate" / "rough estimate" when describing truth atoms (they trace to file:line or they don't exist)
- "we think" / "it seems" / "appears to be" (artifact doesn't think — it extracts, infers, and decides)

### Contamination risks

1. **Advisory drift** — artifact is not an advisor; if output starts reading like suggestions, the product identity is broken
2. **Fallback shame** — fallback mode is deterministic and valid; treating it as lesser undermines the dual-mode contract
3. **Freshness invention** — the moment any freshness payload value is not traceable to a real atom, the grounding contract is broken
4. **Conversational creep** — the Curator prompt is JSON-only; any drift toward natural language exchange weakens the contract
5. **Comfort language in failure** — when atoms are missing, "unknown" is correct; "we'll try our best" is not
