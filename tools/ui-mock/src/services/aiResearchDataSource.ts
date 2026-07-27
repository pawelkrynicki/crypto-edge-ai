import {
  AI_RESEARCH_ACTION_TYPES,
  AI_RESEARCH_SCHEMA_VERSION,
  AI_RESEARCH_STATES,
  type AIResearchBrief,
  type AIResearchBriefLookup,
  type AIResearchGenerateRequest,
  type AIResearchLocale,
  type AIResearchProviderStatus,
  type AIResearchReviewMetrics,
  type AIResearchReviewMetricsLookup,
} from "../types/aiResearchTypes";

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

export async function loadAIResearchStatus(fetchImpl: typeof fetch = fetch): Promise<AIResearchProviderStatus | null> {
  try {
    const response = await fetchImpl("/api/ai-research/status", { headers: { accept: "application/json" }, credentials: "same-origin" });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    return isProviderStatus(value) ? value : null;
  } catch {
    return null;
  }
}

export async function loadAIResearchBrief(
  chain: string,
  contractAddress: string,
  locale: AIResearchLocale,
  fetchImpl: typeof fetch = fetch,
): Promise<AIResearchBriefLookup> {
  const query = new URLSearchParams({ chain, contract_address: contractAddress, locale });
  const response = await fetchImpl(`/api/ai-research/brief?${query}`, {
    headers: { accept: "application/json" },
    credentials: "same-origin",
  });
  if (!response.ok) throw await parseError(response);
  const value: unknown = await response.json();
  if (!isLookup(value)) throw new AIResearchDataSourceError(502, "INVALID_PUBLIC_MODEL", null, null);
  return value;
}

export async function generateAIResearchBrief(
  input: Omit<AIResearchGenerateRequest, "idempotency_key"> & { idempotency_key?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<AIResearchBriefLookup> {
  const body: AIResearchGenerateRequest = {
    chain: input.chain,
    contract_address: input.contract_address,
    locale: input.locale,
    idempotency_key: input.idempotency_key ?? createIdempotencyKey(),
  };
  const response = await fetchImpl("/api/ai-research/generate", {
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
  const cached = isBrief(value.cached_brief) ? value.cached_brief : null;
  return new AIResearchDataSourceError(response.status, code, retry, cached);
}

function isProviderStatus(value: unknown): value is AIResearchProviderStatus {
  return isRecord(value)
    && value.schema_version === "ai_research_status_v1"
    && (value.provider_mode === "DISABLED" || value.provider_mode === "OPENAI")
    && typeof value.available === "boolean"
    && typeof value.model_configured === "boolean"
    && typeof value.render_preview === "boolean";
}

function isLookup(value: unknown): value is AIResearchBriefLookup {
  return isRecord(value)
    && value.schema_version === "ai_research_lookup_v1"
    && ["ABSENT", "GENERATING", "READY", "STALE", "PROVIDER_DISABLED", "INSUFFICIENT_DATA", "RATE_LIMITED", "ERROR"].includes(String(value.availability))
    && (value.provider_mode === "DISABLED" || value.provider_mode === "OPENAI")
    && (value.brief === null || isBrief(value.brief))
    && (value.retry_after_seconds === null || typeof value.retry_after_seconds === "number")
    && (value.error_code === null || typeof value.error_code === "string")
    && (value.generation_blocked_reason === undefined
      || value.generation_blocked_reason === null
      || ["LIVE_CALL_BUDGET_EXHAUSTED", "LIVE_CALL_BUDGET_INVALID", "REVIEW_STORE_REQUIRED"].includes(String(value.generation_blocked_reason)));
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
    && value.prompt_version === "ai_research_prompt_v1"
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

function isBrief(value: unknown): value is AIResearchBrief {
  if (!isRecord(value)
    || value.schema_version !== AI_RESEARCH_SCHEMA_VERSION
    || !isRecord(value.identity)
    || typeof value.identity.chain !== "string"
    || typeof value.identity.contract_address !== "string"
    || !AI_RESEARCH_STATES.includes(value.research_state as never)
    || typeof value.summary !== "string"
    || !Array.isArray(value.known_facts)
    || !Array.isArray(value.risk_factors)
    || !Array.isArray(value.missing_information)
    || !Array.isArray(value.next_actions)
    || !Array.isArray(value.status_change_conditions)
    || !Array.isArray(value.source_references)
    || !Array.isArray(value.coverage)
    || !Array.isArray(value.checkpoints)
    || !isRecord(value.token_usage)
    || typeof value.render_preview !== "boolean") return false;
  return value.next_actions.every((action) => isRecord(action) && AI_RESEARCH_ACTION_TYPES.includes(action.action_type as never));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
