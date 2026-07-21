import { randomUUID } from "node:crypto";
import {
  createAutomationStateStore,
  type AutomationRequestCounts,
  type AutomationState,
  type AutomationStateStore,
} from "./automationState.js";
import {
  acquireGlobalCollectorLock,
  DEFAULT_COLLECTOR_LOCK_TTL_MS,
  type GlobalCollectorLockOptions,
} from "./globalCollectorLock.js";
import { nextRunAt, SOURCE_CADENCE_MS } from "./sourceCadence.js";

export type CentralAutomationRunMode = "scanner_and_context" | "context_only";

export type CentralAutomationRunnerResult = {
  request_counts?: AutomationRequestCounts;
  scanner_run_id?: string | null;
  context_run_id?: string | null;
  context_sources_refreshed?: string[];
};

export type CentralAutomationOptions<T extends CentralAutomationRunnerResult> = {
  runner: (runId: string) => Promise<T>;
  automationDirectoryPath?: string;
  stateStore?: AutomationStateStore;
  lockOptions?: Omit<GlobalCollectorLockOptions, "directoryPath">;
  runIdFactory?: () => string;
  now?: () => Date;
  heartbeatIntervalMs?: number;
  mode?: CentralAutomationRunMode;
};

export type CentralAutomationResult<T extends CentralAutomationRunnerResult> =
  | { status: "SUCCESS"; run_id: string; result: T }
  | { status: "FAILED"; run_id: string; error_code: string }
  | { status: "RUN_ALREADY_IN_PROGRESS"; active_run_id: string };

export class CentralAutomationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "CentralAutomationError";
    this.code = code;
  }
}

export async function runCentralAutomation<T extends CentralAutomationRunnerResult>(
  options: CentralAutomationOptions<T>,
): Promise<CentralAutomationResult<T>> {
  const now = options.now ?? (() => new Date());
  const runId = options.runIdFactory?.() ?? `automation_${formatRunTimestamp(now())}_${randomUUID()}`;
  const lock = await acquireGlobalCollectorLock(runId, {
    ...options.lockOptions,
    directoryPath: options.automationDirectoryPath,
    now,
  });
  if (lock.status === "RUN_ALREADY_IN_PROGRESS") {
    return { status: "RUN_ALREADY_IN_PROGRESS", active_run_id: lock.active_run_id };
  }

  const stateStore = options.stateStore ?? createAutomationStateStore(options.automationDirectoryPath);
  const ttlMs = options.lockOptions?.ttlMs ?? DEFAULT_COLLECTOR_LOCK_TTL_MS;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? Math.max(50, Math.floor(ttlMs / 3));
  let heartbeatError: unknown = null;
  let heartbeatInFlight = false;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  try {
    const previous = await readStateFailClosed(stateStore);
    const attemptAt = now().toISOString();
    await writeStateFailClosed(stateStore, {
      ...previous,
      last_attempt_at: attemptAt,
      last_run_id: runId,
      active_run_id: runId,
      last_error_code: null,
    });

    heartbeatTimer = setInterval(() => {
      if (heartbeatInFlight || heartbeatError) return;
      heartbeatInFlight = true;
      lock.heartbeat()
        .catch((error: unknown) => { heartbeatError = error; })
        .finally(() => { heartbeatInFlight = false; });
    }, heartbeatIntervalMs);
    heartbeatTimer.unref();

    let result: T;
    try {
      result = await options.runner(runId);
      if (heartbeatError) throw new CentralAutomationError("COLLECTOR_LOCK_HEARTBEAT_FAILED");
    } catch (error) {
      const errorCode = safeErrorCode(error);
      await writeStateFailClosed(stateStore, {
        ...previous,
        last_attempt_at: attemptAt,
        last_failure_at: now().toISOString(),
        last_run_id: runId,
        active_run_id: null,
        last_result: "FAILED",
        last_error_code: errorCode,
      });
      return { status: "FAILED", run_id: runId, error_code: errorCode };
    }

    await writeStateFailClosed(stateStore, buildSuccessState(
      previous,
      runId,
      attemptAt,
      now(),
      result,
      options.mode ?? "scanner_and_context",
    ));
    return { status: "SUCCESS", run_id: runId, result };
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await lock.release();
  }
}

function buildSuccessState<T extends CentralAutomationRunnerResult>(
  previous: AutomationState,
  runId: string,
  attemptAt: string,
  finishedAt: Date,
  result: T,
  mode: CentralAutomationRunMode,
): AutomationState {
  const successAt = finishedAt.toISOString();
  const scannerSuccessAt = mode === "scanner_and_context" ? successAt : previous.last_scanner_success_at;
  const refreshed = normalizeContextSources(result.context_sources_refreshed);
  const refreshedAlternative = refreshed === null || refreshed.has("alternative_me_fng");
  const refreshedDefillama = refreshed === null || refreshed.has("defillama_api");
  return {
    ...previous,
    last_attempt_at: attemptAt,
    last_success_at: successAt,
    last_run_id: runId,
    active_run_id: null,
    last_result: "SUCCESS",
    last_error_code: null,
    request_counts: normalizeRunnerRequestCounts(result.request_counts),
    last_published_scanner_run_id: safeOptionalRunId(result.scanner_run_id) ?? previous.last_published_scanner_run_id,
    last_published_context_run_id: safeOptionalRunId(result.context_run_id) ?? previous.last_published_context_run_id,
    last_scanner_success_at: scannerSuccessAt,
    last_context_success_at: successAt,
    last_scanner_run_id: mode === "scanner_and_context"
      ? safeOptionalRunId(result.scanner_run_id) ?? previous.last_scanner_run_id
      : previous.last_scanner_run_id,
    last_context_run_id: safeOptionalRunId(result.context_run_id) ?? previous.last_context_run_id,
    next_scanner_run_at: nextRunAt(scannerSuccessAt, SOURCE_CADENCE_MS.dexscreener),
    next_alternative_me_run_at: refreshedAlternative
      ? nextRunAt(successAt, SOURCE_CADENCE_MS.alternative_me_fng)
      : previous.next_alternative_me_run_at,
    next_defillama_run_at: refreshedDefillama
      ? nextRunAt(successAt, SOURCE_CADENCE_MS.defillama_api)
      : previous.next_defillama_run_at,
  };
}

function normalizeContextSources(value: string[] | undefined): Set<string> | null {
  if (value === undefined) return null;
  return new Set(value.filter((sourceId) => sourceId === "alternative_me_fng" || sourceId === "defillama_api"));
}

async function readStateFailClosed(stateStore: AutomationStateStore): Promise<AutomationState> {
  try {
    return await stateStore.read();
  } catch {
    throw new CentralAutomationError("AUTOMATION_STATE_READ_FAILED");
  }
}

async function writeStateFailClosed(stateStore: AutomationStateStore, state: AutomationState): Promise<void> {
  try {
    await stateStore.write(state);
  } catch {
    throw new CentralAutomationError("AUTOMATION_STATE_WRITE_FAILED");
  }
}

function normalizeRunnerRequestCounts(value: AutomationRequestCounts | undefined): AutomationRequestCounts {
  if (!value) return {};
  const normalized: AutomationRequestCounts = {};
  for (const [key, count] of Object.entries(value)) {
    if (/^[A-Za-z0-9._-]{1,64}$/.test(key) && Number.isSafeInteger(count) && count >= 0) {
      normalized[key] = count;
    }
  }
  return normalized;
}

function safeOptionalRunId(value: string | null | undefined): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) ? value : null;
}

function safeErrorCode(error: unknown): string {
  const candidate = error && typeof error === "object" && "code" in error
    ? String(error.code)
    : error instanceof Error
      ? error.message
      : "AUTOMATION_RUNNER_FAILED";
  const normalized = candidate.toUpperCase().replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96);
  return normalized || "AUTOMATION_RUNNER_FAILED";
}

function formatRunTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}
