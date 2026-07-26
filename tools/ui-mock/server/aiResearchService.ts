import { randomUUID } from "node:crypto";
import {
  AI_RESEARCH_SCHEMA_VERSION,
  type AIResearchBrief,
  type AIResearchBriefLookup,
  type AIResearchGenerateRequest,
  type AIResearchProviderStatus,
} from "../src/types/aiResearchTypes.js";
import { buildAIResearchContext, sha256, stableJson, type AIResearchContext, type AIResearchContextOptions } from "./aiResearchContext.js";
import {
  createAIResearchProvider,
  NOOP_AI_RESEARCH_USAGE_RECORDER,
  resolveAIResearchProviderConfig,
  type AIResearchProvider,
  type AIResearchProviderConfig,
  type AIResearchUsageRecorder,
} from "./aiResearchProvider.js";
import { AIResearchValidationError, parseAIResearchProviderDraft, validateStoredAIResearchBrief } from "./aiResearchSchema.js";
import { createAIResearchStore, type AIResearchStore, type AIResearchStoreOptions } from "./aiResearchStore.js";

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
        available: renderPreview || (provider.mode === "OPENAI" && Boolean(provider.model) && Boolean(providerConfig.apiKey)),
        model_configured: Boolean(provider.model),
        render_preview: renderPreview,
      };
    },

    async getBrief(chain: string, contractAddress: string, locale: "pl" | "en"): Promise<AIResearchBriefLookup> {
      const context = await buildAIResearchContext(chain, contractAddress, locale, contextOptions);
      if (renderPreview) return lookup("READY", provider.mode, buildDeterministicPreview(context, now()), null, null);
      let store: AIResearchStore;
      try { store = await getStore(); } catch { return lookup("ERROR", provider.mode, null, null, "STORE_UNAVAILABLE"); }
      const exact = store.findExact({ ...context.identity, locale, snapshot_fingerprint: context.snapshot_fingerprint });
      if (exact) return lookup("READY", provider.mode, exact.brief, null, null);
      const latest = store.findLatest(context.identity.chain, context.identity.contract_address, locale);
      if (latest) return lookup("STALE", provider.mode, latest.brief, null, null);
      if (context.research_state === "INSUFFICIENT_DATA") return lookup("INSUFFICIENT_DATA", provider.mode, null, null, null);
      if (provider.mode === "DISABLED" || !provider.model || !providerConfig.apiKey) return lookup("PROVIDER_DISABLED", provider.mode, null, null, null);
      return lookup("ABSENT", provider.mode, null, null, null);
    },

    async generate(request: AIResearchGenerateRequest, sessionId: string): Promise<AIResearchBriefLookup> {
      const context = await buildAIResearchContext(request.chain, request.contract_address, request.locale, contextOptions);
      if (renderPreview) return lookup("READY", provider.mode, buildDeterministicPreview(context, now()), null, null);
      const store = await getStore();
      const exact = store.findExact({ ...context.identity, locale: request.locale, snapshot_fingerprint: context.snapshot_fingerprint });
      if (exact) return lookup("READY", provider.mode, exact.brief, null, null);
      const idempotencyKey = [sessionId, context.identity.chain, context.identity.contract_address, request.locale, request.idempotency_key].join(":");
      pruneIdempotency(idempotency, now().getTime());
      const previous = idempotency.get(idempotencyKey);
      if (previous) return lookup("READY", provider.mode, previous.brief, null, null);
      const key = cacheKey(context, provider.model);
      const existing = inflight.get(key);
      if (existing) return lookup("READY", provider.mode, await existing, null, null);
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

      const generation = semaphore.run(async () => {
        try {
          let providerResult = await provider.generate(context);
          let draft;
          try {
            draft = parseAIResearchProviderDraft(providerResult.raw_json, context);
          } catch (error) {
            if (!(error instanceof AIResearchValidationError)) throw error;
            providerResult = await provider.generate(context, error.code);
            try {
              draft = parseAIResearchProviderDraft(providerResult.raw_json, context);
            } catch {
              throw new AIResearchServiceError("VALIDATION_FAILURE", 502, { cachedBrief: stale });
            }
          }
          const brief = hydrateBrief(context, draft, providerResult.model, providerResult.token_usage, now(), false);
          const saved = store.save(brief).brief;
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
          const code = isProviderCode(error) ? error.code : "PROVIDER_ERROR";
          throw new AIResearchServiceError(code === "INVALID_PROVIDER_RESPONSE" ? "PROVIDER_ERROR" : code, code === "PROVIDER_TIMEOUT" ? 504 : 502, { cachedBrief: stale });
        }
      });
      inflight.set(key, generation);
      try {
        return lookup("READY", provider.mode, await generation, null, null);
      } finally {
        if (inflight.get(key) === generation) inflight.delete(key);
      }
    },

    diagnostics() {
      return { renderPreview, inflight: inflight.size, providerMode: provider.mode };
    },
  };
}

function hydrateBrief(
  context: AIResearchContext,
  draft: ReturnType<typeof parseAIResearchProviderDraft>,
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
  const actions = draft.next_actions.map((selection) => {
    const mapped = context.action_catalog.find(({ action_type }) => action_type === selection.action_type);
    if (!mapped) throw new AIResearchServiceError("VALIDATION_FAILURE", 502);
    return { ...mapped, reason: selection.reason };
  });
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
    summary: draft.summary,
    known_facts: draft.known_facts,
    risk_factors: draft.risk_factors,
    missing_information: draft.missing_information,
    next_actions: actions,
    status_change_conditions: draft.status_change_conditions,
    source_references: context.source_references,
    coverage: context.coverage,
    checkpoints: context.checkpoints,
    token_usage: tokenUsage,
    input_hash: inputHash,
    output_hash: "0".repeat(64),
    render_preview: renderPreview,
  } satisfies AIResearchBrief;
  const outputHash = sha256(stableJson(base));
  return validateStoredAIResearchBrief({ ...base, output_hash: outputHash });
}

export function buildDeterministicPreview(context: AIResearchContext, generatedAt = new Date()): AIResearchBrief {
  const pl = context.locale === "pl";
  const draft = {
    schema_version: AI_RESEARCH_SCHEMA_VERSION,
    research_state: context.research_state,
    summary: pl
      ? "Analiza porządkuje aktualną migawkę produktu i wskazuje najważniejsze luki wymagające dalszego sprawdzenia. Aktualny etap wynika z zapisanych danych i lifecycle, a nie z decyzji modelu."
      : "The analysis organizes the current product snapshot and highlights the most important gaps for further review. The current stage comes from stored data and lifecycle, not from a model decision.",
    known_facts: context.fact_candidates.map((fact) => ({
      ...fact,
      interpretation: pl ? "Wartość pochodzi bezpośrednio z bieżącego kontekstu produktu." : "This value comes directly from the current product context.",
    })),
    risk_factors: context.risk_candidates,
    missing_information: context.missing_information,
    next_actions: context.action_catalog.slice(0, 3).map(({ action_type, reason }) => ({ action_type, reason })),
    status_change_conditions: context.status_change_conditions,
  };
  return hydrateBrief(context, draft, "render-preview", { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, generatedAt, true);
}

function lookup(
  availability: AIResearchBriefLookup["availability"],
  providerMode: AIResearchBriefLookup["provider_mode"],
  brief: AIResearchBrief | null,
  retryAfter: number | null,
  errorCode: string | null,
): AIResearchBriefLookup {
  return { schema_version: "ai_research_lookup_v1", availability, provider_mode: providerMode, brief, retry_after_seconds: retryAfter, error_code: errorCode };
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
