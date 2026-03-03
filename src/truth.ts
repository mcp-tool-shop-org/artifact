/**
 * Truth Atom Extraction Engine (Phase 2)
 *
 * Scans repo files and extracts grounded, citeable facts.
 * Everything is deterministic — no LLM calls.
 * Every atom has a source pointer (file + line range).
 *
 * Phase 15: accepts a RepoSource abstraction so extraction
 * works against local filesystems OR the GitHub API.
 */

import { basename, extname } from 'node:path';
import { createHash } from 'node:crypto';
import type { TruthAtom, TruthBundle, AtomType } from './types.js';
import type { RepoSource } from './source.js';
import { LocalRepoSource } from './source.js';

const MAX_ATOMS_PER_TYPE = 10;
const SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.py', '.rs', '.go', '.cs', '.java', '.sh']);

// Generic nouns to filter out of core_objects
const BORING_NOUNS = new Set([
  'file', 'data', 'tool', 'system', 'repo', 'project', 'module', 'package',
  'function', 'method', 'class', 'type', 'value', 'result', 'error', 'string',
  'number', 'object', 'array', 'list', 'map', 'set', 'key', 'name', 'path',
  'config', 'option', 'options', 'setting', 'settings', 'param', 'parameter',
  'input', 'output', 'default', 'example', 'test', 'spec', 'docs', 'src',
  'index', 'main', 'app', 'lib', 'utils', 'helpers', 'common', 'shared',
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'will', 'can',
]);

/** Stable ID from atom content */
function atomId(type: AtomType, value: string, file: string, lineStart: number): string {
  const hash = createHash('sha256')
    .update(`${type}:${value}:${file}:${lineStart}`)
    .digest('hex')
    .slice(0, 12);
  return `${type}:${hash}`;
}

function makeAtom(
  type: AtomType,
  value: string,
  file: string,
  lineStart: number,
  lineEnd: number,
  confidence: number,
  tags: string[] = [],
): TruthAtom {
  return {
    id: atomId(type, value, file, lineStart),
    type,
    value: value.slice(0, 300), // cap length
    confidence,
    source: { file, lineStart, lineEnd },
    tags,
  };
}

/** Read a file via RepoSource. Returns lines + raw, or null. */
async function safeRead(
  source: RepoSource,
  relativePath: string,
): Promise<{ lines: string[]; raw: string } | null> {
  const raw = await source.readFile(relativePath);
  if (raw === null) return null;
  return { lines: raw.split('\n'), raw };
}

// ── Extractors ──────────────────────────────────────────────────

/** Extract from package.json */
async function extractPackageJson(source: RepoSource): Promise<TruthAtom[]> {
  const atoms: TruthAtom[] = [];
  const file = 'package.json';
  const data = await safeRead(source, file);
  if (!data) return atoms;

  try {
    const pkg = JSON.parse(data.raw) as Record<string, unknown>;

    if (typeof pkg.description === 'string' && pkg.description) {
      atoms.push(makeAtom('repo_tagline', pkg.description, file, 1, 1, 0.9, ['identity']));
    }
    if (typeof pkg.name === 'string') {
      atoms.push(makeAtom('core_object', pkg.name, file, 1, 1, 0.8, ['identity']));
    }
    if (pkg.bin && typeof pkg.bin === 'object') {
      for (const [cmd, _path] of Object.entries(pkg.bin as Record<string, string>)) {
        atoms.push(makeAtom('cli_command', cmd, file, 1, 1, 0.95, ['cli']));
      }
    }
    if (pkg.scripts && typeof pkg.scripts === 'object') {
      for (const name of Object.keys(pkg.scripts as Record<string, string>)) {
        if (['test', 'build', 'verify', 'lint', 'dev', 'start'].includes(name)) {
          atoms.push(makeAtom('cli_command', `npm run ${name}`, file, 1, 1, 0.7, ['cli', 'dev']));
        }
      }
    }
    if (Array.isArray(pkg.keywords)) {
      for (const kw of pkg.keywords as string[]) {
        if (typeof kw === 'string' && !BORING_NOUNS.has(kw.toLowerCase())) {
          atoms.push(makeAtom('core_object', kw, file, 1, 1, 0.5, ['keyword']));
        }
      }
    }
  } catch { /* malformed JSON */ }

  return atoms;
}

/** Extract from pyproject.toml (basic regex — no toml parser needed) */
async function extractPyproject(source: RepoSource): Promise<TruthAtom[]> {
  const atoms: TruthAtom[] = [];
  const file = 'pyproject.toml';
  const data = await safeRead(source, file);
  if (!data) return atoms;

  for (let i = 0; i < data.lines.length; i++) {
    const line = data.lines[i];
    const descMatch = line.match(/^description\s*=\s*"(.+?)"/);
    if (descMatch) {
      atoms.push(makeAtom('repo_tagline', descMatch[1], file, i + 1, i + 1, 0.9, ['identity']));
    }
    const nameMatch = line.match(/^name\s*=\s*"(.+?)"/);
    if (nameMatch) {
      atoms.push(makeAtom('core_object', nameMatch[1], file, i + 1, i + 1, 0.8, ['identity']));
    }
    // CLI entry points
    const scriptMatch = line.match(/^(\w[\w-]*)\s*=\s*"[\w.]+:[\w]+"/);
    if (scriptMatch) {
      atoms.push(makeAtom('cli_command', scriptMatch[1], file, i + 1, i + 1, 0.9, ['cli']));
    }
  }

  return atoms;
}

/** Extract from README.md */
async function extractReadme(source: RepoSource): Promise<TruthAtom[]> {
  const atoms: TruthAtom[] = [];
  const file = 'README.md';
  const data = await safeRead(source, file);
  if (!data) return atoms;

  const { lines } = data;

  // Tagline: first non-empty, non-heading paragraph
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith('#') && !line.startsWith('<') && !line.startsWith('[') && !line.startsWith('!') && line.length > 20) {
      atoms.push(makeAtom('repo_tagline', line, file, i + 1, i + 1, 0.85, ['identity']));
      break;
    }
  }

  // Purpose: sentences with "is a", "provides", "lets you", "enables"
  const purposeRe = /\b(is an?|provides|lets you|enables|designed to|built for|helps)\b/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (purposeRe.test(line) && line.length > 20 && line.length < 250) {
      atoms.push(makeAtom('core_purpose', line, file, i + 1, i + 1, 0.8, ['identity']));
      if (atoms.filter(a => a.type === 'core_purpose').length >= 3) break;
    }
  }

  // Sharp edges / caveats: TODO, NOTE, CAVEAT, WARNING, "does not", "won't", "requires"
  const sharpRe = /\b(TODO|NOTE|CAVEAT|WARNING|IMPORTANT|does not|doesn't|won't|cannot|must not|requires|limitation)\b/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (sharpRe.test(line) && line.length > 10 && !line.startsWith('#')) {
      atoms.push(makeAtom('sharp_edge', line, file, i + 1, i + 1, 0.7, ['caveat']));
    }
  }

  // Invariants / guarantees: "never", "always", "immutable", "deterministic", "idempotent"
  const invariantRe = /\b(never\s+\w+|always\s+\w+|immutable|deterministic|idempotent|guaranteed|atomic)\b/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (invariantRe.test(line) && line.length > 15 && !line.startsWith('#')) {
      atoms.push(makeAtom('invariant', line, file, i + 1, i + 1, 0.75, ['constraint']));
    }
  }

  // Anti-goals: "no telemetry", "no network", "no auto"
  const antiRe = /\b(no telemetry|no network|no tracking|no data|local[- ]only|offline|privacy)\b/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (antiRe.test(line) && line.length > 10) {
      atoms.push(makeAtom('anti_goal', line, file, i + 1, i + 1, 0.8, ['constraint', 'security']));
    }
  }

  // Core objects: bold terms + heading nouns
  const boldRe = /\*\*([A-Za-z][\w\s-]{2,30})\*\*/g;
  for (let i = 0; i < lines.length; i++) {
    let match;
    while ((match = boldRe.exec(lines[i])) !== null) {
      const term = match[1].trim().toLowerCase();
      if (!BORING_NOUNS.has(term) && term.length > 2) {
        atoms.push(makeAtom('core_object', match[1].trim(), file, i + 1, i + 1, 0.6, ['noun']));
      }
    }
  }

  // Headings as core objects
  for (let i = 0; i < lines.length; i++) {
    const hMatch = lines[i].match(/^#{2,3}\s+(.+)/);
    if (hMatch) {
      const heading = hMatch[1].trim();
      if (heading.length > 2 && heading.length < 60 && !BORING_NOUNS.has(heading.toLowerCase())) {
        atoms.push(makeAtom('core_object', heading, file, i + 1, i + 1, 0.5, ['heading']));
      }
    }
  }

  return atoms;
}

/** Extract from CHANGELOG.md */
async function extractChangelog(source: RepoSource): Promise<TruthAtom[]> {
  const atoms: TruthAtom[] = [];

  // Try CHANGELOG.md, then CHANGES.md
  for (const name of ['CHANGELOG.md', 'CHANGES.md']) {
    const data = await safeRead(source, name);
    if (!data) continue;

    const { lines } = data;
    let inLatestSection = false;
    let bulletCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect version headings
      if (/^##\s+\[?\d+\.\d+/.test(line) || /^##\s+unreleased/i.test(line)) {
        if (inLatestSection) break; // stop after first version section
        inLatestSection = true;
        continue;
      }

      if (inLatestSection && /^[-*]\s+/.test(line) && bulletCount < 5) {
        const bullet = line.replace(/^[-*]\s+/, '').trim();
        if (bullet.length > 5) {
          atoms.push(makeAtom('recent_change', bullet, name, i + 1, i + 1, 0.85, ['freshness']));
          bulletCount++;
        }
      }
    }

    if (atoms.length > 0) break; // found a changelog
  }

  return atoms;
}

/** Extract from source files — flags, env vars, errors, invariants */
async function extractSource(source: RepoSource): Promise<TruthAtom[]> {
  const atoms: TruthAtom[] = [];
  const sourceFiles = await source.listFiles(SOURCE_EXTENSIONS, 3);

  // Also use filenames themselves as core_objects
  for (const f of sourceFiles) {
    const name = basename(f.path, extname(f.path));
    if (name.length > 2 && !BORING_NOUNS.has(name.toLowerCase()) && !name.startsWith('index')) {
      atoms.push(makeAtom('core_object', name, f.path, 1, 1, 0.4, ['filename']));
    }
  }

  for (const file of sourceFiles) {
    const raw = await source.readFile(file.path);
    if (!raw) continue;

    const lines = raw.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // CLI flags: --something
      const flagMatches = line.matchAll(/--([a-zA-Z][\w-]{2,})/g);
      for (const m of flagMatches) {
        atoms.push(makeAtom('cli_flag', `--${m[1]}`, file.path, i + 1, i + 1, 0.9, ['cli']));
      }

      // Env vars: process.env['KEY'] or process.env.KEY or os.environ['KEY']
      const envMatches = line.matchAll(/(?:process\.env\[['"]|process\.env\.|environ\[['"])([A-Z][A-Z0-9_]{2,})/g);
      for (const m of envMatches) {
        atoms.push(makeAtom('config_key', m[1], file.path, i + 1, i + 1, 0.9, ['config']));
      }

      // Error strings: throw new Error('...')
      const errMatch = line.match(/(?:throw new \w*Error|Error)\(\s*['"`](.{10,100})['"`]/);
      if (errMatch) {
        atoms.push(makeAtom('error_string', errMatch[1], file.path, i + 1, i + 1, 0.8, ['error']));
      }

      // Invariant comments: INVARIANT, MUST, NEVER, ALWAYS, guarantee
      const invMatch = line.match(/\/[/*]\s*.*(INVARIANT|MUST\b|NEVER\b|ALWAYS\b|guarantee|idempotent|deterministic|immutable)/i);
      if (invMatch) {
        const comment = line.replace(/^\s*\/[/*]\s*/, '').trim();
        if (comment.length > 10) {
          atoms.push(makeAtom('invariant', comment, file.path, i + 1, i + 1, 0.7, ['constraint', 'code']));
        }
      }
    }
  }

  return atoms;
}

// ── Dedupe + quality ────────────────────────────────────────────

/** Dedupe atoms by value (case-insensitive), keeping highest confidence */
function dedupe(atoms: TruthAtom[]): TruthAtom[] {
  const seen = new Map<string, TruthAtom>();
  for (const atom of atoms) {
    const key = `${atom.type}:${atom.value.toLowerCase().trim()}`;
    const existing = seen.get(key);
    if (!existing || atom.confidence > existing.confidence) {
      seen.set(key, atom);
    }
  }
  return [...seen.values()];
}

/** Cap atoms per type, preferring higher confidence */
function capPerType(atoms: TruthAtom[]): TruthAtom[] {
  const byType = new Map<string, TruthAtom[]>();
  for (const atom of atoms) {
    const list = byType.get(atom.type) ?? [];
    list.push(atom);
    byType.set(atom.type, list);
  }

  const result: TruthAtom[] = [];
  for (const [, list] of byType) {
    list.sort((a, b) => b.confidence - a.confidence);
    result.push(...list.slice(0, MAX_ATOMS_PER_TYPE));
  }
  return result;
}

/** Prefer doc-sourced atoms over code-sourced when both exist for same value */
function preferDocs(atoms: TruthAtom[]): TruthAtom[] {
  // Docs = package.json, README.md, CHANGELOG.md, pyproject.toml
  const docFiles = new Set(['package.json', 'pyproject.toml', 'README.md', 'CHANGELOG.md', 'CHANGES.md']);

  const byValue = new Map<string, TruthAtom[]>();
  for (const atom of atoms) {
    const key = `${atom.type}:${atom.value.toLowerCase().trim()}`;
    const list = byValue.get(key) ?? [];
    list.push(atom);
    byValue.set(key, list);
  }

  const result: TruthAtom[] = [];
  for (const [, list] of byValue) {
    const docAtom = list.find(a => docFiles.has(a.source.file));
    result.push(docAtom ?? list[0]);
  }
  return result;
}

// ── Main pipeline ───────────────────────────────────────────────

/**
 * Extract all truth atoms from a repo. Deterministic, no LLM calls.
 * Accepts a RepoSource (local or remote) or a string path (backwards compat).
 */
export async function extractTruthBundle(input: string | RepoSource): Promise<TruthBundle> {
  const source: RepoSource = typeof input === 'string' ? new LocalRepoSource(input) : input;

  const rawAtoms: TruthAtom[] = [];
  let scannedFiles = 0;

  // Phase 1: structured files
  rawAtoms.push(...await extractPackageJson(source));
  rawAtoms.push(...await extractPyproject(source));
  scannedFiles += 2;

  // Phase 2: docs
  rawAtoms.push(...await extractReadme(source));
  rawAtoms.push(...await extractChangelog(source));
  scannedFiles += 2;

  // Phase 3: source
  const sourceAtoms = await extractSource(source);
  rawAtoms.push(...sourceAtoms);
  // Count unique source files
  const sourceFilesScanned = new Set(sourceAtoms.map(a => a.source.file)).size;
  scannedFiles += sourceFilesScanned;

  // Quality pipeline
  let atoms = dedupe(rawAtoms);
  atoms = preferDocs(atoms);
  atoms = capPerType(atoms);

  // Sort: highest confidence first, then by type
  atoms.sort((a, b) => b.confidence - a.confidence || a.type.localeCompare(b.type));

  // Stats
  const atomsByType: Record<string, number> = {};
  for (const atom of atoms) {
    atomsByType[atom.type] = (atomsByType[atom.type] ?? 0) + 1;
  }

  return {
    atoms,
    stats: {
      scanned_files: scannedFiles,
      atoms_by_type: atomsByType,
    },
  };
}
