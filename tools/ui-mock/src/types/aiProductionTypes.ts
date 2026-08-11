export const AI_PRODUCTION_ANALYSIS_STATUSES = [
  "NO_ANALYSIS",
  "QUEUED",
  "PROCESSING",
  "READY",
  "STALE",
  "ERROR",
  "LIMIT",
  "DISABLED",
] as const;

export type AIProductionAnalysisStatus = typeof AI_PRODUCTION_ANALYSIS_STATUSES[number];

export type AIProductionEvidence = {
  label: string;
  observed_at: string | null;
  completeness: "complete" | "partial" | "unavailable";
  url: string | null;
};

export type AIProductionRisk = {
  title: string;
  detail: string;
  severity: "low" | "medium" | "high" | "unknown";
};

export type AIProductionAnalysis = {
  schema_version: "ai_production_analysis_v1";
  analysis_summary: string;
  strengths: string[];
  risks: AIProductionRisk[];
  missing_data: string[];
  market_context: string;
  security_context: string;
  liquidity_context: string;
  holder_context: string;
  watch_items: string[];
  evidence: AIProductionEvidence[];
  generated_at: string;
  data_snapshot_at: string;
  freshness: "FRESH" | "STALE";
  analysis_version: string;
};

/** Safe browser contract. It deliberately contains no provider, queue, model or cost metadata. */
export type AIProductionAnalysisLookup = {
  schema_version: "ai_production_analysis_lookup_v1";
  status: AIProductionAnalysisStatus;
  analysis: AIProductionAnalysis | null;
  retry_after_seconds: number | null;
  is_last_known_good: boolean;
};

export type AIProductionAvailability = {
  schema_version: "ai_production_availability_v1";
  available: boolean;
};
