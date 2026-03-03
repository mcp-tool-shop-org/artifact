# Ship Gate

> No repo is "done" until every applicable line is checked.
> Copy this into your repo root. Check items off per-release.

**Tags:** `[all]` every repo · `[npm]` `[pypi]` `[vsix]` `[desktop]` `[container]` published artifacts · `[mcp]` MCP servers · `[cli]` CLI tools

---

## A. Security Baseline

- [x] `[all]` SECURITY.md exists (report email, supported versions, response timeline) (2026-03-03)
- [x] `[all]` README includes threat model paragraph (data touched, data NOT touched, permissions required) (2026-03-03)
- [x] `[all]` No secrets, tokens, or credentials in source or diagnostics output (2026-03-03)
- [x] `[all]` No telemetry by default — state it explicitly even if obvious (2026-03-03)

### Default safety posture

- [x] `[cli|mcp|desktop]` SKIP: No dangerous actions (kill, delete, restart) exist — tool only writes to `.artifact/` and `~/.artifact/`
- [x] `[cli|mcp|desktop]` File operations constrained to `.artifact/` in target repo and `~/.artifact/` in home dir (2026-03-03)
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server

## B. Error Handling

- [x] `[all]` Errors follow structured pattern: descriptive message + hint + exit code (2026-03-03)
- [x] `[cli]` Exit codes: 0 ok · 1 user error · 2 runtime error (2026-03-03)
- [x] `[cli]` No raw stack traces — main catch prints `err.message` only (2026-03-03)
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[desktop]` SKIP: not a desktop app
- [ ] `[vscode]` SKIP: not a VS Code extension

## C. Operator Docs

- [x] `[all]` README is current: what it does, install, usage, supported platforms + runtime versions (2026-03-03)
- [x] `[all]` CHANGELOG.md (Keep a Changelog format) (2026-03-03)
- [x] `[all]` LICENSE file present and repo states support status (2026-03-03)
- [x] `[cli]` `--help` output accurate for all commands and flags (2026-03-03)
- [x] `[cli|mcp|desktop]` SKIP: Logging uses stderr for diagnostics, stdout for output — no configurable levels needed for this tool's scope
- [ ] `[mcp]` SKIP: not an MCP server
- [ ] `[complex]` SKIP: not complex enough for a handbook

## D. Shipping Hygiene

- [x] `[all]` `verify` script exists (`tsc --noEmit`) (2026-03-03)
- [x] `[all]` Version in manifest matches published version (2026-03-03)
- [x] `[all]` SKIP: No CI workflow yet — single-author CLI tool, local build verification
- [x] `[all]` SKIP: devDependencies are @types/node + typescript only — low dependency surface
- [x] `[npm]` `npm pack --dry-run` includes: dist/, README.md, CHANGELOG.md, LICENSE (2026-03-03)
- [x] `[npm]` `engines.node` set to `>=20` (2026-03-03)
- [x] `[npm]` Lockfile committed (2026-03-03)
- [ ] `[vsix]` SKIP: not a VS Code extension
- [ ] `[desktop]` SKIP: not a desktop app

## E. Identity (soft gate — does not block ship)

- [x] `[all]` Logo in README header (2026-03-03)
- [x] `[all]` Translations (polyglot-mcp, 7 languages) (2026-03-03)
- [x] `[org]` Landing page (@mcptoolshop/site-theme) (2026-03-03)
- [x] `[all]` GitHub repo metadata: description, homepage, topics (2026-03-03)

---

## Gate Rules

**Hard gate (A–D):** Must pass before any version is tagged or published.
If a section doesn't apply, mark `SKIP:` with justification — don't leave it unchecked.

**Soft gate (E):** Should be done. Product ships without it, but isn't "whole."

**Checking off:**
```
- [x] `[all]` SECURITY.md exists (2026-02-27)
```

**Skipping:**
```
- [ ] `[pypi]` SKIP: not a Python project
```
