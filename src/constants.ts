/**
 * Shared constants — TIERS and FORMAT_FAMILIES.
 * Extracted so that fallback.ts (and others) don't pull in curator → ollama.
 */

import type { Tier } from './types.js';

export const TIERS: Tier[] = ['Exec', 'Dev', 'Creator', 'Fun', 'Promotion'];

export const FORMAT_FAMILIES: Record<Tier, string[]> = {
  Exec: ['E1_brief', 'E2_system_map', 'E3_risk_placard', 'E4_roadmap_postcard', 'E5_tradeoffs_memo', 'E6_decision_matrix', 'E7_slo_snapshot', 'E8_cost_envelope', 'E9_stakeholder_faq', 'E10_changelog_narrative'],
  Dev: ['D1_quickstart_card', 'D2_integration_recipes', 'D3_debug_tree', 'D4_api_contract', 'D5_test_matrix', 'D6_perf_knobs', 'D7_compat_table', 'D8_release_checklist', 'D9_ref_implementation', 'D10_pit_of_success'],
  Creator: ['C1_logo_variants', 'C2_icon_set', 'C3_sticker_sheet', 'C4_cover_poster', 'C5_diagram_pack', 'C6_ui_gallery', 'C7_theme_palette', 'C8_badge_pack', 'C9_template_pack', 'C10_presskit_skeleton'],
  Fun: ['F1_board_game', 'F2_card_deck', 'F3_choose_adventure', 'F4_boss_fight', 'F5_puzzle_page', 'F6_achievements', 'F7_comic_storyboard', 'F8_tarot_deck', 'F9_museum_placard', 'F10_lore_page'],
  Promotion: ['P1_one_slide_pitch', 'P2_demo_gif_storyboard', 'P3_launch_post_kit', 'P4_before_after_proof', 'P5_screenshot_story', 'P6_comparison_chart', 'P7_faq_skeptics', 'P8_demo_script', 'P9_boilerplate_tagline', 'P10_presskit_checklist'],
};
