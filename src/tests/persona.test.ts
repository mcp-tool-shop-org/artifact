import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPersonaByName, formatWhoami, formatAbout } from '../persona.js';

// ── Tests ───────────────────────────────────────────────────────

describe('persona system', () => {
  it('getPersonaByName — returns correct persona for valid name', () => {
    const glyph = getPersonaByName('glyph');
    assert.equal(glyph.name, 'Glyph');

    const mina = getPersonaByName('mina');
    assert.equal(mina.title, 'museum curator');
  });

  it('getPersonaByName — invalid name falls back to Glyph', () => {
    const persona = getPersonaByName('nonexistent');
    assert.equal(persona.name, 'Glyph');
  });

  it('getPersonaByName — case insensitive', () => {
    const persona = getPersonaByName('VERA');
    assert.equal(persona.name, 'Vera');
  });

  it('formatWhoami — contains name, title, motto', () => {
    const persona = getPersonaByName('glyph');
    const output = formatWhoami(persona);
    assert.ok(output.includes('Glyph'), 'Should contain name');
    assert.ok(output.includes('design gremlin'), 'Should contain title');
    assert.ok(output.includes('No vibes without receipts'), 'Should contain motto');
  });

  it('formatAbout — contains version and persona name', () => {
    const persona = getPersonaByName('glyph');
    const output = formatAbout('1.4.0', persona);
    assert.ok(output.includes('v1.4.0'), 'Should contain version');
    assert.ok(output.includes('Glyph'), 'Should contain persona name');
  });
});
