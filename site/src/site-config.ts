import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'Artifact',
  description: 'Repo signature artifact decision system — Curator freshness driver + deterministic inference engine.',
  logoBadge: 'A',
  brandName: 'artifact',
  repoUrl: 'https://github.com/mcp-tool-shop-org/artifact',
  npmUrl: 'https://www.npmjs.com/package/@mcptoolshop/artifact',
  footerText: 'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'CLI Tool',
    headline: 'Artifact.',
    headlineAccent: 'Repo-grounded decisions.',
    description: 'Runs a freshness driver against any repo and outputs a structured decision packet — tier, format, constraints, hooks, truth atoms with file:line citations.',
    primaryCta: { href: '#usage', label: 'Get started' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Install', code: 'npm install -g @mcptoolshop/artifact' },
      { label: 'Run', code: 'artifact drive /path/to/repo' },
      { label: 'Ritual', code: 'artifact ritual . --explain' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'How it works',
      subtitle: 'Every decision traces back to real code.',
      features: [
        {
          title: 'Truth Atoms',
          desc: 'Mines invariants, CLI flags, error strings, guarantees, and sharp edges from your actual source files — with file:line citations.',
        },
        {
          title: 'Inference Engine',
          desc: 'Deterministic heuristics detect repo archetype, bottleneck, maturity, and risk — then compute weighted tier probabilities. No Ollama needed.',
        },
        {
          title: 'Curator Driver',
          desc: 'Local Ollama model drives creative tier/format selection informed by repo signals, memory, web intelligence, and org-wide curation seasons.',
        },
        {
          title: 'Persona System',
          desc: 'Three built-in curator personas — Glyph, Mina, Vera — each with distinct voice and design sensibility. Configurable via CLI.',
        },
        {
          title: 'Org Curation',
          desc: 'Seasons, auto-bans, gap analysis, signature moves, and diversity scoring across your entire repo portfolio.',
        },
        {
          title: 'Fallback Always Works',
          desc: 'If Ollama is offline, a deterministic fallback uses seeded rotation and inference weights. Every run produces valid output.',
        },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Usage',
      cards: [
        {
          title: 'Setup',
          code: `# Install globally
npm install -g @mcptoolshop/artifact

# First-run onboarding
artifact init
artifact doctor`,
        },
        {
          title: 'Drive a repo',
          code: `# Run the Curator on a repo
artifact drive /path/to/repo

# See why this tier was chosen
artifact drive . --explain

# Full ritual: drive + blueprint + review + catalog
artifact ritual .`,
        },
        {
          title: 'Inspect & build',
          code: `# View inference profile (no Ollama)
artifact infer .

# Generate builder prompt for chat LLMs
artifact buildpack .

# Lint a generated artifact
artifact verify . --artifact ./output.md`,
        },
        {
          title: 'Org-wide curation',
          code: `# Activate a season
artifact season set launch_week

# Check portfolio diversity
artifact org status

# View decision history
artifact org ledger 20`,
        },
      ],
    },
    {
      kind: 'data-table',
      id: 'commands',
      title: 'Commands',
      columns: ['Command', 'Description'],
      rows: [
        ['`doctor`', 'Environment health check'],
        ['`init`', 'First-run onboarding'],
        ['`about`', 'Version, persona, core rules'],
        ['`drive [path]`', 'Run Curator freshness driver'],
        ['`infer [path]`', 'Compute inference profile'],
        ['`ritual [path]`', 'Full ritual: drive + blueprint + review + catalog'],
        ['`blueprint [path]`', 'Generate Blueprint Pack'],
        ['`buildpack [path]`', 'Emit builder prompt packet'],
        ['`verify [path]`', 'Lint artifact against truth bundle'],
        ['`review [path]`', 'Print 4-block editorial review card'],
        ['`whoami`', 'Show active persona'],
        ['`org status`', 'Portfolio diversity + gaps'],
      ],
    },
  ],
};
