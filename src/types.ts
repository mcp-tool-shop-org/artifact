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
