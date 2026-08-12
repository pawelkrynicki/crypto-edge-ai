export const RESEARCH_CHECKLIST_STATES = [
  "AUTO_VERIFIED",
  "MANUAL_VERIFIED",
  "OPEN_EXTERNAL_TOOL",
  "MISSING_DATA",
  "NOT_APPLICABLE",
  "RED_FLAG",
] as const;

export type ResearchChecklistState = (typeof RESEARCH_CHECKLIST_STATES)[number];

export const RESEARCH_STEP_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;
export type ResearchStepNumber = (typeof RESEARCH_STEP_NUMBERS)[number];

/**
 * Stable keys are deliberately product-facing, not storage IDs. They are used
 * to attach a private research note to exactly one methodology check.
 */
export const RESEARCH_CHECKLIST_ITEM_KEYS = [
  "market_cap",
  "volume_24h",
  "liquidity",
  "pair_age",
  "volume_market_cap_ratio",
  "token_age",
  "honeypot",
  "top1_wallet",
  "contract_verified",
  "buy_tax",
  "sell_tax",
  "liquidity_unlocked",
  "tokensniffer",
  "anonymous_team_young_project",
  "suspicious_whitepaper",
  "goplus_coverage",
  "ownership",
  "mint",
  "blacklist",
  "whitelist",
  "sell_restriction",
  "proxy",
  "liquidity_lock",
  "defi_scanner",
  "top10_wallets",
  "liquidity_market_cap_ratio",
  "liquidity_lock_days",
  "holder_count",
  "developer_wallet",
  "liquidity_lock_end_date",
  "wallet_clustering",
  "volume_quality",
  "twitter",
  "telegram",
  "discord",
  "website",
  "team",
  "whitepaper",
  "roadmap",
  "security_scorecard",
  "onchain_scorecard",
  "social_scorecard",
  "narrative_scorecard",
  "research_readiness",
] as const;

export type ResearchChecklistItemKey = (typeof RESEARCH_CHECKLIST_ITEM_KEYS)[number];

export const PERSISTED_MANUAL_RESEARCH_STATES = [
  "MANUAL_VERIFIED",
  "RED_FLAG",
  "MISSING_DATA",
  "NOT_APPLICABLE",
] as const;

export type PersistedManualResearchState = (typeof PERSISTED_MANUAL_RESEARCH_STATES)[number];

export type PublicResearchEvidence = {
  schema_version: "research_evidence_sqlite_v1";
  chain: string;
  contract_address: string;
  step_number: ResearchStepNumber;
  item_key: ResearchChecklistItemKey;
  manual_state: PersistedManualResearchState;
  value_text: string | null;
  value_number: number | null;
  note: string | null;
  source_tool: string | null;
  evidence_url: string | null;
  observed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ResearchChecklistItem = {
  key: ResearchChecklistItemKey;
  step_number: ResearchStepNumber;
  state: ResearchChecklistState;
  automatic_state: ResearchChecklistState | null;
  value_text: string | null;
  value_number: number | null;
  threshold: string | null;
  source: "AUTOMATIC" | "MANUAL" | "UNAVAILABLE";
  manual_allowed: boolean;
  manual_evidence: PublicResearchEvidence | null;
};

export type ResearchChecklistStep = {
  number: ResearchStepNumber;
  state: ResearchChecklistState;
  resolved_checks: number;
  total_checks: number;
  items: ResearchChecklistItem[];
};

export type ResearchChecklistReadiness =
  | "RESEARCH_INCOMPLETE"
  | "MANUAL_VERIFICATION_REQUIRED"
  | "CRITICAL_RED_FLAG_PRESENT"
  | "EVIDENCE_COMPLETE_FOR_REVIEW";

export type ResearchChecklistView = {
  schema_version: "research_checklist_view_v1";
  chain: string;
  contract_address: string;
  manual_evidence_writable: boolean;
  current_step: ResearchStepNumber;
  completeness: {
    resolved_checks: number;
    total_checks: number;
    percentage: number;
    red_flags: number;
  };
  readiness: ResearchChecklistReadiness;
  steps: ResearchChecklistStep[];
};

export function isResearchChecklistItemKey(value: unknown): value is ResearchChecklistItemKey {
  return typeof value === "string" && RESEARCH_CHECKLIST_ITEM_KEYS.includes(value as ResearchChecklistItemKey);
}

export function isPersistedManualResearchState(value: unknown): value is PersistedManualResearchState {
  return typeof value === "string" && PERSISTED_MANUAL_RESEARCH_STATES.includes(value as PersistedManualResearchState);
}
