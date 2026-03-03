import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeBans, shouldMandatePromotionPure } from '../org.js';
import type { LedgerEntry, Tier, SignatureMove } from '../types.js';

// ── Helpers ─────────────────────────────────────────────────────

function ledgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    repo_name: 'test-repo',
    tier: 'Dev' as Tier,
    format_family: 'D1_quickstart_card',
    constraints: [],
    hooks_used: ['H1_name'],
    season: 'none',
    signature_move: null,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('org curation', () => {
  it('computeBans — format used 2x triggers ban', () => {
    const ledger: LedgerEntry[] = [
      ledgerEntry({ format_family: 'D1_quickstart_card' }),
      ledgerEntry({ format_family: 'D5_test_matrix' }),
      ledgerEntry({ format_family: 'D1_quickstart_card' }),
      ledgerEntry({ format_family: 'F1_board_game' }),
      ledgerEntry({ format_family: 'E3_risk_placard' }),
    ];

    const bans = computeBans(ledger);
    const banItems = bans.map(b => b.item);
    assert.ok(banItems.includes('D1_quickstart_card'),
      `Expected D1_quickstart_card in bans: ${JSON.stringify(banItems)}`);
  });

  it('computeBans — same tier 3x in a row triggers tier ban', () => {
    const ledger: LedgerEntry[] = [
      ledgerEntry({ tier: 'Fun', format_family: 'F1_board_game' }),
      ledgerEntry({ tier: 'Fun', format_family: 'F2_card_deck' }),
      ledgerEntry({ tier: 'Dev', format_family: 'D3_debug_tree' }),
      ledgerEntry({ tier: 'Dev', format_family: 'D4_api_contract' }),
      ledgerEntry({ tier: 'Dev', format_family: 'D5_test_matrix' }),
    ];

    const bans = computeBans(ledger);
    const banItems = bans.map(b => b.item);
    assert.ok(banItems.includes('Dev'),
      `Expected Dev tier ban in: ${JSON.stringify(banItems)}`);
  });

  it('computeBans — short ledger (<3 entries) returns no bans', () => {
    const ledger: LedgerEntry[] = [
      ledgerEntry({ format_family: 'D1_quickstart_card' }),
      ledgerEntry({ format_family: 'D1_quickstart_card' }),
    ];

    const bans = computeBans(ledger);
    assert.equal(bans.length, 0);
  });

  it('shouldMandatePromotionPure — eligible when 8+ entries, no Promotion, <5 rejections', () => {
    assert.equal(shouldMandatePromotionPure(10, 0, 0), true);
    assert.equal(shouldMandatePromotionPure(8, 0, 4), true);
  });

  it('shouldMandatePromotionPure — not eligible when Promotion exists or too few entries', () => {
    // Has Promotion entries
    assert.equal(shouldMandatePromotionPure(10, 1, 0), false);
    // Too few entries
    assert.equal(shouldMandatePromotionPure(5, 0, 0), false);
    // Too many rejections
    assert.equal(shouldMandatePromotionPure(10, 0, 5), false);
  });
});
