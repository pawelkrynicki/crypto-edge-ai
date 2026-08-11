import { randomUUID } from "node:crypto";
import {
  AI_ANALYSIS_QUEUE_SCHEMA_VERSION,
  AI_RESEARCH_SCHEMA_VERSION,
  AI_RESEARCH_TARGET_MODEL,
  type AIResearchBrief,
  type AIResearchBriefLookup,
  type AIResearchGenerateRequest,
  type AIResearchProviderStatus,
  type AIResearchReviewMetricsLookup,
} from "../src/types/aiResearchTypes.js";
import { buildAIResearchContext, sha256, stableJson, type AIResearchContext, type AIResearchContextOptions } from "./aiResearchContext.js";
import { AI_RESEARCH_NARRATIVE_VERSION, aiResearchNarrativeId } from "./aiResearchNarrativeContract.js";
import {
  assertAIResearchSemanticQuality,
  validateStoredAIResearchBrief,
  type AIResearchProviderNarrative,
} from "./aiResearchSchema.js";
import {
  AIAnalysisQueueStoreError,
  buildAIAnalysisCacheIdentity,
  createAIAnalysisQueueStore,
  hashAIAnalysisRateScope,
  type AIAnalysisCacheIdentity,
  type AIAnalysisEnqueueResult,
  type AIAnalysisQueueLookup,
  type AIAnalysisQueueStore,
  type AIAnalysisQueueStoreOptions,
  type AIAnalysisRateLimits,
} from "./aiResearchQueueStore.js";

export type AIResearchServiceOptions = AIResearchContextOptions & {
  queueStore?: AIAnalysisQueueStore;
  queueStoreOptions?: AIAnalysisQueueStoreOptions;
  modelId?: string;
  providerEnabled?: boolean;
  renderPreview?: boolean;
  now?: () => Date;
  rateLimits?: {
    windowMs?: number;
    session?: number;
    identity?: number;
    global?: number;
    cooldownMs?: number;
    actorHourly?: number;
    globalHourly?: number;
    globalDaily?: number;
    queueDepth?: number;
  };
};

export class AIResearchServiceError extends Error {
  readonly code:
    | "PROVIDER_DISABLED"
    | "RATE_LIMITED"
    | "STORE_UNAVAILABLE";
  readonly httpStatus: number;
  readonly retryAfterSeconds?: number;
  readonly cachedBrief?: AIResearchBrief;

  constructor(
    code: AIResearchServiceError["code"],
    httpStatus: number,
    options: { retryAfterSeconds?: number; cachedBrief?: AIResearchBrief } = {},
  ) {
    super(code);
    this.name = "AIResearchServiceError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.cachedBrief = options.cachedBrief;
  }
}

export function createAIResearchService(options: AIResearchServiceOptions = {}) {
  const renderPreview = options.renderPreview ?? process.env.CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW === "1";
  const now = options.now ?? (() => new Date());
  const modelId = safeModelId(options.modelId ?? process.env.CRYPTO_EDGE_AI_RESEARCH_MODEL) ?? AI_RESEARCH_TARGET_MODEL;
  const providerEnabled = options.providerEnabled
    ?? (process.env.CRYPTO_EDGE_AI_WORKER_ENABLED === "1"
      && process.env.CRYPTO_EDGE_AI_RESEARCH_PROVIDER?.trim().toUpperCase() === "OPENAI"
      && modelId === AI_RESEARCH_TARGET_MODEL);
  const rateLimits: AIAnalysisRateLimits = {
    windowMs: bounded(options.rateLimits?.windowMs, 10 * 60_000, 1_000, 60 * 60_000),
    session: bounded(options.rateLimits?.session, 3, 1, 1_000),
    identity: bounded(options.rateLimits?.identity, 10, 1, 1_000),
    global: bounded(options.rateLimits?.global, 100, 1, 10_000),
    cooldownMs: bounded(options.rateLimits?.cooldownMs, 60_000, 1_000, 24 * 60 * 60_000),
    actorHourly: bounded(options.rateLimits?.actorHourly ?? envInteger(process.env.CRYPTO_EDGE_AI_ACTOR_INITIATIONS_PER_HOUR), 5, 1, 10_000),
    globalHourly: bounded(options.rateLimits?.globalHourly ?? envInteger(process.env.CRYPTO_EDGE_AI_GLOBAL_INITIATIONS_PER_HOUR), 100, 1, 100_000),
    globalDaily: bounded(options.rateLimits?.globalDaily ?? envInteger(process.env.CRYPTO_EDGE_AI_GLOBAL_INITIATIONS_PER_DAY), 1_000, 1, 1_000_000),
  };
  const queueDepth = bounded(options.rateLimits?.queueDepth ?? envInteger(process.env.CRYPTO_EDGE_AI_QUEUE_DEPTH_LIMIT), 250, 1, 100_000);
  let storePromise: Promise<AIAnalysisQueueStore> | null = options.queueStore ? Promise.resolve(options.queueStore) : null;
  const contextOptions: AIResearchContextOptions = {
    scanner: options.scanner,
    followUp: options.followUp,
    reports: options.reports,
    now,
  };

  const getStore = async (): Promise<AIAnalysisQueueStore> => {
    if (renderPreview) throw new AIResearchServiceError("STORE_UNAVAILABLE", 503);
    storePromise ??= createAIAnalysisQueueStore(options.queueStoreOptions);
    try { return await storePromise; } catch { throw new AIResearchServiceError("STORE_UNAVAILABLE", 503); }
  };

  const contextAndIdentity = async (chain: string, contractAddress: string) => {
    // A shared job is canonical English. Request locale is deliberately not allowed
    // to reach the provider context or persisted semantic result.
    const context = await buildAIResearchContext(chain, contractAddress, "en", contextOptions);
    const identity = buildAIAnalysisCacheIdentity({
      ...context.identity,
      locale: "en",
      snapshot_fingerprint: context.snapshot_fingerprint,
      prompt_version: context.prompt_version,
      model_id: modelId,
      analysis_schema_version: AI_RESEARCH_SCHEMA_VERSION,
    });
    return { context, identity };
  };

  return {
    status(): AIResearchProviderStatus {
      return {
        schema_version: "ai_research_status_v1",
        provider_mode: providerEnabled ? "OPENAI" : "DISABLED",
        available: renderPreview || providerEnabled,
        model_configured: Boolean(modelId),
        render_preview: renderPreview,
      };
    },

    async getBrief(chain: string, contractAddress: string, locale: "pl" | "en"): Promise<AIResearchBriefLookup> {
      // Locale is accepted for API compatibility; scannerApiHandler applies it only
      // after this canonical shared lookup is complete.
      void locale;
      const { context, identity } = await contextAndIdentity(chain, contractAddress);
      if (renderPreview) return lookup("READY", "DISABLED", buildDeterministicPreview(context, now()), null, null);
      let store: AIAnalysisQueueStore;
      try { store = await getStore(); } catch { return lookup("ERROR", providerMode(providerEnabled), null, null, "STORE_UNAVAILABLE"); }
      const current = store.lookup(identity);
      if (!current.record && !current.last_known_good && context.research_state === "INSUFFICIENT_DATA") {
        return lookup("INSUFFICIENT_DATA", providerMode(providerEnabled), null, null, "DATA_UNAVAILABLE", null, identity);
      }
      if (!current.record && !current.last_known_good && store.circuitBreaker(now()).state === "OPEN") {
        return lookup("FAILED", providerMode(providerEnabled), null, null, "AI_CIRCUIT_OPEN", null, identity);
      }
      return publicLookup(current, identity, providerEnabled, null, null);
    },

    async generate(request: AIResearchGenerateRequest, sessionId: string): Promise<AIResearchBriefLookup> {
      const { context, identity } = await contextAndIdentity(request.chain, request.contract_address);
      if (renderPreview) return lookup("READY", "DISABLED", buildDeterministicPreview(context, now()), null, null);
      const store = await getStore();
      const existing = store.lookup(identity);
      if (existing.record && existing.record.status !== "FAILED") {
        const status = publicLookup(existing, identity, providerEnabled, "ALREADY_EXISTS", null);
        if (existing.record?.status === "READY" || existing.record?.status === "STALE") status.request_outcome = "READY";
        if (existing.record?.status === "SUSPENDED") status.request_outcome = "SUSPENDED";
        return status;
      }
      if (context.research_state === "INSUFFICIENT_DATA") {
        return lookup("INSUFFICIENT_DATA", providerMode(providerEnabled), null, null, "DATA_UNAVAILABLE", null, identity, "DATA_UNAVAILABLE");
      }
      if (!providerEnabled) {
        return lookup("PROVIDER_DISABLED", "DISABLED", null, null, "PROVIDER_DISABLED", null, identity, "PROVIDER_DISABLED");
      }
      if (store.workerState().suspended) {
        return lookup("SUSPENDED", "OPENAI", null, null, "WORKER_SUSPENDED", null, identity, "SUSPENDED");
      }
      const breaker = store.circuitBreaker(now());
      if (breaker.state === "OPEN") {
        return lookup("FAILED", "OPENAI", existing.last_known_good, null, "AI_CIRCUIT_OPEN", null, identity, "RATE_LIMITED");
      }
      const queue = store.stats();
      if (queue.queued + queue.processing >= queueDepth) {
        return lookup("RATE_LIMITED", "OPENAI", existing.last_known_good, null, "AI_QUEUE_LIMIT_REACHED", null, identity, "RATE_LIMITED");
      }
      let queued: AIAnalysisEnqueueResult;
      try {
        queued = store.enqueue({
          identity,
          session_scope_hash: hashAIAnalysisRateScope(sessionId),
          now: now(),
          rate_limits: rateLimits,
        });
      } catch (error) {
        if (error instanceof AIAnalysisQueueStoreError && error.code === "RATE_LIMITED") {
          return lookup(
            "RATE_LIMITED",
            providerMode(providerEnabled),
            existing.last_known_good,
            error.retryAfterSeconds,
            "RATE_LIMITED",
            null,
            identity,
            "RATE_LIMITED",
          );
        }
        throw new AIResearchServiceError("STORE_UNAVAILABLE", 503);
      }
      return publicLookup(queued, identity, providerEnabled, queued.outcome, queued.retry_after_seconds);
    },

    diagnostics() {
      return { renderPreview, providerMode: providerMode(providerEnabled), modelId, queueSchemaVersion: AI_ANALYSIS_QUEUE_SCHEMA_VERSION };
    },

    async getReviewMetrics(analysisId: string): Promise<AIResearchReviewMetricsLookup> {
      const store = await getStore();
      const record = store.findByAnalysisId(analysisId);
      return {
        schema_version: "ai_research_review_metrics_lookup_v1",
        metrics: record?.result && record.validation_status === "VALID" ? {
          schema_version: "ai_research_review_metrics_v1",
          analysis_id: record.result.analysis_id,
          model: record.model_id,
          prompt_version: record.result.prompt_version,
          snapshot_fingerprint: record.snapshot_fingerprint,
          generated_at: record.result.generated_at,
          data_generated_at: record.result.data_generated_at,
          latency_ms: record.latency_ms ?? 0,
          prompt_tokens: record.token_usage.prompt_tokens,
          output_tokens: record.token_usage.completion_tokens,
          total_tokens: record.token_usage.total_tokens,
          cache_hit: false,
          validation_status: "VALID",
          request_id: record.provider_response_id,
        } : null,
      };
    },
  };
}

export function hydrateAIResearchBrief(
  context: AIResearchContext,
  narrative: AIResearchProviderNarrative,
  model: string,
  tokenUsage: AIResearchBrief["token_usage"],
  generatedAt: Date,
  renderPreview: boolean,
  analysisId?: string,
): AIResearchBrief {
  const inputHash = sha256(stableJson({
    identity: context.identity,
    snapshot_fingerprint: context.snapshot_fingerprint,
    prompt_version: context.prompt_version,
    model,
  }));
  const base = {
    schema_version: AI_RESEARCH_SCHEMA_VERSION,
    analysis_id: analysisId ?? `air_${randomUUID()}`,
    identity: context.identity,
    analysis_language: context.locale,
    snapshot_fingerprint: context.snapshot_fingerprint,
    prompt_version: context.prompt_version,
    model,
    generated_at: generatedAt.toISOString(),
    data_generated_at: context.data_generated_at,
    research_state: context.research_state,
    summary: narrative.summary,
    known_facts: context.fact_candidates.map((fact, index) => ({
      ...fact,
      interpretation: narrative.fact_narratives[index]!.interpretation,
    })),
    risk_factors: context.risk_candidates.map((risk, index) => ({
      ...risk,
      explanation: narrative.risk_narratives[index]!.explanation,
    })),
    missing_information: context.missing_information.map((item, index) => ({
      ...item,
      explanation: narrative.missing_narratives[index]!.explanation,
    })),
    next_actions: context.action_catalog.map((action, index) => ({
      ...action,
      reason: narrative.action_narratives[index]!.reason,
    })),
    status_change_conditions: context.status_change_conditions.map((condition, index) => ({
      ...condition,
      explanation: narrative.status_change_narratives[index]!.explanation,
    })),
    source_references: context.source_references,
    coverage: context.coverage,
    checkpoints: context.checkpoints,
    token_usage: tokenUsage,
    input_hash: inputHash,
    output_hash: "0".repeat(64),
    render_preview: renderPreview,
  } satisfies AIResearchBrief;
  assertAIResearchSemanticQuality(base, context);
  const outputHash = sha256(stableJson(base));
  return validateStoredAIResearchBrief({ ...base, output_hash: outputHash });
}

export function buildDeterministicPreview(context: AIResearchContext, generatedAt = new Date()): AIResearchBrief {
  const pl = context.locale === "pl";
  const narrative: AIResearchProviderNarrative = {
    narrative_version: AI_RESEARCH_NARRATIVE_VERSION,
    summary: pl
      ? "Analiza porządkuje aktualną migawkę produktu i wskazuje najważniejsze luki wymagające dalszego sprawdzenia. Aktualny etap obserwacji wynika z zapisanych danych, a nie z decyzji modelu."
      : "The analysis organizes the current product snapshot and highlights the most important gaps for further review. The current observation stage comes from stored data, not from a model decision.",
    fact_narratives: context.fact_candidates.map((fact) => ({
      id: aiResearchNarrativeId("fact", fact.key),
      interpretation: pl ? "Wartość pochodzi bezpośrednio z bieżącego kontekstu produktu." : "This value comes directly from the current product context.",
    })),
    risk_narratives: context.risk_candidates.map((risk, index) => ({
      id: aiResearchNarrativeId("risk", index),
      explanation: risk.explanation,
    })),
    missing_narratives: context.missing_information.map((item) => ({
      id: aiResearchNarrativeId("missing", item.key),
      explanation: item.explanation,
    })),
    action_narratives: context.action_catalog.map((action, index) => ({
      id: aiResearchNarrativeId("action", index),
      reason: action.reason,
    })),
    status_change_narratives: context.status_change_conditions.map((condition) => ({
      id: aiResearchNarrativeId("condition", condition.key),
      explanation: condition.explanation,
    })),
  };
  return hydrateAIResearchBrief(context, narrative, "render-preview", { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, generatedAt, true);
}

function lookup(
  availability: AIResearchBriefLookup["availability"],
  providerMode: AIResearchBriefLookup["provider_mode"],
  brief: AIResearchBrief | null,
  retryAfter: number | null,
  errorCode: string | null,
  generationBlockedReason: AIResearchBriefLookup["generation_blocked_reason"] = null,
  identity: AIAnalysisCacheIdentity | null = null,
  requestOutcome: AIResearchBriefLookup["request_outcome"] = null,
): AIResearchBriefLookup {
  return {
    schema_version: "ai_research_lookup_v1",
    availability,
    provider_mode: providerMode,
    brief,
    retry_after_seconds: retryAfter,
    error_code: errorCode,
    generation_blocked_reason: generationBlockedReason,
    queue_schema_version: AI_ANALYSIS_QUEUE_SCHEMA_VERSION,
    analysis_id: brief?.analysis_id ?? null,
    cache_key: identity?.cache_key ?? null,
    queue_status: availabilityToQueueStatus(availability),
    request_outcome: requestOutcome,
    shared_result: true,
    is_last_known_good: availability === "STALE",
  };
}

function publicLookup(
  value: AIAnalysisQueueLookup,
  identity: AIAnalysisCacheIdentity,
  providerEnabled: boolean,
  requestOutcome: AIResearchBriefLookup["request_outcome"],
  retryAfter: number | null,
): AIResearchBriefLookup {
  const record = value.record;
  const brief = record?.result ?? value.last_known_good;
  if (!record) {
    if (brief) return lookup("STALE", providerMode(providerEnabled), brief, retryAfter, null, null, identity, requestOutcome ?? "DATA_STALE");
    return lookup(providerEnabled ? "ABSENT" : "PROVIDER_DISABLED", providerMode(providerEnabled), null, retryAfter,
      providerEnabled ? null : "PROVIDER_DISABLED", null, identity, requestOutcome);
  }
  const availability = record.status === "STALE" && record.result ? "READY" : record.status;
  const result = lookup(availability, providerMode(providerEnabled), brief, retryAfter, record.safe_error_code, null, identity, requestOutcome);
  result.analysis_id = record.analysis_id;
  result.queue_status = record.status;
  result.is_last_known_good = Boolean(brief) && availability !== "READY";
  return result;
}

function availabilityToQueueStatus(value: AIResearchBriefLookup["availability"]): AIResearchBriefLookup["queue_status"] {
  if (["QUEUED", "PROCESSING", "READY", "STALE", "FAILED", "SUSPENDED"].includes(value)) {
    return value as NonNullable<AIResearchBriefLookup["queue_status"]>;
  }
  return "ABSENT";
}

function providerMode(enabled: boolean): AIResearchBriefLookup["provider_mode"] {
  return enabled ? "OPENAI" : "DISABLED";
}

function safeModelId(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && /^[A-Za-z0-9._-]{1,128}$/.test(normalized) ? normalized : null;
}

function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function envInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
