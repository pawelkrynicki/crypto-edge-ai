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

export type AIProductionInsight = {
  title: string;
  detail: string;
};

export type AIProductionResearchStep = AIProductionInsight & {
  priority: "primary" | "secondary" | "tertiary";
};

export type AIProductionFilterFailure = {
  label: string;
  value: string;
  requirement: string;
  status: string;
};

export type AIProductionGuidanceAction = {
  title: string;
  why: string;
  resolves: string;
  cta: {
    label: string;
    href: string;
    external: boolean;
  } | null;
};

/** Deterministic research workflow guidance. It contains no provider output or lifecycle decision. */
export type AIProductionResearchGuidance = {
  current_step: {
    number: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    title: string;
    posture: string;
    posture_detail: string;
  };
  blockers: AIProductionInsight[];
  filter_failures: AIProductionFilterFailure[];
  actions: AIProductionGuidanceAction[];
  unlock_conditions: string[];
};

export type AIProductionAnalysis = {
  schema_version: "ai_production_analysis_v3";
  analysis_summary: string;
  confirmed_findings: AIProductionInsight[];
  risks: AIProductionRisk[];
  missing_data: AIProductionInsight[];
  market_context: AIProductionInsight;
  security_context: AIProductionInsight;
  liquidity_context: AIProductionInsight;
  holder_context: AIProductionInsight;
  research_guidance: AIProductionResearchGuidance;
  next_research_steps: AIProductionResearchStep[];
  reassessment_signals: AIProductionInsight[];
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
