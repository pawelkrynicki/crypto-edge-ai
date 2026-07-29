import { AIResearchDataSourceError } from "../services/aiResearchDataSource";
import type { AIResearchBriefLookup } from "../types/aiResearchTypes";

export function applyAIResearchGenerationFailure(
  previous: AIResearchBriefLookup | null,
  error: unknown,
): AIResearchBriefLookup {
  const knownError = error instanceof AIResearchDataSourceError ? error : null;
  const errorCode = knownError?.code ?? "AI_RESEARCH_UNAVAILABLE";
  const cachedBrief = knownError?.cachedBrief ?? previous?.brief ?? null;
  return {
    schema_version: "ai_research_lookup_v1",
    availability: cachedBrief ? "STALE" : errorCode === "RATE_LIMITED" ? "RATE_LIMITED" : "ERROR",
    provider_mode: previous?.provider_mode ?? "OPENAI",
    brief: cachedBrief,
    retry_after_seconds: knownError?.retryAfterSeconds ?? null,
    error_code: errorCode,
    queue_schema_version: previous?.queue_schema_version,
    analysis_id: previous?.analysis_id ?? cachedBrief?.analysis_id ?? null,
    cache_key: previous?.cache_key ?? null,
    queue_status: previous?.queue_status ?? "ABSENT",
    request_outcome: errorCode === "RATE_LIMITED" ? "RATE_LIMITED" : null,
    shared_result: true,
    is_last_known_good: Boolean(cachedBrief),
  };
}
