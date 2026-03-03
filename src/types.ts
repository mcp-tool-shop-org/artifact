/** Repo type classification */
export type RepoType =
  | 'R1_tooling_cli'
  | 'R2_library_sdk'
  | 'R3_service_server'
  | 'R4_template_scaffold'
  | 'R5_spec_protocol'
  | 'R6_demo_showcase'
  | 'R7_data_registry'
  | 'R8_product_app'
  | 'R9_brand_meta'
  | 'unknown';

/** Artifact tier */
export type Tier = 'Exec' | 'Dev' | 'Creator' | 'Fun' | 'Promotion';

/** Valid reasons a Curator can reject a Promotion mandate */
export type PromotionRejection =
  | 'no_shareable_surface'
  | 'repo_private_or_internal'
  | 'insufficient_truth_atoms'
  | 'compliance_risk';

/** Hook type codes */
export type HookType = 'H1_name' | 'H2_core_loop' | 'H3_failure_mode' | 'H4_artifact_of_record' | 'H5_constraint';

/** A required hook with its source in the repo */
export interface RequiredHook {
  type: HookType;
  source: string;
}

/** Freshness payload — one weird true detail, one recent change, one sharp edge */
export interface FreshnessPayload {
  weird_detail: string;
  recent_change: string;
  sharp_edge: string;
}

/** Driver metadata — what ran, when, how */
export interface DriverMeta {
  host: string | null;
  model: string | null;
  mode: 'ollama' | 'fallback';
  timestamp: string;
}

// ── Truth Atom types (Phase 2) ──────────────────────────────────

/** What kind of fact this atom represents */
export type AtomType =
  // Repo identity
  | 'repo_tagline'
  | 'core_purpose'
  | 'core_object'
  // Mechanics & constraints
  | 'invariant'
  | 'guarantee'
  | 'anti_goal'
  // Developer reality
  | 'cli_command'
  | 'cli_flag'
  | 'error_string'
  | 'config_key'
  // Freshness
  | 'recent_change'
  | 'sharp_edge';

/** Where in the repo this atom was found */
export interface AtomSource {
  file: string;
  lineStart: number;
  lineEnd: number;
}

/** A single grounded fact extracted from the repo */
export interface TruthAtom {
  id: string;
  type: AtomType;
  value: string;
  confidence: number;
  source: AtomSource;
  tags: string[];
}

/** The full extraction result */
export interface TruthBundle {
  atoms: TruthAtom[];
  stats: {
    scanned_files: number;
    atoms_by_type: Record<string, number>;
  };
}

// ── Decision packet + context ───────────────────────────────────

/** Curator callouts — structured "talking" (not chat) */
export interface Callouts {
  veto: string;
  twist: string;
  pick: string;
  risk: string;
}

/** The decision packet — the only output that matters */
export interface DecisionPacket {
  repo_name: string;
  tier: Tier;
  format_candidates: string[];
  constraints: string[];
  must_include: string[];
  ban_list: string[];
  freshness_payload: FreshnessPayload;
  selected_hooks: SelectedHook[];
  callouts: Callouts;
  driver_meta: DriverMeta;
  // Phase 4: org curation (present when --curate-org)
  season?: string;
  org_bans_applied?: string[];
  org_gap_bias?: string[];
  signature_move?: string;
  // Phase 8: Promotion mandate
  promotion_mandate?: boolean;
  promotion_rejection?: PromotionRejection;
}

/** A hook chosen by the Curator, traced back to an atom */
export interface SelectedHook {
  atom_id: string;
  role: string;
}

/** History entry — appended after each successful run */
export interface HistoryEntry {
  repo_name: string;
  tier: Tier;
  formats: string[];
  constraints: string[];
  atom_ids_used: string[];
  timestamp: string;
}

/** Full history store */
export interface HistoryStore {
  entries: HistoryEntry[];
}

/** Input context for the driver */
export interface RepoContext {
  repo_name: string;
  repo_type: RepoType;
  truth_bundle: TruthBundle;
}

// ── Web Recommendations (Phase 3.1) ─────────────────────────────

/** A single web search result, structured and cited */
export interface WebFinding {
  id: string;
  query: string;
  title: string;
  source: { domain: string; url: string };
  published_at: string | null;
  retrieved_at: string;
  snippet: string;
  tags: string[];
  confidence: number;
}

/** A single recommendation derived from web findings */
export interface WebRecommendation {
  recommendation: string;
  why_now: string;
  apply_to: string;
  citations: string[];
}

/** Structured brief — what the Curator sees from the web */
export interface WebBrief {
  focus: string;
  recommendations: WebRecommendation[];
  finding_count: number;
  web_status: 'ok' | 'partial' | 'unavailable';
}

/** Cached web search result */
export interface WebCacheEntry {
  query: string;
  query_hash: string;
  findings: WebFinding[];
  retrieved_at: string;
  ttl_hours: number;
}

/** Full web cache store */
export interface WebCache {
  entries: Record<string, WebCacheEntry>;
}

/** Options for the web engine */
export interface WebOptions {
  enabled: boolean;
  cacheTtlHours: number;
  domains: string[];
  refresh: boolean;
}

// ── Org-wide Collection Curation (Phase 4) ───────────────────────

/** A signature move — one recognizable flourish per repo */
export type SignatureMove =
  | 'stamp_seal'
  | 'checksum_box'
  | 'margin_notes'
  | 'catalog_number'
  | 'card_back_pattern'
  | 'fold_marks';

/** Season — a curation lens, not a template */
export interface Season {
  name: string;
  started_at: string;
  tier_weights: Partial<Record<Tier, number>>;
  format_bias: string[];
  constraint_decks_enabled: string[];
  ban_list: string[];
  signature_moves: SignatureMove[];
  notes: string;
}

/** One line in the org ledger — one decision, one repo */
export interface LedgerEntry {
  repo_name: string;
  tier: Tier;
  format_family: string;
  constraints: string[];
  hooks_used: string[];
  season: string;
  signature_move: SignatureMove | null;
  timestamp: string;
}

/** Computed org status — coverage, diversity, gaps */
export interface OrgStatus {
  total_decisions: number;
  tier_distribution: Record<string, number>;
  format_distribution: Record<string, number>;
  constraint_frequency: Record<string, number>;
  signature_move_usage: Record<string, number>;
  current_season: string | null;
  recent_bans: string[];
  gaps: string[];
  diversity_score: number;
}

/** Curation brief — compact input for the Curator prompt */
export interface CurationBrief {
  season: Season | null;
  org_bans: Array<{ item: string; reason: string }>;
  org_gaps: string[];
  assigned_move: SignatureMove | null;
  promotion_mandate: boolean;
  formatted: string;
}
