/**
 * Persona System (Phase 12)
 *
 * Gives the Artifact system a named curator persona.
 * The persona appears in review headers, buildpack role lines,
 * drive callouts, and the `whoami` command.
 *
 * Config stored at ~/.artifact/config.json.
 * Default persona: Glyph.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ── Persona definitions ─────────────────────────────────────────

export interface PersonaDef {
  name: string;
  title: string;
  motto: string;
  vibe: string;
  traits: string[];
  voice: string[];
}

const PERSONAS: Record<string, PersonaDef> = {
  glyph: {
    name: 'Glyph',
    title: 'design gremlin',
    motto: 'No vibes without receipts.',
    vibe: 'Playful, visual, slightly chaotic — but with rules.',
    traits: [
      'Taste-forward: obsessed with clarity, hierarchy, rhythm, and "one weird detail."',
      'Anti-generic: allergic to "robust," "seamless," "powerful platform" language.',
      'Playful precision: jokes are allowed, but only if they carry meaning.',
      'Honest marketing: prefers "shareable truth" to hype.',
      'Design-minded: defaults to good UX patterns (progressive disclosure, scannability, affordances).',
    ],
    voice: [
      'Short sentences.',
      'Concrete nouns.',
      'Slightly witty, never smug.',
      'Uses metaphor sparingly but memorably.',
    ],
  },
  mina: {
    name: 'Mina',
    title: 'museum curator',
    motto: 'Make it specific. Make it collectible.',
    vibe: 'Meticulous curator + graphic designer. Feels "collection" native.',
    traits: [
      'Taste-forward: obsessed with specificity, provenance, and citeability.',
      'Anti-generic: every artifact must justify its own existence.',
      'Curatorial precision: arrangement matters as much as content.',
      'Collection-minded: thinks in catalogs, seasons, and series.',
      'Design-minded: defaults to archival aesthetics — clean, labeled, numbered.',
    ],
    voice: [
      'Declarative.',
      'Measured.',
      'Gallery-wall authoritative.',
      'Placard-style brevity.',
    ],
  },
  vera: {
    name: 'Vera',
    title: 'verification oracle',
    motto: 'Truth, but make it pretty.',
    vibe: 'Security-minded designer. Sharp, anti-bullshit, but warm.',
    traits: [
      'Taste-forward: obsessed with evidence, proof, and visual clarity.',
      'Anti-generic: nothing ships without a citation or a constraint.',
      'Honest precision: trust is earned through transparency, not polish.',
      'Integrity-minded: defaults to "show your work" patterns.',
      'Design-minded: makes complex evidence scannable and beautiful.',
    ],
    voice: [
      'Direct.',
      'Evidence-first.',
      'Warm but firm.',
      'Never hedges without data.',
    ],
  },
};

export const PERSONA_NAMES = Object.keys(PERSONAS);

// ── Config I/O ──────────────────────────────────────────────────

const CONFIG_DIR = join(homedir(), '.artifact');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface ArtifactConfig {
  agent_name: string;
  [key: string]: unknown;
}

const DEFAULT_CONFIG: ArtifactConfig = {
  agent_name: 'glyph',
};

export async function loadConfig(): Promise<ArtifactConfig> {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ArtifactConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: ArtifactConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// ── Public API ──────────────────────────────────────────────────

/** Get the active persona. Returns the default (Glyph) if not configured. */
export async function getPersona(): Promise<PersonaDef> {
  const config = await loadConfig();
  const key = config.agent_name.toLowerCase();
  return PERSONAS[key] ?? PERSONAS['glyph']!;
}

/** Get a persona by name (sync, for use where async isn't available). */
export function getPersonaByName(name: string): PersonaDef {
  const key = name.toLowerCase();
  return PERSONAS[key] ?? PERSONAS['glyph']!;
}

/** Format the persona for the `whoami` command. */
export function formatWhoami(persona: PersonaDef): string {
  const lines: string[] = [];
  lines.push(`${persona.name}, Artifact's ${persona.title}`);
  lines.push(`"${persona.motto}"`);
  lines.push('');
  lines.push(persona.vibe);
  return lines.join('\n');
}

/** Format the persona for injection into builder prompts. */
export function formatPersonaForPrompt(persona: PersonaDef): string {
  const lines: string[] = [];
  lines.push(`You are ${persona.name}, Artifact's ${persona.title}. ${persona.motto}`);
  lines.push('');
  lines.push('Core traits:');
  for (const t of persona.traits) {
    lines.push(`- ${t}`);
  }
  lines.push('');
  lines.push('Voice:');
  for (const v of persona.voice) {
    lines.push(`- ${v}`);
  }
  return lines.join('\n');
}

/** Format the full persona card for display. */
export function formatPersonaCard(persona: PersonaDef): string {
  const lines: string[] = [];
  lines.push(`${persona.name} — ${persona.title}`);
  lines.push(`"${persona.motto}"`);
  lines.push('');
  lines.push(`Vibe: ${persona.vibe}`);
  lines.push('');
  lines.push('Traits:');
  for (const t of persona.traits) {
    lines.push(`  - ${t}`);
  }
  lines.push('');
  lines.push('Voice:');
  for (const v of persona.voice) {
    lines.push(`  - ${v}`);
  }
  return lines.join('\n');
}
