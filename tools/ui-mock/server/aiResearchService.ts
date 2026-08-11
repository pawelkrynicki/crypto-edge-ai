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
    // A shared job has one bilingual provider result. Request locale is deliberately
    // not allowed to reach the cache identity or start another heavy generation.
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
    analysis_language: "bilingual",
    snapshot_fingerprint: context.snapshot_fingerprint,
    prompt_version: context.prompt_version,
    model,
    generated_at: generatedAt.toISOString(),
    data_generated_at: context.data_generated_at,
    research_state: context.research_state,
    summary: narrative.summary,
    known_facts: context.fact_candidates.map((fact, index) => ({
      ...fact,
      interpretation: { en: narrative.fact_narratives[index]!.en, pl: narrative.fact_narratives[index]!.pl },
    })),
    risk_factors: context.risk_candidates.map((risk, index) => ({
      ...risk,
      explanation: { en: narrative.risk_narratives[index]!.en, pl: narrative.risk_narratives[index]!.pl },
    })),
    missing_information: context.missing_information.map((item, index) => ({
      ...item,
      explanation: { en: narrative.missing_narratives[index]!.en, pl: narrative.missing_narratives[index]!.pl },
    })),
    next_actions: context.action_catalog.map((action, index) => ({
      ...action,
      reason: { en: narrative.action_narratives[index]!.en, pl: narrative.action_narratives[index]!.pl },
    })),
    status_change_conditions: context.status_change_conditions.map((condition, index) => ({
      ...condition,
      explanation: { en: narrative.status_change_narratives[index]!.en, pl: narrative.status_change_narratives[index]!.pl },
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
  const bilingual = (en: string, pl: string) => ({ en, pl });
  const factNarrative = (fact: AIResearchContext["fact_candidates"][number]) => {
    const { key } = fact;
    if (key === "holders" && fact.value === null) {
      return bilingual(
        "The current snapshot does not provide a holder value, so holder structure cannot be assessed from this evidence.",
        "Bieżąca migawka nie zawiera wartości dotyczącej holderów, więc na jej podstawie nie można ocenić ich struktury.",
      );
    }
    const copy: Record<string, ReturnType<typeof bilingual>> = {
      lifecycle: bilingual(
        "The token remains at the recorded observation stage, so the next checks stay focused on evidence rather than a stronger project assessment.",
        "Token pozostaje na zapisanym etapie obserwacji, więc kolejne kroki skupiają się na danych, a nie na mocniejszej ocenie projektu.",
      ),
      basic_filters: bilingual(
        "At least one recorded basic condition is not met, which limits how strongly the currently available information can be assessed.",
        "Co najmniej jeden zapisany podstawowy warunek nie jest spełniony, co ogranicza siłę oceny dostępnych informacji.",
      ),
      freshness: bilingual(
        "The latest recorded snapshot needs refreshing before its values are treated as current research context.",
        "Najnowsza zapisana migawka wymaga odświeżenia, zanim jej wartości zostaną uznane za aktualny kontekst analizy.",
      ),
      market_cap_usd: bilingual(
        "Market capitalization is recorded in this snapshot and can be considered alongside liquidity instead of as an isolated label.",
        "Kapitalizacja jest zapisana w tej migawce i można ją zestawić z płynnością, zamiast traktować jako pojedynczą etykietę.",
      ),
      liquidity_usd: bilingual(
        "Liquidity is available in the snapshot, so it can be compared with the recorded market context; it does not resolve the missing security or holder evidence.",
        "Płynność jest dostępna w migawce, więc można ją zestawić z kontekstem rynkowym; nie zastępuje to brakujących danych bezpieczeństwa ani holderów.",
      ),
      volume_24h_usd: bilingual(
        "Recorded trading activity adds market context, but it does not answer the open security and concentration questions.",
        "Zapisana aktywność rynkowa daje kontekst, ale nie odpowiada na otwarte pytania o bezpieczeństwo i koncentrację.",
      ),
      holders: bilingual(
        "Holder information is recorded and can be reviewed with the rest of the snapshot; it should not be read as a safety conclusion.",
        "Dane o holderach są zapisane i można je sprawdzić wraz z resztą migawki; nie są jednak wnioskiem o bezpieczeństwie.",
      ),
      pair_age_days: bilingual(
        "The recorded pair age adds timing context, but it does not resolve the open security or holder questions.",
        "Zapisany wiek pary daje kontekst czasowy, ale nie rozstrzyga otwartych kwestii bezpieczeństwa ani holderów.",
      ),
    };
    return copy[key] ?? bilingual(
      "This recorded fact adds context to the current research view without resolving the remaining evidence gaps.",
      "Ten zapisany fakt uzupełnia obecny obraz analizy, ale nie zamyka pozostałych luk w danych.",
    );
  };
  const riskNarrative = (category: string) => {
    const copy: Record<string, ReturnType<typeof bilingual>> = {
      security: bilingual(
        "No contract-security result is recorded, so possible restrictions or warning flags cannot currently be assessed.",
        "Brak wyniku kontroli bezpieczeństwa kontraktu nie pozwala obecnie ocenić możliwych ograniczeń ani flag ostrzegawczych.",
      ),
      coverage_missing: bilingual(
        "Important research areas remain uncovered, which limits how far the available market data can be interpreted.",
        "Ważne obszary analizy nadal nie są pokryte danymi, co ogranicza interpretację dostępnych danych rynkowych.",
      ),
      freshness: bilingual(
        "The timing of the recorded data needs attention before comparisons are treated as current.",
        "Przed traktowaniem porównań jako aktualnych trzeba uwzględnić czas zapisanych danych.",
      ),
    };
    return copy[category] ?? bilingual(
      "This recorded risk remains relevant to the current research posture and needs verification against the listed evidence.",
      "To zapisane ryzyko pozostaje ważne dla obecnej analizy i wymaga sprawdzenia względem wskazanych źródeł.",
    );
  };
  const missingNarrative = (key: string) => {
    const copy: Record<string, ReturnType<typeof bilingual>> = {
      security: bilingual(
        "Without a recorded security result, contract restrictions and warning flags cannot be assessed from this snapshot.",
        "Bez zapisanego wyniku bezpieczeństwa z tej migawki nie można ocenić ograniczeń kontraktu ani flag ostrzegawczych.",
      ),
      history: bilingual(
        "The available history is not sufficient to compare how the recorded market context changes across checkpoints.",
        "Dostępna historia nie wystarcza do porównania zmian kontekstu rynkowego między punktami kontrolnymi.",
      ),
      next_checkpoint: bilingual(
        "A later checkpoint has not been recorded yet, so the current observation cannot be compared with a follow-up state.",
        "Kolejny punkt kontrolny nie został jeszcze zapisany, więc obecnej obserwacji nie można porównać ze stanem po czasie.",
      ),
      fresh_data: bilingual(
        "A fresher snapshot is needed before the recorded values are treated as current research evidence.",
        "Przed traktowaniem zapisanych wartości jako aktualnych danych do analizy potrzebna jest nowsza migawka.",
      ),
      source_verification: bilingual(
        "The listed project identity or external source still needs manual verification before it can support a stronger conclusion.",
        "Wskazana tożsamość projektu lub źródło zewnętrzne nadal wymaga ręcznej weryfikacji przed wyciągnięciem mocniejszego wniosku.",
      ),
    };
    return copy[key] ?? bilingual(
      "This missing area limits what can be concluded from the supplied evidence.",
      "Ten brak ogranicza wnioski, które można wyciągnąć z dostarczonych danych.",
    );
  };
  const actionNarrative = (action: string) => {
    const copy: Record<string, ReturnType<typeof bilingual>> = {
      REVIEW_SECURITY: bilingual("Review security evidence first because it is the highest-impact unresolved gap.", "Najpierw sprawdź dane bezpieczeństwa, ponieważ to luka o największym wpływie na dalszą analizę."),
      OPEN_VERIFICATION: bilingual("Verify the listed source or identity next so the recorded context can be relied on.", "Następnie zweryfikuj wskazane źródło lub tożsamość, aby można było oprzeć się na zapisanym kontekście."),
      WAIT_FOR_CHECKPOINT: bilingual("Wait for the next recorded checkpoint to compare the current observation with new evidence.", "Poczekaj na kolejny zapisany punkt kontrolny, aby porównać obecną obserwację z nowymi danymi."),
      REVIEW_CHECKPOINTS: bilingual("Review the recorded checkpoints to see whether the open gap has changed over time.", "Przejrzyj zapisane punkty kontrolne, aby sprawdzić, czy otwarta luka zmieniła się w czasie."),
    };
    return copy[action] ?? bilingual("Use this permitted research step to verify the listed evidence gap.", "Wykorzystaj ten dozwolony krok analizy, aby sprawdzić wskazaną lukę w danych.");
  };
  const narrative: AIResearchProviderNarrative = {
    narrative_version: AI_RESEARCH_NARRATIVE_VERSION,
    summary: bilingual(
      "The snapshot provides market and liquidity context, but the most important research blockers remain the missing security and supporting verification evidence. Use the recorded facts to guide the next check, not as a conclusion about the project.",
      "Migawka zawiera kontekst rynkowy i płynnościowy, ale najważniejszymi blokadami analizy pozostają brak danych bezpieczeństwa i dodatkowej weryfikacji. Zapisane fakty pomagają wybrać kolejny krok, ale nie są oceną projektu.",
    ),
    fact_narratives: context.fact_candidates.map((fact) => ({
      id: aiResearchNarrativeId("fact", fact.key),
      ...factNarrative(fact),
    })),
    risk_narratives: context.risk_candidates.map((risk, index) => ({
      id: aiResearchNarrativeId("risk", index),
      ...riskNarrative(risk.category),
    })),
    missing_narratives: context.missing_information.map((item) => ({
      id: aiResearchNarrativeId("missing", item.key),
      ...missingNarrative(item.key),
    })),
    action_narratives: context.action_catalog.map((action, index) => ({
      id: aiResearchNarrativeId("action", index),
      ...actionNarrative(action.action_type),
    })),
    status_change_narratives: context.status_change_conditions.map((condition) => ({
      id: aiResearchNarrativeId("condition", condition.key),
      ...statusConditionNarrative(condition.key),
    })),
  };
  return hydrateAIResearchBrief(context, narrative, "render-preview", { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, generatedAt, true);
}

function statusConditionNarrative(key: string): { en: string; pl: string } {
  const copy: Record<string, { en: string; pl: string }> = {
    next_checkpoint: {
      en: "A new recorded checkpoint would allow the current observation to be compared with a later state.",
      pl: "Nowy zapisany punkt kontrolny pozwoli porównać obecną obserwację ze stanem po czasie.",
    },
    filter_thresholds: {
      en: "Updated recorded metrics can change the filter result and should be checked before drawing a stronger conclusion.",
      pl: "Zaktualizowane zapisane metryki mogą zmienić wynik filtrów i warto je sprawdzić przed mocniejszym wnioskiem.",
    },
    fresh_snapshot: {
      en: "A fresher recorded snapshot can update the assessment of the current gaps and risks.",
      pl: "Nowsza zapisana migawka może zaktualizować ocenę obecnych braków i ryzyk.",
    },
    owner_decision: {
      en: "An owner decision is separate from this research result and is not automated by the analysis.",
      pl: "Decyzja ownera jest oddzielna od tego wyniku analizy i nie jest automatyzowana przez AI.",
    },
  };
  return copy[key] ?? {
    en: "A recorded change in this area would justify revisiting the current research view.",
    pl: "Zapisana zmiana w tym obszarze uzasadni ponowne sprawdzenie obecnej analizy.",
  };
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
