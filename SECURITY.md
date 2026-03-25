# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

Email: **64996768+mcp-tool-shop@users.noreply.github.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Version affected
- Potential impact

### Response timeline

| Action | Target |
|--------|--------|
| Acknowledge report | 48 hours |
| Assess severity | 7 days |
| Release fix | 30 days |

## Scope

This tool operates **locally only**.

- **Data touched:** repo source files (read-only scan), `~/.artifact/config.json` (read/write), `.artifact/` output directory in target repos
- **Data NOT touched:** no cloud APIs, no remote servers, no user credentials, no browser data
- **Network:** local Ollama only (`localhost:11434`). No external network calls. Fallback driver requires zero network.
- **No secrets handling** — does not read, store, or transmit credentials
- **No telemetry** is collected or sent
- **Permissions required:** filesystem read on target repo, filesystem write on `.artifact/` and `~/.artifact/`

### MCP Server Mode

When running as an MCP server (`artifact mcp` or `artifact-mcp`), additional scope applies:

- **Transport:** stdio only — no HTTP listener, no exposed ports
- **Remote access:** the `remote` param uses GitHub API (read-only) via `$GITHUB_TOKEN` if set — no write access
- **No persistent connections** — each tool call is stateless beyond the Ollama session
- **Same data boundaries** — MCP tools read/write the same paths as the CLI (`.artifact/`, `~/.artifact/`)
