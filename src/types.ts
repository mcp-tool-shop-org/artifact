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

/** The decision packet — the only output that matters */
export interface DecisionPacket {
  repo_name: string;
  tier: Tier;
  format_candidates: string[];
  constraints: string[];
  must_include: string[];
  ban_list: string[];
  freshness_payload: FreshnessPayload;
  driver_meta: DriverMeta;
}

/** History entry — appended after each successful run */
export interface HistoryEntry {
  repo_name: string;
  tier: Tier;
  formats: string[];
  constraints: string[];
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
  truth_atoms: string[];
}
