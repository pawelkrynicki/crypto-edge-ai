import { randomUUID } from "node:crypto";
import {
  AI_RESEARCH_SCHEMA_VERSION,
  type AIResearchBrief,
  type AIResearchBriefLookup,
  type AIResearchGenerateRequest,
  type AIResearchProviderStatus,
  type AIResearchReviewMetrics,
  type AIResearchReviewMetricsLookup,
} from "../src/types/aiResearchTypes.js";
import { buildAIResearchContext, sha256, stableJson, type AIResearchContext, type AIResearchContextOptions } from "./aiResearchContext.js";
import { AI_RESEARCH_NARRATIVE_VERSION, aiResearchNarrativeId } from "./aiResearchNarrativeContract.js";
import {
  createAIResearchProvider,
  NOOP_AI_RESEARCH_USAGE_RECORDER,
  resolveAIResearchProviderConfig,
  type AIResearchProvider,
  type AIResearchProviderConfig,
  type AIResearchUsageRecorder,
} from "./aiResearchProvider.js";
import {
  AIResearchValidationError,
  assertAIResearchSemanticQuality,
  parseAIResearchProviderNarrative,
  validateStoredAIResearchBrief,
  type AIResearchProviderNarrative,
} from "./aiResearchSchema.js";
import {
  createAIResearchStore,
  isAIResearchOpenAIReviewStorePath,
  type AIResearchStore,
  type AIResearchStoreOptions,
} from "./aiResearchStore.js";

export type AIResearchServiceOptions = AIResearchContextOptions & {
  provider?: AIResearchProvider;
  providerConfig?: AIResearchProviderConfig;
  store?: AIResearchStore;
  storeOptions?: AIResearchStoreOptions;
  usageRecorder?: AIResearchUsageRecorder;
  renderPreview?: boolean;
  now?: () => Date;
  rateLimits?: {
    windowMs?: number;
    session?: number;
    identity?: number;
    global?: number;
  };
};

export class AIResearchServiceError extends Error {
  readonly code:
    | "PROVIDER_DISABLED"
    | "MISSING_API_KEY"
    | "MODEL_NOT_CONFIGURED"
    | "PROVIDER_TIMEOUT"
    | "PROVIDER_ERROR"
    | "VALIDATION_FAILURE"
    | "RATE_LIMITED"
    | "LIVE_CALL_BUDGET_EXHAUSTED"
    | "LIVE_CALL_BUDGET_INVALID"
    | "REVIEW_STORE_REQUIRED"
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
  const providerConfig = options.providerConfig ?? resolveAIResearchProviderConfig();
  const provider = options.provider ?? createAIResearchProvider({ config: providerConfig });
  const usageRecorder = options.usageRecorder ?? NOOP_AI_RESEARCH_USAGE_RECORDER;
  const renderPreview = options.renderPreview ?? process.env.CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW === "1";
  const now = options.now ?? (() => new Date());
  const rateWindowMs = bounded(options.rateLimits?.windowMs, 10 * 60_000, 1_000, 60 * 60_000);
  const sessionLimit = bounded(options.rateLimits?.session, 3, 1, 1_000);
  const identityLimit = bounded(options.rateLimits?.identity, 2, 1, 1_000);
  const globalLimit = bounded(options.rateLimits?.global, 20, 1, 10_000);
  const inflight = new Map<string, Promise<AIResearchBrief>>();
  const idempotency = new Map<string, { expiresAt: number; brief: AIResearchBrief }>();
  const rates = new Map<string, number[]>();
  const semaphore = createSemaphore(providerConfig.maxConcurrency);
  let storePromise: Promise<AIResearchStore> | null = options.store ? Promise.resolve(options.store) : null;
  const contextOptions: AIResearchContextOptions = {
    scanner: options.scanner,
    followUp: options.followUp,
    reports: options.reports,
    now,
  };

  const getStore = async (): Promise<AIResearchStore> => {
    if (renderPreview) throw new AIResearchServiceError("STORE_UNAVAILABLE", 503);
    storePromise ??= createAIResearchStore(options.storeOptions);
    try { return await storePromise; } catch { throw new AIResearchServiceError("STORE_UNAVAILABLE", 503); }
  };

  return {
    status(): AIResearchProviderStatus {
      return {
        schema_version: "ai_research_status_v1",
        provider_mode: provider.mode,
        available: renderPreview || (provider.mode === "OPENAI" && Boolean(provider.model) && Boolean(providerConfig.apiKey) && !providerConfig.liveCallBudgetInvalid),
        model_configured: Boolean(provider.model),
        render_preview: renderPreview,
      };
    },

    async getBrief(chain: string, contractAddress: string, locale: "pl" | "en"): Promise<AIResearchBriefLookup> {
      const context = await buildAIResearchContext(chain, contractAddress, locale, contextOptions);
      if (renderPreview) return lookup("READY", provider.mode, buildDeterministicPreview(context, now()), null, null);
      let store: AIResearchStore;
      try { store = await getStore(); } catch { return lookup("ERROR", provider.mode, null, null, "STORE_UNAVAILABLE"); }
      const blockedReason = generationBlockedReason(store, providerConfig);
      const exact = store.findExact({ ...context.identity, locale, snapshot_fingerprint: context.snapshot_fingerprint });
      if (exact) return lookup("READY", provider.mode, exact.brief, null, null, blockedReason);
      const latest = store.findLatest(context.identity.chain, context.identity.contract_address, locale);
      if (latest) return lookup("STALE", provider.mode, latest.brief, null, null, blockedReason);
      if (context.research_state === "INSUFFICIENT_DATA") return lookup("INSUFFICIENT_DATA", provider.mode, null, null, null);
      if (provider.mode === "DISABLED") return lookup("PROVIDER_DISABLED", provider.mode, null, null, "PROVIDER_DISABLED");
      if (!provider.model) return lookup("PROVIDER_DISABLED", provider.mode, null, null, "MODEL_NOT_CONFIGURED");
      if (!providerConfig.apiKey) return lookup("PROVIDER_DISABLED", provider.mode, null, null, "MISSING_API_KEY");
      return lookup("ABSENT", provider.mode, null, null, null, blockedReason);
    },

    async generate(request: AIResearchGenerateRequest, sessionId: string): Promise<AIResearchBriefLookup> {
      const context = await buildAIResearchContext(request.chain, request.contract_address, request.locale, contextOptions);
      if (renderPreview) return lookup("READY", provider.mode, buildDeterministicPreview(context, now()), null, null);
      const store = await getStore();
      const exact = store.findExact({ ...context.identity, locale: request.locale, snapshot_fingerprint: context.snapshot_fingerprint });
      if (exact) return lookup("READY", provider.mode, exact.brief, null, null, generationBlockedReason(store, providerConfig));
      const idempotencyKey = [sessionId, context.identity.chain, context.identity.contract_address, request.locale, request.idempotency_key].join(":");
      pruneIdempotency(idempotency, now().getTime());
      const previous = idempotency.get(idempotencyKey);
      if (previous) return lookup("READY", provider.mode, previous.brief, null, null, generationBlockedReason(store, providerConfig));
      const key = cacheKey(context, provider.model);
      const existing = inflight.get(key);
      if (existing) return lookup("READY", provider.mode, await existing, null, null, generationBlockedReason(store, providerConfig));
      const stale = store.findLatest(context.identity.chain, context.identity.contract_address, request.locale)?.brief;
      const retry = consumeRates(rates, [
        [`session:${sessionId}`, sessionLimit],
        [`identity:${context.identity.chain}:${context.identity.contract_address}`, identityLimit],
        ["global", globalLimit],
      ], now().getTime(), rateWindowMs);
      if (retry !== null) throw new AIResearchServiceError("RATE_LIMITED", 429, { retryAfterSeconds: retry, cachedBrief: stale });
      if (provider.mode === "DISABLED") throw new AIResearchServiceError("PROVIDER_DISABLED", 503, { cachedBrief: stale });
      if (!provider.model) throw new AIResearchServiceError("MODEL_NOT_CONFIGURED", 503, { cachedBrief: stale });
      if (!providerConfig.apiKey && !options.provider) throw new AIResearchServiceError("MISSING_API_KEY", 503, { cachedBrief: stale });
      if (providerConfig.liveCallBudgetInvalid) throw new AIResearchServiceError("LIVE_CALL_BUDGET_INVALID", 503, { cachedBrief: stale });
      if (providerConfig.liveCallBudget && !isAIResearchOpenAIReviewStorePath(store.databaseFilePath)) {
        throw new AIResearchServiceError("REVIEW_STORE_REQUIRED", 503, { cachedBrief: stale });
      }

      const generation = semaphore.run(async () => {
        try {
          if (providerConfig.liveCallBudget && !store.reserveLiveCallBudget(providerConfig.liveCallBudget).allowed) {
            throw new AIResearchServiceError("LIVE_CALL_BUDGET_EXHAUSTED", 409, { cachedBrief: stale });
          }
          const providerResult = await provider.generate(context);
          let narrative;
          try {
            narrative = parseAIResearchProviderNarrative(providerResult.raw_json, context);
          } catch (error) {
            if (!(error instanceof AIResearchValidationError)) throw error;
            throw new AIResearchServiceError("VALIDATION_FAILURE", 502, { cachedBrief: stale });
          }
          const brief = hydrateBrief(context, narrative, providerResult.model, providerResult.token_usage, now(), false);
          const metrics = providerConfig.liveCallBudget ? buildReviewMetrics(brief, providerResult) : undefined;
          const saved = store.save(brief, metrics).brief;
          await usageRecorder.record({
            analysis_id: saved.analysis_id,
            identity: saved.identity,
            model: saved.model,
            token_usage: saved.token_usage,
          });
          idempotency.set(idempotencyKey, { expiresAt: now().getTime() + rateWindowMs, brief: saved });
          return saved;
        } catch (error) {
          if (error instanceof AIResearchServiceError) throw error;
          if (error instanceof AIResearchValidationError) {
            throw new AIResearchServiceError("VALIDATION_FAILURE", 502, { cachedBrief: stale });
          }
          const code = isProviderCode(error) ? error.code : "PROVIDER_ERROR";
          throw new AIResearchServiceError(code === "INVALID_PROVIDER_RESPONSE" ? "PROVIDER_ERROR" : code, code === "PROVIDER_TIMEOUT" ? 504 : 502, { cachedBrief: stale });
        }
      });
      inflight.set(key, generation);
      try {
        return lookup("READY", provider.mode, await generation, null, null, generationBlockedReason(store, providerConfig));
      } finally {
        if (inflight.get(key) === generation) inflight.delete(key);
      }
    },

    diagnostics() {
      return { renderPreview, inflight: inflight.size, providerMode: provider.mode, liveCallBudget: providerConfig.liveCallBudget };
    },

    async getReviewMetrics(analysisId: string): Promise<AIResearchReviewMetricsLookup> {
      const store = await getStore();
      return {
        schema_version: "ai_research_review_metrics_lookup_v1",
        metrics: store.findReviewMetrics(analysisId),
      };
    },
  };
}

function buildReviewMetrics(
  brief: AIResearchBrief,
  providerResult: Awaited<ReturnType<AIResearchProvider["generate"]>>,
): AIResearchReviewMetrics {
  return {
    schema_version: "ai_research_review_metrics_v1",
    analysis_id: brief.analysis_id,
    model: brief.model,
    prompt_version: brief.prompt_version,
    snapshot_fingerprint: brief.snapshot_fingerprint,
    generated_at: brief.generated_at,
    data_generated_at: brief.data_generated_at,
    latency_ms: Number.isSafeInteger(providerResult.latency_ms) && (providerResult.latency_ms ?? -1) >= 0
      ? providerResult.latency_ms!
      : 0,
    prompt_tokens: brief.token_usage.prompt_tokens,
    output_tokens: brief.token_usage.completion_tokens,
    total_tokens: brief.token_usage.total_tokens,
    cache_hit: false,
    validation_status: "VALID",
    request_id: providerResult.request_id ?? null,
  };
}

function hydrateBrief(
  context: AIResearchContext,
  narrative: AIResearchProviderNarrative,
  model: string,
  tokenUsage: AIResearchBrief["token_usage"],
  generatedAt: Date,
  renderPreview: boolean,
): AIResearchBrief {
  const inputHash = sha256(stableJson({
    identity: context.identity,
    snapshot_fingerprint: context.snapshot_fingerprint,
    prompt_version: context.prompt_version,
    locale: context.locale,
    model,
  }));
  const base = {
    schema_version: AI_RESEARCH_SCHEMA_VERSION,
    analysis_id: `air_${randomUUID()}`,
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
  return hydrateBrief(context, narrative, "render-preview", { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, generatedAt, true);
}

function lookup(
  availability: AIResearchBriefLookup["availability"],
  providerMode: AIResearchBriefLookup["provider_mode"],
  brief: AIResearchBrief | null,
  retryAfter: number | null,
  errorCode: string | null,
  generationBlockedReason: AIResearchBriefLookup["generation_blocked_reason"] = null,
): AIResearchBriefLookup {
  return {
    schema_version: "ai_research_lookup_v1",
    availability,
    provider_mode: providerMode,
    brief,
    retry_after_seconds: retryAfter,
    error_code: errorCode,
    generation_blocked_reason: generationBlockedReason,
  };
}

function generationBlockedReason(
  store: AIResearchStore,
  config: AIResearchProviderConfig,
): AIResearchBriefLookup["generation_blocked_reason"] {
  if (config.liveCallBudgetInvalid) return "LIVE_CALL_BUDGET_INVALID";
  if (!config.liveCallBudget) return null;
  if (!isAIResearchOpenAIReviewStorePath(store.databaseFilePath)) return "REVIEW_STORE_REQUIRED";
  return store.liveCallBudgetUsage() >= config.liveCallBudget ? "LIVE_CALL_BUDGET_EXHAUSTED" : null;
}

function cacheKey(context: AIResearchContext, model: string | null): string {
  return [context.identity.chain, context.identity.contract_address, context.snapshot_fingerprint, context.prompt_version, context.locale, model ?? "unconfigured"].join(":");
}

function consumeRates(
  store: Map<string, number[]>,
  limits: Array<[string, number]>,
  now: number,
  windowMs: number,
): number | null {
  let retryAt = 0;
  for (const [key, limit] of limits) {
    const recent = (store.get(key) ?? []).filter((timestamp) => timestamp > now - windowMs);
    store.set(key, recent);
    if (recent.length >= limit) retryAt = Math.max(retryAt, recent[0] + windowMs);
  }
  if (retryAt > 0) return Math.max(1, Math.ceil((retryAt - now) / 1_000));
  for (const [key] of limits) store.get(key)?.push(now);
  return null;
}

function createSemaphore(max: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  const acquire = async () => {
    if (active < max) { active += 1; return; }
    await new Promise<void>((resolve) => waiters.push(resolve));
    active += 1;
  };
  const release = () => {
    active = Math.max(0, active - 1);
    waiters.shift()?.();
  };
  return {
    async run<T>(work: () => Promise<T>): Promise<T> {
      await acquire();
      try { return await work(); } finally { release(); }
    },
  };
}

function pruneIdempotency(store: Map<string, { expiresAt: number }>, now: number): void {
  for (const [key, value] of store) if (value.expiresAt <= now) store.delete(key);
}

function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function isProviderCode(error: unknown): error is { code: "MISSING_API_KEY" | "MODEL_NOT_CONFIGURED" | "PROVIDER_TIMEOUT" | "PROVIDER_ERROR" | "INVALID_PROVIDER_RESPONSE" } {
  return typeof error === "object" && error !== null && "code" in error && ["MISSING_API_KEY", "MODEL_NOT_CONFIGURED", "PROVIDER_TIMEOUT", "PROVIDER_ERROR", "INVALID_PROVIDER_RESPONSE"].includes(String(error.code));
}
