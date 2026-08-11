import type { AIResearchBrief, AIResearchBriefLookup } from "../src/types/aiResearchTypes.js";
import type {
  AIProductionAnalysis,
  AIProductionAnalysisLookup,
  AIProductionAnalysisStatus,
} from "../src/types/aiProductionTypes.js";

/**
 * Converts the internal queue/result record to the only analysis shape exposed to CAMP users.
 * Internal identifiers, model/provider metadata, usage and raw error codes never cross this boundary.
 */
export function presentAIProductionLookup(value: AIResearchBriefLookup): AIProductionAnalysisLookup {
  const lastKnownGood = value.is_last_known_good === true || (Boolean(value.brief) && value.availability !== "READY");
  const status = lastKnownGood ? "STALE" : presentStatus(value.availability);
  const analysis = value.brief ? presentAnalysis(value.brief, status === "STALE") : null;
  return validateAIProductionLookup({
    schema_version: "ai_production_analysis_lookup_v1",
    status,
    analysis,
    retry_after_seconds: safeRetry(value.retry_after_seconds),
    is_last_known_good: lastKnownGood,
  });
}

export function presentAIProductionAvailability(available: boolean) {
  return { schema_version: "ai_production_availability_v1" as const, available };
}

export function presentAnalysis(brief: AIResearchBrief, stale = false): AIProductionAnalysis {
  const fact = (key: string) => brief.known_facts.find((item) => item.key === key);
  const factText = (key: string, fallback: string) => {
    const item = fact(key);
    if (!item) return fallback;
    const value = item.value === null ? fallback : String(item.value);
    return `${item.label}: ${value}. ${item.interpretation}`.trim();
  };
  const coverageText = (area: AIResearchBrief["coverage"][number]["area"], fallback: string) => {
    const item = brief.coverage.find((value) => value.area === area);
    return item?.explanation ?? fallback;
  };
  const strengths = brief.coverage
    .filter((item) => item.state === "sufficient")
    .map((item) => item.explanation)
    .filter((item) => item.length > 0)
    .slice(0, 6);
  const analysis: AIProductionAnalysis = {
    schema_version: "ai_production_analysis_v1",
    analysis_summary: brief.summary,
    strengths,
    risks: brief.risk_factors.map((risk) => ({ title: risk.title, detail: risk.explanation, severity: risk.severity })),
    missing_data: brief.missing_information.map((item) => `${item.label}: ${item.explanation}`),
    market_context: factText("market_cap_usd", factText("volume_24h_usd", coverageText("market_data", "Market data is not available in the supplied evidence."))),
    security_context: coverageText("security_coverage", "Security coverage is not available in the supplied evidence."),
    liquidity_context: factText("liquidity_usd", "Liquidity data is not available in the supplied evidence."),
    holder_context: factText("holders", "Holder data is not available in the supplied evidence."),
    watch_items: brief.next_actions.map((item) => `${item.label}: ${item.reason}`).slice(0, 8),
    evidence: brief.source_references.map((item) => ({
      label: item.label,
      observed_at: item.observed_at,
      completeness: item.completeness,
      url: item.url,
    })),
    generated_at: brief.generated_at,
    data_snapshot_at: brief.data_generated_at,
    freshness: stale || brief.research_state === "DATA_STALE" ? "STALE" : "FRESH",
    analysis_version: brief.schema_version,
  };
  return validateAIProductionAnalysis(analysis);
}

export function validateAIProductionLookup(value: AIProductionAnalysisLookup): AIProductionAnalysisLookup {
  if (value.schema_version !== "ai_production_analysis_lookup_v1"
    || !["NO_ANALYSIS", "QUEUED", "PROCESSING", "READY", "STALE", "ERROR", "LIMIT", "DISABLED"].includes(value.status)
    || (value.analysis !== null && !isProductionAnalysis(value.analysis))
    || (value.retry_after_seconds !== null && (!Number.isSafeInteger(value.retry_after_seconds) || value.retry_after_seconds < 1))
    || typeof value.is_last_known_good !== "boolean") {
    throw new Error("AI_PRODUCTION_PUBLIC_CONTRACT_INVALID");
  }
  return value;
}

export function validateAIProductionAnalysis(value: AIProductionAnalysis): AIProductionAnalysis {
  if (!isProductionAnalysis(value)) throw new Error("AI_PRODUCTION_OUTPUT_SCHEMA_INVALID");
  return value;
}

function isProductionAnalysis(value: AIProductionAnalysis): boolean {
  return value.schema_version === "ai_production_analysis_v1"
    && typeof value.analysis_summary === "string"
    && Array.isArray(value.strengths) && value.strengths.every((item) => typeof item === "string")
    && Array.isArray(value.risks) && value.risks.every((item) => typeof item.title === "string" && typeof item.detail === "string"
      && ["low", "medium", "high", "unknown"].includes(item.severity))
    && Array.isArray(value.missing_data) && value.missing_data.every((item) => typeof item === "string")
    && typeof value.market_context === "string" && typeof value.security_context === "string"
    && typeof value.liquidity_context === "string" && typeof value.holder_context === "string"
    && Array.isArray(value.watch_items) && value.watch_items.every((item) => typeof item === "string")
    && Array.isArray(value.evidence) && value.evidence.every((item) => typeof item.label === "string"
      && (item.observed_at === null || typeof item.observed_at === "string")
      && ["complete", "partial", "unavailable"].includes(item.completeness)
      && (item.url === null || typeof item.url === "string"))
    && typeof value.generated_at === "string" && typeof value.data_snapshot_at === "string"
    && (value.freshness === "FRESH" || value.freshness === "STALE")
    && typeof value.analysis_version === "string";
}

function presentStatus(value: AIResearchBriefLookup["availability"]): AIProductionAnalysisStatus {
  if (value === "ABSENT" || value === "INSUFFICIENT_DATA") return "NO_ANALYSIS";
  if (value === "QUEUED") return "QUEUED";
  if (value === "PROCESSING") return "PROCESSING";
  if (value === "READY") return "READY";
  if (value === "STALE") return "STALE";
  if (value === "COOLDOWN" || value === "RATE_LIMITED") return "LIMIT";
  if (value === "PROVIDER_DISABLED") return "DISABLED";
  return "ERROR";
}

function safeRetry(value: number | null): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
}
