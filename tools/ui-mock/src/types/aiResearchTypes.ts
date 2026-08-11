export const AI_RESEARCH_SCHEMA_VERSION = "ai_research_brief_v2" as const;
// One shared heavy generation carries evidence-bound English and Polish wording.
// Request locale never owns the cache key or triggers a second provider call.
export const AI_RESEARCH_PROMPT_VERSION = "ai_research_prompt_v4" as const;
export const AI_ANALYSIS_QUEUE_SCHEMA_VERSION = "ai_analysis_queue_v1" as const;
export const AI_RESEARCH_DATA_CONTRACT_VERSION = "ai_research_data_contract_v2" as const;
export const AI_RESEARCH_TARGET_MODEL = "gpt-5-mini" as const;

export const AI_ANALYSIS_STATUSES = [
  "ABSENT",
  "QUEUED",
  "PROCESSING",
  "READY",
  "STALE",
  "FAILED",
  "SUSPENDED",
] as const;

export const AI_ANALYSIS_REQUEST_OUTCOMES = [
  "READY",
  "QUEUED",
  "PROCESSING",
  "ALREADY_EXISTS",
  "COOLDOWN",
  "DATA_STALE",
  "DATA_UNAVAILABLE",
  "PROVIDER_DISABLED",
  "SUSPENDED",
  "RATE_LIMITED",
] as const;

export const AI_RESEARCH_STATES = [
  "INSUFFICIENT_DATA",
  "BASIC_FILTERS_FAILED",
  "KEEP_OBSERVING",
  "MANUAL_VERIFICATION_REQUIRED",
  "OWNER_DECISION_REQUIRED",
  "ESTABLISHED_RESEARCH",
  "DATA_STALE",
] as const;

export const AI_RESEARCH_ACTION_TYPES = [
  "OPEN_VERIFICATION",
  "OPEN_DEXSCREENER",
  "OPEN_EXPLORER",
  "REVIEW_SECURITY",
  "WAIT_FOR_CHECKPOINT",
  "REVIEW_CHECKPOINTS",
  "OPEN_REPORT",
  "OWNER_REVIEW",
  "RETURN_TO_RADAR",
] as const;

export const AI_RESEARCH_RISK_SEVERITIES = ["low", "medium", "high", "unknown"] as const;
export const AI_RESEARCH_COVERAGE_STATES = [
  "sufficient",
  "partial",
  "insufficient",
  "unavailable",
] as const;

export type AIResearchState = typeof AI_RESEARCH_STATES[number];
export type AIResearchActionType = typeof AI_RESEARCH_ACTION_TYPES[number];
export type AIResearchRiskSeverity = typeof AI_RESEARCH_RISK_SEVERITIES[number];
export type AIResearchCoverageState = typeof AI_RESEARCH_COVERAGE_STATES[number];
export type AIResearchLocale = "pl" | "en";
export type AIResearchStorageLanguage = AIResearchLocale | "bilingual";
export type AIResearchBilingualText = { en: string; pl: string };
export type AIAnalysisStatus = typeof AI_ANALYSIS_STATUSES[number];
export type AIAnalysisRequestOutcome = typeof AI_ANALYSIS_REQUEST_OUTCOMES[number];
export type AIResearchGenerationBlockedReason =
  | "LIVE_CALL_BUDGET_EXHAUSTED"
  | "LIVE_CALL_BUDGET_INVALID"
  | "REVIEW_STORE_REQUIRED";
export type AIResearchAvailabilityState =
  | "ABSENT"
  | "QUEUED"
  | "PROCESSING"
  | "READY"
  | "STALE"
  | "FAILED"
  | "SUSPENDED"
  | "COOLDOWN"
  | "PROVIDER_DISABLED"
  | "INSUFFICIENT_DATA"
  | "RATE_LIMITED"
  | "ERROR";

export type AIResearchSourceReference = {
  id: string;
  source_type:
    | "scanner_snapshot"
    | "follow_up_checkpoint"
    | "basic_filters"
    | "security_status"
    | "established_membership"
    | "methodology"
    | "dexscreener"
    | "explorer"
    | "report";
  label: string;
  observed_at: string | null;
  completeness: "complete" | "partial" | "unavailable";
  url: string | null;
};

export type AIResearchKnownFact = {
  key: string;
  label: string;
  value: string | number | boolean | null;
  interpretation: AIResearchBilingualText;
  source_reference_ids: string[];
};

export type AIResearchRiskFactor = {
  severity: AIResearchRiskSeverity;
  category: string;
  title: string;
  explanation: AIResearchBilingualText;
  evidence_reference_ids: string[];
};

export type AIResearchMissingInformation = {
  key: string;
  label: string;
  explanation: AIResearchBilingualText;
  source_reference_ids: string[];
};

export type AIResearchNextAction = {
  action_type: AIResearchActionType;
  label: string;
  priority: "primary" | "secondary" | "tertiary";
  reason: AIResearchBilingualText;
  target_type: "internal_route" | "external_url" | "status";
  target_reference: string;
};

export type AIResearchStatusChangeCondition = {
  key: string;
  label: string;
  explanation: AIResearchBilingualText;
  source_reference_ids: string[];
};

export type AIResearchCoverageItem = {
  area: "market_data" | "basic_filters" | "security_coverage" | "information_completeness";
  state: AIResearchCoverageState;
  explanation: string;
};

export type AIResearchBrief = {
  schema_version: typeof AI_RESEARCH_SCHEMA_VERSION;
  analysis_id: string;
  identity: { chain: string; contract_address: string };
  analysis_language: "bilingual";
  snapshot_fingerprint: string;
  prompt_version: typeof AI_RESEARCH_PROMPT_VERSION;
  model: string;
  generated_at: string;
  data_generated_at: string;
  research_state: AIResearchState;
  summary: AIResearchBilingualText;
  known_facts: AIResearchKnownFact[];
  risk_factors: AIResearchRiskFactor[];
  missing_information: AIResearchMissingInformation[];
  next_actions: AIResearchNextAction[];
  status_change_conditions: AIResearchStatusChangeCondition[];
  source_references: AIResearchSourceReference[];
  coverage: AIResearchCoverageItem[];
  checkpoints: Array<{ day: 1 | 3 | 7 | 14 | 30; state: "completed" | "current" | "future" | "skipped" }>;
  token_usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  input_hash: string;
  output_hash: string;
  render_preview: boolean;
};

export type AIResearchBriefLookup = {
  schema_version: "ai_research_lookup_v1";
  availability: AIResearchAvailabilityState;
  provider_mode: "DISABLED" | "OPENAI";
  brief: AIResearchBrief | null;
  retry_after_seconds: number | null;
  error_code: string | null;
  generation_blocked_reason?: AIResearchGenerationBlockedReason | null;
  queue_schema_version?: typeof AI_ANALYSIS_QUEUE_SCHEMA_VERSION;
  analysis_id?: string | null;
  cache_key?: string | null;
  queue_status?: AIAnalysisStatus;
  request_outcome?: AIAnalysisRequestOutcome | null;
  shared_result?: true;
  is_last_known_good?: boolean;
};

export type AIResearchReviewMetrics = {
  schema_version: "ai_research_review_metrics_v1";
  analysis_id: string;
  model: string;
  prompt_version: typeof AI_RESEARCH_PROMPT_VERSION;
  snapshot_fingerprint: string;
  generated_at: string;
  data_generated_at: string;
  latency_ms: number;
  prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_hit: false;
  validation_status: "VALID";
  request_id: string | null;
};

export type AIResearchReviewMetricsLookup = {
  schema_version: "ai_research_review_metrics_lookup_v1";
  metrics: AIResearchReviewMetrics | null;
};

export type AIResearchProviderStatus = {
  schema_version: "ai_research_status_v1";
  provider_mode: "DISABLED" | "OPENAI";
  available: boolean;
  model_configured: boolean;
  render_preview: boolean;
};

export type AIResearchGenerateRequest = {
  chain: string;
  contract_address: string;
  locale: AIResearchLocale;
  idempotency_key: string;
};
