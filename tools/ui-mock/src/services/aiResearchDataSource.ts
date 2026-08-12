import {
  type AIResearchBrief,
  type AIResearchGenerateRequest,
  type AIResearchLocale,
  type AIResearchReviewMetrics,
  type AIResearchReviewMetricsLookup,
} from "../types/aiResearchTypes";
import type {
  AIProductionAnalysis,
  AIProductionAnalysisLookup,
  AIProductionAvailability,
} from "../types/aiProductionTypes";

export class AIResearchDataSourceError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSeconds: number | null;
  readonly cachedBrief: AIResearchBrief | null;

  constructor(status: number, code: string, retryAfterSeconds: number | null, cachedBrief: AIResearchBrief | null) {
    super(code);
    this.name = "AIResearchDataSourceError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.cachedBrief = cachedBrief;
  }
}

export async function loadAIResearchStatus(fetchImpl: typeof fetch = fetch): Promise<AIProductionAvailability | null> {
  try {
    const response = await fetchImpl("/api/ai-research/status", { headers: { accept: "application/json" }, credentials: "same-origin" });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return isAvailability(value) ? value : null;
  } catch {
    return null;
  }
}

export async function loadAIResearchBrief(
  chain: string,
  contractAddress: string,
  locale: AIResearchLocale,
  fetchImpl: typeof fetch = fetch,
): Promise<AIProductionAnalysisLookup> {
  const query = new URLSearchParams({ chain, contract_address: contractAddress, locale });
  const response = await fetchImpl(`/api/v1/ai-analyses/result?${query}`, {
    headers: { accept: "application/json" },
    credentials: "same-origin",
  });
  if (!response.ok) throw await parseError(response);
  const value: unknown = await response.json();
  if (!isLookup(value)) throw new AIResearchDataSourceError(502, "INVALID_PUBLIC_MODEL", null, null);
  return value;
}

export async function requestAIResearchBrief(
  input: Omit<AIResearchGenerateRequest, "idempotency_key"> & { idempotency_key?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<AIProductionAnalysisLookup> {
  const body: AIResearchGenerateRequest = {
    chain: input.chain,
    contract_address: input.contract_address,
    locale: input.locale,
    idempotency_key: input.idempotency_key ?? createIdempotencyKey(),
  };
  const response = await fetchImpl("/api/v1/ai-analyses/requests", {
    method: "POST",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await parseError(response);
  const value: unknown = await response.json();
  if (!isLookup(value)) throw new AIResearchDataSourceError(502, "INVALID_PUBLIC_MODEL", null, null);
  return value;
}

export async function loadAIResearchReviewMetrics(
  analysisId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AIResearchReviewMetrics | null> {
  const query = new URLSearchParams({ analysis_id: analysisId });
  const response = await fetchImpl(`/api/ai-research/review-metrics?${query}`, {
    headers: { accept: "application/json" },
    credentials: "same-origin",
  });
  if (!response.ok) return null;
  const value: unknown = await response.json();
  return isReviewMetricsLookup(value) ? value.metrics : null;
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `ui_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`;
}

async function parseError(response: Response): Promise<AIResearchDataSourceError> {
  let value: unknown = null;
  try { value = await response.json(); } catch { /* fail closed */ }
  if (!isRecord(value)) return new AIResearchDataSourceError(response.status, "AI_RESEARCH_UNAVAILABLE", null, null);
  const code = typeof value.error === "string" ? value.error : "AI_RESEARCH_UNAVAILABLE";
  const retry = typeof value.retry_after_seconds === "number" ? value.retry_after_seconds : null;
  return new AIResearchDataSourceError(response.status, code, retry, null);
}

function isAvailability(value: unknown): value is AIProductionAvailability {
  return isRecord(value)
    && value.schema_version === "ai_production_availability_v1"
    && typeof value.available === "boolean";
}

function isLookup(value: unknown): value is AIProductionAnalysisLookup {
  return isRecord(value)
    && value.schema_version === "ai_production_analysis_lookup_v1"
    && ["NO_ANALYSIS", "QUEUED", "PROCESSING", "READY", "STALE", "ERROR", "LIMIT", "DISABLED"].includes(String(value.status))
    && (value.analysis === null || isProductionAnalysis(value.analysis))
    && (value.retry_after_seconds === null || typeof value.retry_after_seconds === "number")
    && typeof value.is_last_known_good === "boolean"
    && !["provider_mode", "model", "analysis_id", "cache_key", "queue_status", "error_code"].some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isReviewMetricsLookup(value: unknown): value is AIResearchReviewMetricsLookup {
  return isRecord(value)
    && value.schema_version === "ai_research_review_metrics_lookup_v1"
    && (value.metrics === null || isReviewMetrics(value.metrics));
}

function isReviewMetrics(value: unknown): value is AIResearchReviewMetrics {
  return isRecord(value)
    && value.schema_version === "ai_research_review_metrics_v1"
    && typeof value.analysis_id === "string"
    && typeof value.model === "string"
    && value.prompt_version === "ai_research_prompt_v4"
    && typeof value.snapshot_fingerprint === "string"
    && typeof value.generated_at === "string"
    && typeof value.data_generated_at === "string"
    && typeof value.latency_ms === "number"
    && typeof value.prompt_tokens === "number"
    && typeof value.output_tokens === "number"
    && typeof value.total_tokens === "number"
    && value.cache_hit === false
    && value.validation_status === "VALID"
    && (value.request_id === null || typeof value.request_id === "string");
}

function isProductionAnalysis(value: unknown): value is AIProductionAnalysis {
  return isRecord(value)
    && value.schema_version === "ai_production_analysis_v3"
    && typeof value.analysis_summary === "string"
    && isInsightArray(value.confirmed_findings)
    && Array.isArray(value.risks) && value.risks.every((item) => isRecord(item)
      && typeof item.title === "string" && typeof item.detail === "string"
      && ["low", "medium", "high", "unknown"].includes(String(item.severity)))
    && isInsightArray(value.missing_data)
    && isInsight(value.market_context) && isInsight(value.security_context)
    && isInsight(value.liquidity_context) && isInsight(value.holder_context)
    && isResearchGuidance(value.research_guidance)
    && Array.isArray(value.next_research_steps) && value.next_research_steps.every((item) => isResearchStep(item))
    && isInsightArray(value.reassessment_signals)
    && Array.isArray(value.evidence)
    && typeof value.generated_at === "string" && typeof value.data_snapshot_at === "string"
    && (value.freshness === "FRESH" || value.freshness === "STALE")
    && typeof value.analysis_version === "string";
}

function isInsight(value: unknown): value is { title: string; detail: string } {
  return isRecord(value) && typeof value.title === "string" && typeof value.detail === "string";
}

function isInsightArray(value: unknown): value is Array<{ title: string; detail: string }> {
  return Array.isArray(value) && value.every(isInsight);
}

function isResearchStep(value: unknown): boolean {
  return isInsight(value) && isRecord(value) && ["primary", "secondary", "tertiary"].includes(String((value as Record<string, unknown>).priority));
}

function isResearchGuidance(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.current_step)
    || ![1, 2, 3, 4, 5, 6, 7].includes(Number(value.current_step.number))
    || typeof value.current_step.title !== "string" || typeof value.current_step.posture !== "string"
    || !isInsightArray(value.blockers)
    || !Array.isArray(value.filter_failures) || !value.filter_failures.every((item) => isRecord(item)
      && typeof item.label === "string" && typeof item.value === "string" && typeof item.requirement === "string" && typeof item.status === "string")
    || !Array.isArray(value.actions) || !value.actions.every((item) => isRecord(item)
      && typeof item.title === "string" && typeof item.why === "string" && typeof item.resolves === "string"
      && (item.cta === null || (isRecord(item.cta) && typeof item.cta.label === "string" && typeof item.cta.href === "string" && typeof item.cta.external === "boolean")))
    || !Array.isArray(value.unlock_conditions) || !value.unlock_conditions.every((item) => typeof item === "string")) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
