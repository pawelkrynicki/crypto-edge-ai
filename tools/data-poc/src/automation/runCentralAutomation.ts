import { createAutomationStateStore, type AutomationState, type AutomationStateStore } from "./automationState.js";
import {
  runCentralAutomation,
  type CentralAutomationRunMode,
  type CentralAutomationRunnerResult,
} from "./centralAutomationCoordinator.js";
import { inspectActiveGlobalCollectorLock } from "./globalCollectorLock.js";
import { readPublishedSnapshotTimes } from "./publishedSnapshotTimes.js";
import { decideCentralSchedule, type PublishedSnapshotTimes, type SchedulerDecisionCode } from "./schedulerDecision.js";

export type SchedulerRunner = (runId: string) => Promise<CentralAutomationRunnerResult>;

export type RunCentralSchedulerOnceOptions = {
  enabled: boolean;
  now?: () => Date;
  automationDirectoryPath?: string;
  stateStore?: AutomationStateStore;
  activeLockRunId?: string | null;
  snapshots?: PublishedSnapshotTimes;
  scannerAndContextRunner?: SchedulerRunner;
  contextOnlyRunner?: SchedulerRunner;
};

export type RunCentralSchedulerOnceResult = {
  decision: SchedulerDecisionCode;
  run_mode: CentralAutomationRunMode | null;
  run_status: "SUCCESS" | "FAILED" | "RUN_ALREADY_IN_PROGRESS" | null;
  run_id?: string;
  active_run_id?: string;
  error_code?: string;
};

async function main(): Promise<void> {
  assertExplicitLiveAutomationOptIn(process.env);
  const result = await runCentralSchedulerOnce({ enabled: true });
  console.log(JSON.stringify(result, null, 2));
  if (result.run_status === "FAILED" || result.decision === "STATE_UNAVAILABLE") process.exitCode = 1;
}

export function assertExplicitLiveAutomationOptIn(env: NodeJS.ProcessEnv): void {
  if (env.CRYPTO_EDGE_AUTOMATION_ENABLED !== "1" || env.ALLOW_LIVE_PROVIDER_CALLS !== "1") {
    throw new Error("LIVE_AUTOMATION_DOUBLE_OPT_IN_REQUIRED");
  }
}

export async function runCentralSchedulerOnce(
  options: RunCentralSchedulerOnceOptions,
): Promise<RunCentralSchedulerOnceResult> {
  const now = options.now ?? (() => new Date());
  const stateStore = options.stateStore ?? createAutomationStateStore(options.automationDirectoryPath);
  let state: AutomationState;
  try {
    state = await stateStore.read();
  } catch {
    return { decision: "STATE_UNAVAILABLE", run_mode: null, run_status: null, error_code: "AUTOMATION_STATE_READ_FAILED" };
  }

  let activeLockRunId = options.activeLockRunId;
  if (activeLockRunId === undefined) {
    try {
      activeLockRunId = await inspectActiveGlobalCollectorLock({ directoryPath: options.automationDirectoryPath, now });
    } catch {
      return { decision: "STATE_UNAVAILABLE", run_mode: null, run_status: null, error_code: "COLLECTOR_LOCK_READ_FAILED" };
    }
  }
  const snapshots = options.snapshots ?? await readPublishedSnapshotTimes(state);
  const schedule = decideCentralSchedule({
    now: now(),
    enabled: options.enabled,
    state,
    active_lock_run_id: activeLockRunId,
    snapshots,
  });
  const observedState = applySchedulerObservation(state, schedule);
  try {
    await stateStore.write(observedState);
  } catch {
    return { decision: "STATE_UNAVAILABLE", run_mode: null, run_status: null, error_code: "AUTOMATION_STATE_WRITE_FAILED" };
  }

  const mode = schedule.decision === "RUN_SCANNER_AND_CONTEXT"
    ? "scanner_and_context"
    : schedule.decision === "RUN_CONTEXT_ONLY" ? "context_only" : null;
  if (mode === null) {
    return {
      decision: schedule.decision,
      run_mode: null,
      run_status: schedule.decision === "RUN_ALREADY_IN_PROGRESS" ? "RUN_ALREADY_IN_PROGRESS" : null,
      ...(schedule.active_run_id ? { active_run_id: schedule.active_run_id } : {}),
    };
  }

  const dueContextSources = schedule.cadence.due_sources.filter(
    (sourceId): sourceId is "alternative_me_fng" | "defillama_api" =>
      sourceId === "alternative_me_fng" || sourceId === "defillama_api",
  );
  const runner = mode === "scanner_and_context"
    ? options.scannerAndContextRunner ?? (() => defaultScannerAndContextRunner(
        dueContextSources,
        state.last_published_context_run_id,
      ))
    : options.contextOnlyRunner ?? (() => defaultContextOnlyRunner(
        dueContextSources,
        state.last_published_context_run_id,
      ));
  const coordinated = await runCentralAutomation({
    runner,
    mode,
    now,
    automationDirectoryPath: options.automationDirectoryPath,
    stateStore,
  });
  if (coordinated.status === "RUN_ALREADY_IN_PROGRESS") {
    return {
      decision: "RUN_ALREADY_IN_PROGRESS",
      run_mode: mode,
      run_status: coordinated.status,
      active_run_id: coordinated.active_run_id,
    };
  }
  return {
    decision: schedule.decision,
    run_mode: mode,
    run_status: coordinated.status,
    run_id: coordinated.run_id,
    ...(coordinated.status === "FAILED" ? { error_code: coordinated.error_code } : {}),
  };
}

function applySchedulerObservation(
  state: AutomationState,
  schedule: ReturnType<typeof decideCentralSchedule>,
): AutomationState {
  return {
    ...state,
    scheduler_schema_version: schedule.scheduler_schema_version,
    last_scheduler_check_at: schedule.checked_at,
    last_decision: schedule.decision,
    next_scanner_run_at: schedule.cadence.sources.dexscreener.next_run_at,
    next_alternative_me_run_at: schedule.cadence.sources.alternative_me_fng.next_run_at,
    next_defillama_run_at: schedule.cadence.sources.defillama_api.next_run_at,
    missed_schedule_count: state.missed_schedule_count + schedule.missed_schedule_increment,
  };
}

async function defaultScannerAndContextRunner(
  dueSourceIds: Array<"alternative_me_fng" | "defillama_api">,
  previousContextRunId: string | null,
): Promise<CentralAutomationRunnerResult> {
  const { runInternalBetaCollector } = await import("../internalBetaCollector.js");
  const result = await runInternalBetaCollector({ contextDueSourceIds: dueSourceIds, previousContextRunId });
  return {
    request_counts: result.request_counts,
    scanner_run_id: result.run_id,
    context_run_id: result.context_run_id,
    context_sources_refreshed: result.context_refreshed_source_ids,
  };
}

async function defaultContextOnlyRunner(
  dueSourceIds: Array<"alternative_me_fng" | "defillama_api">,
  previousContextRunId: string | null,
): Promise<CentralAutomationRunnerResult> {
  const { runInternalBetaContextCollector } = await import("../internalBetaContextCollector.js");
  const result = await runInternalBetaContextCollector({ dueSourceIds, previousContextRunId });
  return {
    request_counts: result.request_counts,
    context_run_id: result.context_run_id,
    context_sources_refreshed: result.refreshed_source_ids,
  };
}

if (process.argv[1]?.endsWith("runCentralAutomation.js")) {
  main().catch((error: unknown) => {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : error instanceof Error ? error.message : "CENTRAL_AUTOMATION_FAILED";
    console.error(JSON.stringify({ error: code }));
    process.exitCode = 1;
  });
}
