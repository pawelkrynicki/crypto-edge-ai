import { randomUUID } from "node:crypto";
import {
  AI_RESEARCH_TARGET_MODEL,
  type AIResearchBrief,
} from "../src/types/aiResearchTypes.js";
import { buildAIResearchContext, type AIResearchContextOptions } from "./aiResearchContext.js";
import {
  createAIResearchProvider,
  NOOP_AI_RESEARCH_USAGE_RECORDER,
  resolveAIResearchProviderConfig,
  AIResearchProviderError,
  type AIResearchProvider,
  type AIResearchProviderConfig,
  type AIResearchUsageRecorder,
} from "./aiResearchProvider.js";
import {
  AIResearchValidationError,
  parseAIResearchProviderNarrative,
} from "./aiResearchSchema.js";
import {
  buildAIAnalysisCacheIdentity,
  createAIAnalysisQueueStore,
  type AIAnalysisQueueRecord,
  type AIAnalysisQueueStore,
  type AIAnalysisQueueStoreOptions,
} from "./aiResearchQueueStore.js";
import { hydrateAIResearchBrief } from "./aiResearchService.js";

export type AIResearchWorkerLimits = {
  maxConcurrency: number;
  maxAnalysesPerCycle: number;
  maxAnalysesPerHour: number;
  maxAnalysesPerDay: number;
  maxTokensPerDay: number;
  maxDailyCostUsd: number | null;
  inputCostPerMillionTokensUsd: number | null;
  outputCostPerMillionTokensUsd: number | null;
  maxAttempts: number;
  retryBaseMs: number;
  retryJitterRatio: number;
  leaseMs: number;
  budgetDeferralMs: number;
  circuitFailureThreshold: number;
  circuitOpenMs: number;
  circuitDeferralMs: number;
};

export type AIResearchWorkerOptions = AIResearchContextOptions & {
  store?: AIAnalysisQueueStore;
  storeOptions?: AIAnalysisQueueStoreOptions;
  provider?: AIResearchProvider;
  providerConfig?: AIResearchProviderConfig;
  usageRecorder?: AIResearchUsageRecorder;
  now?: () => Date;
  limits?: Partial<AIResearchWorkerLimits>;
  workerId?: string;
};

export type AIResearchWorkerCycleResult = {
  schema_version: "ai_analysis_worker_cycle_v1";
  worker_id: string;
  status: "COMPLETED" | "IDLE" | "SUSPENDED" | "PROVIDER_DISABLED" | "BUDGET_BLOCKED" | "CIRCUIT_OPEN";
  claimed: number;
  completed: number;
  retried: number;
  suspended: number;
  provider_calls: number;
  safe_error_code: string | null;
};

export function resolveAIResearchWorkerLimits(
  input: Partial<AIResearchWorkerLimits> = {},
  env: NodeJS.ProcessEnv = process.env,
): AIResearchWorkerLimits {
  return {
    maxConcurrency: bounded(input.maxConcurrency, envInteger(env.CRYPTO_EDGE_AI_WORKER_MAX_CONCURRENCY), 1, 1, 8),
    maxAnalysesPerCycle: bounded(input.maxAnalysesPerCycle, envInteger(env.CRYPTO_EDGE_AI_WORKER_MAX_PER_CYCLE), 5, 1, 100),
    maxAnalysesPerHour: bounded(input.maxAnalysesPerHour, envInteger(env.CRYPTO_EDGE_AI_MAX_ANALYSES_PER_HOUR), 10, 0, 10_000),
    maxAnalysesPerDay: bounded(input.maxAnalysesPerDay, envInteger(env.CRYPTO_EDGE_AI_MAX_ANALYSES_PER_DAY), 50, 0, 100_000),
    maxTokensPerDay: bounded(input.maxTokensPerDay, envInteger(env.CRYPTO_EDGE_AI_MAX_TOKENS_PER_DAY), 250_000, 0, 100_000_000),
    maxDailyCostUsd: optionalNonNegative(input.maxDailyCostUsd, envNumber(env.CRYPTO_EDGE_AI_MAX_DAILY_COST_USD)),
    inputCostPerMillionTokensUsd: optionalNonNegative(input.inputCostPerMillionTokensUsd, envNumber(env.CRYPTO_EDGE_AI_INPUT_COST_PER_MILLION_USD)),
    outputCostPerMillionTokensUsd: optionalNonNegative(input.outputCostPerMillionTokensUsd, envNumber(env.CRYPTO_EDGE_AI_OUTPUT_COST_PER_MILLION_USD)),
    maxAttempts: bounded(input.maxAttempts, envInteger(env.CRYPTO_EDGE_AI_WORKER_MAX_ATTEMPTS), 3, 1, 10),
    retryBaseMs: bounded(input.retryBaseMs, envInteger(env.CRYPTO_EDGE_AI_WORKER_RETRY_BASE_MS), 30_000, 100, 24 * 60 * 60_000),
    retryJitterRatio: boundedDecimal(input.retryJitterRatio, envNumber(env.CRYPTO_EDGE_AI_WORKER_RETRY_JITTER_RATIO), 0.2, 0, 0.5),
    leaseMs: bounded(input.leaseMs, envInteger(env.CRYPTO_EDGE_AI_WORKER_LEASE_MS), 180_000, 1_000, 30 * 60_000),
    budgetDeferralMs: bounded(input.budgetDeferralMs, envInteger(env.CRYPTO_EDGE_AI_WORKER_BUDGET_DEFERRAL_MS), 60_000, 1_000, 24 * 60 * 60_000),
    circuitFailureThreshold: bounded(input.circuitFailureThreshold, envInteger(env.CRYPTO_EDGE_AI_CIRCUIT_FAILURE_THRESHOLD), 3, 1, 100),
    circuitOpenMs: bounded(input.circuitOpenMs, envInteger(env.CRYPTO_EDGE_AI_CIRCUIT_OPEN_MS), 60_000, 1_000, 24 * 60 * 60_000),
    circuitDeferralMs: bounded(input.circuitDeferralMs, envInteger(env.CRYPTO_EDGE_AI_CIRCUIT_DEFERRAL_MS), 5_000, 1_000, 24 * 60 * 60_000),
  };
}

export function createAIResearchWorker(options: AIResearchWorkerOptions = {}) {
  const providerConfig = options.providerConfig ?? resolveAIResearchProviderConfig();
  const provider = options.provider ?? createAIResearchProvider({ config: providerConfig });
  const usageRecorder = options.usageRecorder ?? NOOP_AI_RESEARCH_USAGE_RECORDER;
  const now = options.now ?? (() => new Date());
  const limits = resolveAIResearchWorkerLimits(options.limits);
  const workerId = safeWorkerId(options.workerId) ?? `aiw_${randomUUID()}`;
  let storePromise: Promise<AIAnalysisQueueStore> | null = options.store ? Promise.resolve(options.store) : null;
  const getStore = async () => (storePromise ??= createAIAnalysisQueueStore(options.storeOptions));
  const contextOptions: AIResearchContextOptions = {
    scanner: options.scanner,
    followUp: options.followUp,
    reports: options.reports,
    now,
  };

  return {
    workerId,
    limits,

    async runCycle(): Promise<AIResearchWorkerCycleResult> {
      const store = await getStore();
      const state = store.workerState();
      if (state.suspended) return cycle(workerId, "SUSPENDED", state.safe_error_code);
      if (provider.mode !== "OPENAI" || !provider.model || (!options.provider && !providerConfig.apiKey)) {
        return cycle(workerId, "PROVIDER_DISABLED", "PROVIDER_DISABLED");
      }
      if (provider.model !== AI_RESEARCH_TARGET_MODEL && !options.provider) {
        store.suspendWorker("MODEL_NOT_ALLOWED", now());
        return cycle(workerId, "SUSPENDED", "MODEL_NOT_ALLOWED");
      }

      const result = cycle(workerId, "IDLE", null);
      let reservations = 0;
      const consume = async () => {
        while (reservations < limits.maxAnalysesPerCycle) {
          reservations += 1;
          if (budgetBlockedBeforeClaim(store, limits, now())) {
            result.status = result.claimed === 0 ? "BUDGET_BLOCKED" : "COMPLETED";
            result.safe_error_code = "AI_BUDGET_LIMIT_REACHED";
            return;
          }
          const claimed = store.claimNext({ worker_id: workerId, now: now(), lease_ms: limits.leaseMs });
          if (!claimed) return;
          result.claimed += 1;
          if (budgetBlockedAfterClaim(store, claimed.analysis_id, limits, now())) {
            store.deferClaim({
              analysis_id: claimed.analysis_id,
              worker_id: workerId,
              now: now(),
              next_retry_at: new Date(now().getTime() + limits.budgetDeferralMs),
              safe_error_code: "AI_BUDGET_LIMIT_REACHED",
            });
            result.status = "BUDGET_BLOCKED";
            result.safe_error_code = "AI_BUDGET_LIMIT_REACHED";
            return;
          }
          const outcome = await processClaim(store, claimed, provider, usageRecorder, contextOptions, limits, workerId, now, result);
          if (outcome === "CIRCUIT_OPEN") return;
          if (store.workerState().suspended) return;
        }
      };
      await Promise.all(Array.from({ length: limits.maxConcurrency }, () => consume()));
      if (store.workerState().suspended) result.status = "SUSPENDED";
      else if (result.completed > 0 || result.retried > 0 || result.suspended > 0) result.status = "COMPLETED";
      return result;
    },

    async status() {
      const store = await getStore();
      return {
        schema_version: "ai_analysis_worker_status_v1" as const,
        worker_id: workerId,
        provider_mode: provider.mode,
        model_id: provider.model,
        limits,
        state: store.workerState(),
        queue: store.stats(),
      };
    },
  };
}

async function processClaim(
  store: AIAnalysisQueueStore,
  claimed: AIAnalysisQueueRecord,
  provider: AIResearchProvider,
  usageRecorder: AIResearchUsageRecorder,
  contextOptions: AIResearchContextOptions,
  limits: AIResearchWorkerLimits,
  workerId: string,
  now: () => Date,
  cycleResult: AIResearchWorkerCycleResult,
): Promise<"COMPLETED" | "CIRCUIT_OPEN"> {
  const heartbeat = setInterval(() => {
    try { store.renewLease({ analysis_id: claimed.analysis_id, worker_id: workerId, now: now(), lease_ms: limits.leaseMs }); } catch { /* claim completion fails closed */ }
  }, Math.max(500, Math.min(30_000, Math.floor(limits.leaseMs / 3))));
  heartbeat.unref?.();
  try {
    const context = await buildAIResearchContext(claimed.chain, claimed.contract_address, claimed.locale, contextOptions);
    const currentIdentity = buildAIAnalysisCacheIdentity({
      ...context.identity,
      locale: claimed.locale,
      snapshot_fingerprint: context.snapshot_fingerprint,
      prompt_version: context.prompt_version,
      model_id: claimed.model_id,
      analysis_schema_version: claimed.analysis_schema_version,
    });
    if (currentIdentity.cache_key !== claimed.cache_key) {
      const failed = store.fail({
        analysis_id: claimed.analysis_id,
        worker_id: workerId,
        safe_error_code: "DATA_STALE",
        transient: false,
        max_attempts: limits.maxAttempts,
        retry_base_ms: limits.retryBaseMs,
        now: now(),
      });
      cycleResult.suspended += failed.status === "SUSPENDED" ? 1 : 0;
      return "COMPLETED";
    }
    if (!store.acquireCircuitPermit({ now: now() })) {
      store.deferClaim({
        analysis_id: claimed.analysis_id,
        worker_id: workerId,
        now: now(),
        next_retry_at: new Date(now().getTime() + limits.circuitDeferralMs),
        safe_error_code: "AI_CIRCUIT_OPEN",
      });
      cycleResult.status = "CIRCUIT_OPEN";
      cycleResult.safe_error_code = "AI_CIRCUIT_OPEN";
      return "CIRCUIT_OPEN";
    }
    cycleResult.provider_calls += 1;
    const providerResult = await provider.generate(context);
    if (providerResult.model !== claimed.model_id) throw new AIResearchWorkerContractError("MODEL_MISMATCH");
    const narrative = parseAIResearchProviderNarrative(providerResult.raw_json, context);
    const brief = hydrateAIResearchBrief(
      context,
      narrative,
      providerResult.model,
      providerResult.token_usage,
      now(),
      false,
      claimed.analysis_id,
    );
    store.complete({
      analysis_id: claimed.analysis_id,
      worker_id: workerId,
      brief,
      validation_status: "VALID",
      latency_ms: safeLatency(providerResult.latency_ms),
      provider_response_id: safeProviderResponseId(providerResult.request_id),
      now: now(),
    });
    store.recordCircuitSuccess(now());
    await usageRecorder.record({
      analysis_id: brief.analysis_id,
      identity: brief.identity,
      model: brief.model,
      token_usage: brief.token_usage,
    });
    cycleResult.completed += 1;
    return "COMPLETED";
  } catch (error) {
    const failure = classifyFailure(error);
    if (failure.transient) {
      store.recordCircuitFailure({
        now: now(),
        threshold: limits.circuitFailureThreshold,
        open_ms: limits.circuitOpenMs,
      });
    }
    const failed = store.fail({
      analysis_id: claimed.analysis_id,
      worker_id: workerId,
      safe_error_code: failure.code,
      transient: failure.transient,
      max_attempts: limits.maxAttempts,
      retry_base_ms: limits.retryBaseMs,
      retry_jitter_ratio: limits.retryJitterRatio,
      now: now(),
    });
    if (failed.status === "FAILED") {
      cycleResult.retried += 1;
    } else {
      cycleResult.suspended += 1;
      if (!failure.transient) store.suspendWorker(failure.code, now());
      cycleResult.safe_error_code = failure.code;
    }
    return "COMPLETED";
  } finally {
    clearInterval(heartbeat);
  }
}

function budgetBlockedBeforeClaim(store: AIAnalysisQueueStore, limits: AIResearchWorkerLimits, at: Date): boolean {
  const hour = store.usageSince(new Date(at.getTime() - 60 * 60_000));
  const dayStart = new Date(at);
  dayStart.setUTCHours(0, 0, 0, 0);
  const day = store.usageSince(dayStart);
  if (hour.analyses >= limits.maxAnalysesPerHour
    || day.analyses >= limits.maxAnalysesPerDay
    || day.total_tokens >= limits.maxTokensPerDay) return true;
  if (limits.maxDailyCostUsd === null
    || limits.inputCostPerMillionTokensUsd === null
    || limits.outputCostPerMillionTokensUsd === null) return false;
  const cost = (day.prompt_tokens / 1_000_000) * limits.inputCostPerMillionTokensUsd
    + (day.completion_tokens / 1_000_000) * limits.outputCostPerMillionTokensUsd;
  return cost >= limits.maxDailyCostUsd;
}

function budgetBlockedAfterClaim(
  store: AIAnalysisQueueStore,
  analysisId: string,
  limits: AIResearchWorkerLimits,
  at: Date,
): boolean {
  const hourStart = new Date(at.getTime() - 60 * 60_000);
  const dayStart = new Date(at);
  dayStart.setUTCHours(0, 0, 0, 0);
  if (!store.hasAnalysisBudgetSlot({ analysis_id: analysisId, since: hourStart, maximum: limits.maxAnalysesPerHour })
    || !store.hasAnalysisBudgetSlot({ analysis_id: analysisId, since: dayStart, maximum: limits.maxAnalysesPerDay })) return true;
  const day = store.usageSince(dayStart);
  if (day.total_tokens >= limits.maxTokensPerDay) return true;
  if (limits.maxDailyCostUsd === null
    || limits.inputCostPerMillionTokensUsd === null
    || limits.outputCostPerMillionTokensUsd === null) return false;
  const cost = (day.prompt_tokens / 1_000_000) * limits.inputCostPerMillionTokensUsd
    + (day.completion_tokens / 1_000_000) * limits.outputCostPerMillionTokensUsd;
  return cost >= limits.maxDailyCostUsd;
}

class AIResearchWorkerContractError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = "AIResearchWorkerContractError"; this.code = code; }
}

function classifyFailure(error: unknown): { code: string; transient: boolean } {
  if (error instanceof AIResearchWorkerContractError) return { code: error.code, transient: false };
  if (error instanceof AIResearchValidationError) return { code: "VALIDATION_FAILURE", transient: false };
  if (error instanceof AIResearchProviderError) {
    if (["PROVIDER_TIMEOUT", "PROVIDER_RATE_LIMITED", "PROVIDER_UNAVAILABLE", "PROVIDER_ERROR"].includes(error.code)) {
      return { code: error.code, transient: true };
    }
    if (error.code === "INVALID_PROVIDER_RESPONSE") return { code: "PROVIDER_CONTRACT_INVALID", transient: false };
    return { code: error.code, transient: false };
  }
  return { code: "AI_WORKER_FAILURE", transient: false };
}

function cycle(workerId: string, status: AIResearchWorkerCycleResult["status"], safeErrorCode: string | null): AIResearchWorkerCycleResult {
  return {
    schema_version: "ai_analysis_worker_cycle_v1",
    worker_id: workerId,
    status,
    claimed: 0,
    completed: 0,
    retried: 0,
    suspended: 0,
    provider_calls: 0,
    safe_error_code: safeErrorCode,
  };
}

function safeLatency(value: number | undefined): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeProviderResponseId(value: string | null | undefined): string | null {
  return value && /^[A-Za-z0-9._-]{1,200}$/.test(value) ? value : null;
}

function safeWorkerId(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized && /^[A-Za-z0-9._-]{1,128}$/.test(normalized) ? normalized : null;
}

function bounded(value: number | undefined, envValue: number | null, fallback: number, minimum: number, maximum: number): number {
  const candidate = value ?? envValue;
  return candidate !== null && candidate !== undefined && Number.isSafeInteger(candidate) && candidate >= minimum && candidate <= maximum
    ? candidate
    : fallback;
}

function boundedDecimal(value: number | undefined, envValue: number | null, fallback: number, minimum: number, maximum: number): number {
  const candidate = value ?? envValue;
  return candidate !== null && candidate !== undefined && Number.isFinite(candidate) && candidate >= minimum && candidate <= maximum
    ? candidate
    : fallback;
}

function optionalNonNegative(value: number | null | undefined, envValue: number | null): number | null {
  const candidate = value === undefined ? envValue : value;
  return candidate !== null && Number.isFinite(candidate) && candidate >= 0 ? candidate : null;
}

function envInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function envNumber(value: string | undefined): number | null {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type { AIResearchBrief };
