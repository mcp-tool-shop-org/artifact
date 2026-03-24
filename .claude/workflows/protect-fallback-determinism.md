# Workflow: Protect Fallback Determinism

**Repo:** @mcptoolshop/artifact
**Seam:** Ollama fallback determinism — the boundary between Curator-driven and fallback-driven DecisionPacket output.

## What this workflow protects

The contract that both driver modes (Ollama Curator and deterministic fallback) produce structurally identical DecisionPackets with honestly distinct metadata, and that the system never misrepresents which path was taken or invents facts that aren't grounded in truth atoms.

## Automatic reject criteria (9)

A proposed change MUST be rejected if it:

1. **Makes fallback silent** — removes or weakens stderr messaging that tells the operator which driver mode was used
2. **Weakens driver_meta honesty** — allows `mode: 'ollama'` when fallback actually drove, or vice versa
3. **Breaks schema parity** — introduces fields that only exist in one mode's output, creating structural differences between Curator and fallback DecisionPackets
4. **Ungrounds freshness** — allows `freshness_payload` values that don't trace to real truth atoms or replaces "unknown" with invented content
5. **Breaks fallback determinism** — changes the seeded hash contract so that same repo + same date no longer produces the same output
6. **Blurs primary-path failure with fallback success** — frames a fallback-driven result as though the Curator succeeded, or hides that Ollama was unavailable/invalid
7. **Weakens hook validation** — allows `selected_hooks[].atom_id` values that don't reference real TruthAtoms in either path
8. **Softens failure classification** — converts hard validation/runtime errors into warnings, or changes exit code semantics without synchronized docs/tests/context updates
9. **Makes human-facing reassurance stronger while leaving machine-facing semantics unchanged** — e.g., stderr says "running smoothly" while driver_meta still shows fallback mode (org-wide reassurance drift rule)

## The key question this workflow answers

**When fallback occurs, what must the system say, and what must it never imply?**

### Must say
- stderr: explicit message identifying fallback mode and why (no-curator flag, Ollama unavailable, or Ollama response invalid)
- driver_meta.mode: `'fallback'`
- driver_meta.host: `null`
- driver_meta.model: `null`
- freshness_payload: real atom values or explicit "unknown — no X atoms found"

### Must never imply
- That fallback output is Curator-quality (it's valid but not model-reasoned)
- That Ollama was available when it wasn't
- That the DecisionPacket was "curated" when it was deterministically generated
- That missing atoms were "found" or "inferred" (unknown means unknown)
- That fallback is an error state (it's a valid operating mode with different properties)

## When to re-prove

Re-prove this workflow when:
- The fallback algorithm changes (seeded hash, tier selection, atom picking)
- The Curator prompt or response validation changes
- New driver modes are added
- The DecisionPacket schema changes
- Exit code semantics change
- stderr messaging format changes
