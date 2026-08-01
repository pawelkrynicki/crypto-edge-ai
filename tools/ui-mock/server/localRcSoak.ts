import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { access, mkdir, open, readFile, readdir, rename, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  acquireGlobalCollectorLock,
  inspectActiveGlobalCollectorLock,
} from "../../data-poc/src/automation/globalCollectorLock.js";
import { getDefaultAutomationDirectory } from "../../data-poc/src/automation/automationPaths.js";
import {
  createAutomationStateStore,
  type AutomationState,
  type AutomationStateStore,
} from "../../data-poc/src/automation/automationState.js";
import { resumeAutomationState } from "../../data-poc/src/automation/resumeAutomationState.js";
import { readFollowUpStore } from "../../data-poc/src/followUpBasket.js";
import { readEstablishedUniverseStore } from "../../data-poc/src/establishedUniverseManager.js";
import { loadEstablishedAddressUniverse } from "../../data-poc/src/establishedAddressUniverse.js";
import { validateDisplayEligibleScannerSnapshot } from "../../data-poc/src/displaySnapshotValidator.js";
import { validateDisplayEligibleContextSnapshot } from "../../data-poc/src/contextSnapshotValidator.js";
import {
  createProductBackup,
  hashCanonicalProductState,
  validateBackupBundle,
  type ProductBackupResult,
} from "./productRecovery.js";
import {
  LOCAL_RC_SOAK_WAKEUP_SCHEMA_VERSION,
  type LocalRcSoakWakeupEvent,
} from "../../data-poc/src/automation/runLocalRcSoakWakeup.js";

export const LOCAL_RC_SOAK_SCHEMA_VERSION = "local_rc_soak_run_v1";
export const LOCAL_RC_SOAK_CONTROL_SCHEMA_VERSION = "local_rc_soak_control_v1";
export const LOCAL_RC_TASK_NAME = "Crypto Edge AI RC1 Soak";
export const PRODUCTION_TASK_NAME = "Crypto Edge AI Central Automation";
export const MINIMUM_SOAK_MS = 60 * 60 * 1_000;
export const MINIMUM_WAKEUPS = 12;

const execFileAsync = promisify(execFile);
const UI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(UI_ROOT, "..", "..");
const SOAK_ROOT = resolve(UI_ROOT, ".local", "local-rc-soak");
const DATA_OUTPUT_ROOT = resolve(REPO_ROOT, "tools", "data-poc", "output");
const TASK_REGISTER_SCRIPT = resolve(REPO_ROOT, "scripts", "win", "register-local-rc-soak-task.ps1");
const TASK_WAKEUP_SCRIPT = resolve(REPO_ROOT, "scripts", "win", "run-local-rc-soak-wakeup.cmd");
const API_PATHS = [
  "/",
  "/api/health",
  "/api/control-center/status",
  "/api/automation/status",
  "/api/scanner/latest",
  "/api/context/latest",
  "/api/follow-up/status",
  "/api/ai-research/status",
] as const;
const EXPECTED_MUTATION_STORES = new Set([
  "central_automation_state",
  "active_scanner_snapshot",
  "active_context_snapshot",
  "central_run_once_receipt",
  "follow_up_store",
  "follow_up_backup",
]);

export type TaskObservation = {
  task_name: string;
  present: boolean;
  state: string;
  last_run_time: string | null;
  last_task_result: number | null;
  next_run_time: string | null;
  missed_runs: number | null;
};

export type LocalRcSoakManifest = {
  schema_version: typeof LOCAL_RC_SOAK_SCHEMA_VERSION;
  run_id: string;
  commit_sha: string;
  started_at: string;
  finished_at: string;
  real_elapsed_ms: number;
  real_elapsed_minutes: number;
  wake_up_count: number;
  cycle_count: number;
  cycle_statuses: Record<string, number>;
  decisions: Record<string, number>;
  cycles: Array<{
    trigger: "TEMPORARY_TASK" | "PRODUCTION_TASK";
    wake_event_id: string | null;
    central_run_id: string;
    started_at: string;
    finished_at: string;
    mode: string | null;
    status: string;
    source_statuses: Record<string, string>;
    request_counts: Record<string, number>;
    error_code: string | null;
  }>;
  provider_calls_per_source: Record<string, number>;
  provider_budget_limits_per_cycle: Record<string, number>;
  provider_budget_validation: "PASS" | "FAIL";
  openai_calls: 0;
  honeypot_is_calls: 0;
  snapshot_ids: { scanner: string[]; context: string[] };
  pointer_history: Array<{
    observation_id: string;
    trigger: "TEMPORARY_TASK" | "PRODUCTION_TASK";
    observed_at: string;
    scanner_run_id: string | null;
    context_run_id: string | null;
    scanner_valid: boolean;
    context_valid: boolean;
  }>;
  pointer_validation: "PASS" | "FAIL";
  last_known_good: "PRESERVED" | "LOST";
  cadence_validation: "PASS" | "FAIL";
  follow_up_mutations: {
    entries_before: number;
    entries_after: number;
    entries_delta: number;
    audit_before: number;
    audit_after: number;
    audit_delta: number;
    ingested_total: number;
    duplicate_identities: number;
  };
  ai_queue: {
    provider_mode: "DISABLED";
    worker_started: false;
    store_hash_before: string | null;
    store_hash_after: string | null;
    unchanged: boolean;
  };
  automation_resume: {
    was_suspended: boolean;
    suspended_reason_before: string | null;
    status: "RESUMED" | "NOT_SUSPENDED";
    owner_confirmed: true;
  };
  expected_mutations: string[];
  mutation_explanations: Record<string, string>;
  unexpected_mutations: string[];
  lock_events: {
    active_before: string | null;
    overlap_count: number;
    recovery_count: number;
    active_after: string | null;
    orphaned_after: boolean;
  };
  errors: string[];
  recovery: string[];
  runtime: {
    pid: number;
    api_base_url: string;
    health_checks: number;
    api_requests: number;
    api_failures: number;
    automation_data_statuses: string[];
    ai_provider_modes: string[];
    unexpected_exit: boolean;
    stopped: boolean;
    orphaned_after: boolean;
  };
  task_scheduler: {
    production_before: TaskObservation;
    production_after: TaskObservation;
    temporary_before: TaskObservation;
    temporary_after: TaskObservation;
    create_count: number;
    run_count: number;
    delete_count: number;
    final_temporary_task_absent: boolean;
  };
  pre_soak_backup: BackupAudit;
  post_soak_backup: BackupAudit;
  sqlite_integrity: "PASS" | "FAIL";
  protected_hashes_before: Record<string, string>;
  protected_hashes_after: Record<string, string>;
  remaining_risks: string[];
  final_verdict: "PASS" | "FAIL";
};

type BackupAudit = {
  backup_id: string;
  backup_path: string;
  manifest_path: string;
  validation: "PASS";
  pointer_validation: "PASS" | "FAIL";
  sqlite_integrity: Record<string, "ok">;
};

type ApiAudit = {
  healthChecks: number;
  requests: number;
  failures: string[];
  automationDataStatuses: string[];
  aiProviderModes: string[];
};

export type ObservedCentralCycle = {
  trigger: "TEMPORARY_TASK" | "PRODUCTION_TASK";
  wake_event_id: string | null;
  central_run_id: string;
  started_at: string;
  finished_at: string;
  mode: string | null;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  source_statuses: Record<string, string>;
  request_counts: Record<string, number>;
  error_code: string | null;
  scanner_run_id: string | null;
  context_run_id: string | null;
  scanner_valid: boolean;
  context_valid: boolean;
  follow_up_ingested: number;
};

export function previewLocalRcSoak() {
  return {
    schema_version: LOCAL_RC_SOAK_SCHEMA_VERSION,
    mode: "PREVIEW" as const,
    minimum_real_minutes: MINIMUM_SOAK_MS / 60_000,
    minimum_wakeups: MINIMUM_WAKEUPS,
    task_name: LOCAL_RC_TASK_NAME,
    provider_calls: 0,
    openai_calls: 0,
    canonical_mutations: 0,
    task_scheduler_mutations: 0,
  };
}

export async function runLocalRcSoak(options: {
  minimumSoakMs?: number;
  minimumWakeups?: number;
  maximumSoakMs?: number;
  progressIntervalMs?: number;
  apiProbeIntervalMs?: number;
} = {}): Promise<{ manifest: LocalRcSoakManifest; manifestPath: string; reportPath: string }> {
  assertLiveEnvironment(process.env);
  const minimumSoakMs = options.minimumSoakMs ?? MINIMUM_SOAK_MS;
  const minimumWakeups = options.minimumWakeups ?? MINIMUM_WAKEUPS;
  const maximumSoakMs = options.maximumSoakMs ?? Math.max(minimumSoakMs + 15 * 60_000, 75 * 60_000);
  const progressIntervalMs = options.progressIntervalMs ?? 60_000;
  const apiProbeIntervalMs = options.apiProbeIntervalMs ?? 30_000;
  const createdAt = new Date();
  const runId = `rc1_${stamp(createdAt)}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const runDirectory = resolve(SOAK_ROOT, runId);
  const reportPath = resolve(runDirectory, "report.md");
  const manifestPath = resolve(runDirectory, "manifest.json");
  await mkdir(resolve(runDirectory, "events"), { recursive: true });
  const commitSha = await gitSha();
  await writeJsonAtomic(resolve(runDirectory, "run-control.json"), {
    schema_version: LOCAL_RC_SOAK_CONTROL_SCHEMA_VERSION,
    run_id: runId,
    commit_sha: commitSha,
    created_at: createdAt.toISOString(),
  });

  const productionBefore = await observeTask(PRODUCTION_TASK_NAME);
  const temporaryBefore = await observeTask(LOCAL_RC_TASK_NAME);
  if (temporaryBefore.present) throw new Error("RC1_TEMPORARY_TASK_ALREADY_EXISTS");
  const lockBefore = await inspectActiveGlobalCollectorLock();
  const staleLockCandidateBefore = await collectorLockExists();

  console.log(`RC1_PRE_SOAK_BACKUP run_id=${runId}`);
  const preSoak = await withCollectorQuiescence("prebackup", async () => {
    const backupResult = await createProductBackup({ runtimeMode: "LOCAL_RC1", commitSha });
    await validateBackupBundle(backupResult.backupDirectory);
    return {
      backupResult,
      hashes: await hashCanonicalProductState(),
      followUp: await readFollowUpStore(),
      providerBudgetLimits: await resolveProviderBudgetLimits(),
    };
  });
  const preBackupResult = preSoak.backupResult;
  const hashesBefore = preSoak.hashes;
  const followUpBefore = preSoak.followUp;
  const providerBudgetLimits = preSoak.providerBudgetLimits;
  const preBackup = backupAudit(preBackupResult);
  const automationStore = createAutomationStateStore();
  const automationBeforeResume = await automationStore.read();
  const resumeResult = await resumeAutomationState({ ownerConfirmed: true, stateStore: automationStore });
  if (resumeResult.status !== "RESUMED" && resumeResult.status !== "NOT_SUSPENDED") {
    throw new Error("RC1_AUTOMATION_RESUME_FAILED");
  }
  const automationAtSoakStart = await automationStore.read();
  const observedCycles = new Map<string, ObservedCentralCycle>();

  const runtime = await startRuntime(commitSha);
  const apiAudit: ApiAudit = {
    healthChecks: 0,
    requests: 0,
    failures: [],
    automationDataStatuses: [],
    aiProviderModes: [],
  };
  let runtimeUnexpectedExit = false;
  let stoppingRuntime = false;
  runtime.child.once("exit", () => { if (!stoppingRuntime) runtimeUnexpectedExit = true; });
  await waitForRuntime(runtime.baseUrl, apiAudit);

  let createCount = 0;
  let deleteCount = 0;
  let taskCreated = false;
  let soakStartedAt: Date | null = null;
  const orchestrationErrors: string[] = [];
  try {
    soakStartedAt = new Date();
    await registerAndStartTask(runDirectory);
    taskCreated = true;
    createCount = 1;
    console.log(`RC1_SOAK_STARTED started_at=${soakStartedAt.toISOString()} task=${LOCAL_RC_TASK_NAME}`);
    let lastProgressAt = 0;
    let lastApiProbeAt = 0;
    while (true) {
      const now = Date.now();
      const elapsed = now - soakStartedAt.getTime();
      const events = await readWakeupEvents(runDirectory);
      await captureObservedCycle(
        automationStore,
        observedCycles,
        soakStartedAt,
        automationAtSoakStart.last_run_id,
      );
      if (events.length > 0 && now - lastApiProbeAt >= apiProbeIntervalMs) {
        await probeApi(runtime.baseUrl, apiAudit);
        lastApiProbeAt = now;
      }
      if (now - lastProgressAt >= progressIntervalMs) {
        console.log(`RC1_PROGRESS elapsed_minutes=${(elapsed / 60_000).toFixed(1)} wakeups=${events.length} cycles=${mergeCentralCycles(events, observedCycles).length} api_failures=${apiAudit.failures.length}`);
        lastProgressAt = now;
      }
      if (elapsed >= minimumSoakMs && events.length >= minimumWakeups) break;
      if (elapsed >= maximumSoakMs) {
        orchestrationErrors.push("SOAK_MAXIMUM_DURATION_EXCEEDED");
        break;
      }
      if (!(await observeTask(LOCAL_RC_TASK_NAME)).present) {
        orchestrationErrors.push("TEMPORARY_TASK_DISAPPEARED");
        break;
      }
      if (isChildStopped(runtime.child)) {
        orchestrationErrors.push("RUNTIME_EXITED_DURING_SOAK");
        break;
      }
      await wait(5_000);
    }
  } catch (error) {
    orchestrationErrors.push(safeError(error));
  } finally {
    if (taskCreated || (await observeTask(LOCAL_RC_TASK_NAME)).present) {
      await removeTask().catch((error: unknown) => orchestrationErrors.push(safeError(error)));
      deleteCount = (await observeTask(LOCAL_RC_TASK_NAME)).present ? 0 : 1;
    }
    if (soakStartedAt) {
      await captureObservedCycle(
        automationStore,
        observedCycles,
        soakStartedAt,
        automationAtSoakStart.last_run_id,
      ).catch((error: unknown) => orchestrationErrors.push(safeError(error)));
    }
    stoppingRuntime = true;
    await stopRuntime(runtime.child);
  }

  const soakFinishedAt = new Date();
  const events = await readWakeupEvents(runDirectory);
  const temporaryAfter = await observeTask(LOCAL_RC_TASK_NAME);
  const runtimeOrphaned = await isRuntimeReachable(runtime.baseUrl);
  console.log(`RC1_POST_SOAK_BACKUP wakeups=${events.length} cycles=${mergeCentralCycles(events, observedCycles).length}`);
  const postSoak = await withCollectorQuiescence("postbackup", async () => {
    if (soakStartedAt) {
      await captureObservedCycle(
        automationStore,
        observedCycles,
        soakStartedAt,
        automationAtSoakStart.last_run_id,
        soakFinishedAt,
      );
    }
    const backupResult = await createProductBackup({ runtimeMode: "LOCAL_RC1", commitSha });
    await validateBackupBundle(backupResult.backupDirectory);
    return {
      backupResult,
      hashes: await hashCanonicalProductState(),
      followUp: await readFollowUpStore(),
    };
  });
  const postBackupResult = postSoak.backupResult;
  const hashesAfter = postSoak.hashes;
  const followUpAfter = postSoak.followUp;
  const productionAfter = await observeTask(PRODUCTION_TASK_NAME);
  const lockAfter = await inspectActiveGlobalCollectorLock().catch(() => "LOCK_INSPECTION_FAILED");
  const postBackup = backupAudit(postBackupResult);
  const cycles = mergeCentralCycles(events, observedCycles);
  const elapsedMs = soakStartedAt ? Math.max(0, soakFinishedAt.getTime() - soakStartedAt.getTime()) : 0;
  const changedStores = changedKeys(hashesBefore, hashesAfter);
  const expectedMutations = changedStores.filter((key) => EXPECTED_MUTATION_STORES.has(key));
  const unexpectedMutations = changedStores.filter((key) => !EXPECTED_MUTATION_STORES.has(key));
  const eventErrors = [
    ...events.flatMap((event) => event.error_code ? [event.error_code] : []),
    ...cycles.flatMap((cycle) => cycle.error_code ? [cycle.error_code] : []),
  ];
  const failures = cycles.filter((cycle) => cycle.status === "FAILED");
  const partials = cycles.filter((cycle) => cycle.status === "PARTIAL");
  const overlaps = events.filter((event) => event.run_status === "RUN_ALREADY_IN_PROGRESS").length;
  const pointerValidation = events.length > 0
    && cycles.length > 0
    && events.every((event) => event.scanner_snapshot_valid && event.context_snapshot_valid)
    && cycles.every((cycle) => cycle.scanner_valid && cycle.context_valid)
    ? "PASS" as const : "FAIL" as const;
  const lastKnownGood = lastKnownGoodPreserved(cycles, automationAtSoakStart)
    ? "PRESERVED" as const : "LOST" as const;
  const providerCalls = sumProviderCalls(cycles);
  const budgetValidation = validateProviderBudgets(cycles, providerBudgetLimits);
  const cadenceValidation = validateCadence(events);
  const recoveredFailures = failures.filter((failed) => cycles.some((candidate) =>
    Date.parse(candidate.started_at) > Date.parse(failed.started_at)
    && candidate.status === "SUCCESS"));
  const recoveredPartials = partials.filter((partial) => cycles.some((candidate) =>
    Date.parse(candidate.started_at) > Date.parse(partial.started_at) && candidate.status === "SUCCESS"));
  const unresolvedFailed = failures.length - recoveredFailures.length;
  const partialPolicyPass = partials.length === 0 || (partials.length === 1 && recoveredPartials.length === 1);
  const duplicateIdentities = duplicateIdentityCount(followUpAfter.entries);
  const apiFailures = [...new Set(apiAudit.failures)];
  const errors = [...new Set([
    ...orchestrationErrors,
    ...eventErrors,
    ...apiFailures,
    ...(unexpectedMutations.length ? ["UNEXPECTED_CANONICAL_MUTATION"] : []),
  ])];
  const initialFullCount = events.filter((event) => event.initial_full_cycle && event.run_mode === "scanner_and_context").length;
  const sqlitePass = Object.keys(preBackup.sqlite_integrity).length >= 2
    && Object.keys(postBackup.sqlite_integrity).length >= 2;
  const finalTaskAbsent = !temporaryAfter.present;
  const pass = elapsedMs >= minimumSoakMs
    && events.length >= minimumWakeups
    && initialFullCount === 1
    && !runtimeUnexpectedExit
    && !runtimeOrphaned
    && apiFailures.length === 0
    && overlaps === 0
    && unresolvedFailed === 0
    && partialPolicyPass
    && budgetValidation
    && cadenceValidation
    && providerCalls.honeypot_is === 0
    && pointerValidation === "PASS"
    && lastKnownGood === "PRESERVED"
    && duplicateIdentities === 0
    && unexpectedMutations.length === 0
    && sqlitePass
    && finalTaskAbsent
    && deleteCount === 1
    && lockAfter === null
    && orchestrationErrors.length === 0;
  const manifest: LocalRcSoakManifest = {
    schema_version: LOCAL_RC_SOAK_SCHEMA_VERSION,
    run_id: runId,
    commit_sha: commitSha,
    started_at: soakStartedAt?.toISOString() ?? createdAt.toISOString(),
    finished_at: soakFinishedAt.toISOString(),
    real_elapsed_ms: elapsedMs,
    real_elapsed_minutes: Number((elapsedMs / 60_000).toFixed(2)),
    wake_up_count: events.length,
    cycle_count: cycles.length,
    cycle_statuses: countBy(cycles.map((cycle) => cycle.status)),
    decisions: countBy(events.map((event) => event.decision)),
    cycles: cycles.map((cycle) => ({
      trigger: cycle.trigger,
      wake_event_id: cycle.wake_event_id,
      central_run_id: cycle.central_run_id,
      started_at: cycle.started_at,
      finished_at: cycle.finished_at,
      mode: cycle.mode,
      status: cycle.status,
      source_statuses: cycle.source_statuses,
      request_counts: cycle.request_counts,
      error_code: cycle.error_code,
    })),
    provider_calls_per_source: providerCalls,
    provider_budget_limits_per_cycle: providerBudgetLimits,
    provider_budget_validation: budgetValidation ? "PASS" : "FAIL",
    openai_calls: 0,
    honeypot_is_calls: 0,
    snapshot_ids: collectSnapshotIds(cycles, automationAtSoakStart),
    pointer_history: createPointerHistory(events, cycles),
    pointer_validation: pointerValidation,
    last_known_good: lastKnownGood,
    cadence_validation: cadenceValidation ? "PASS" : "FAIL",
    follow_up_mutations: {
      entries_before: followUpBefore.entries.length,
      entries_after: followUpAfter.entries.length,
      entries_delta: followUpAfter.entries.length - followUpBefore.entries.length,
      audit_before: followUpBefore.audit_log.length,
      audit_after: followUpAfter.audit_log.length,
      audit_delta: followUpAfter.audit_log.length - followUpBefore.audit_log.length,
      ingested_total: cycles.reduce((sum, cycle) => sum + cycle.follow_up_ingested, 0),
      duplicate_identities: duplicateIdentities,
    },
    ai_queue: {
      provider_mode: "DISABLED",
      worker_started: false,
      store_hash_before: hashesBefore.ai_queue_cache_sqlite ?? null,
      store_hash_after: hashesAfter.ai_queue_cache_sqlite ?? null,
      unchanged: hashesBefore.ai_queue_cache_sqlite === hashesAfter.ai_queue_cache_sqlite,
    },
    automation_resume: {
      was_suspended: automationBeforeResume.automation_suspended,
      suspended_reason_before: automationBeforeResume.suspended_reason,
      status: resumeResult.status,
      owner_confirmed: true,
    },
    expected_mutations: expectedMutations,
    mutation_explanations: Object.fromEntries(expectedMutations.map((store) => [store, mutationExplanation(store)])),
    unexpected_mutations: unexpectedMutations,
    lock_events: {
      active_before: lockBefore,
      overlap_count: overlaps,
      recovery_count: staleLockCandidateBefore && lockBefore === null ? 1 : 0,
      active_after: lockAfter,
      orphaned_after: lockAfter !== null,
    },
    errors,
    recovery: [
      ...recoveredFailures.map((cycle) => `FAILED_RECOVERED_AFTER_${cycle.central_run_id}`),
      ...recoveredPartials.map((cycle) => `PARTIAL_RECOVERED_AFTER_${cycle.central_run_id}`),
    ],
    runtime: {
      pid: runtime.child.pid ?? -1,
      api_base_url: runtime.baseUrl,
      health_checks: apiAudit.healthChecks,
      api_requests: apiAudit.requests,
      api_failures: apiFailures.length,
      automation_data_statuses: [...new Set(apiAudit.automationDataStatuses)],
      ai_provider_modes: [...new Set(apiAudit.aiProviderModes)],
      unexpected_exit: runtimeUnexpectedExit,
      stopped: isChildStopped(runtime.child),
      orphaned_after: runtimeOrphaned,
    },
    task_scheduler: {
      production_before: productionBefore,
      production_after: productionAfter,
      temporary_before: temporaryBefore,
      temporary_after: temporaryAfter,
      create_count: createCount,
      run_count: events.length,
      delete_count: deleteCount,
      final_temporary_task_absent: finalTaskAbsent,
    },
    pre_soak_backup: preBackup,
    post_soak_backup: postBackup,
    sqlite_integrity: sqlitePass ? "PASS" : "FAIL",
    protected_hashes_before: hashesBefore,
    protected_hashes_after: hashesAfter,
    remaining_risks: [
      "Trusted-user acceptance remains outside RC.1.",
      "VPS deployment and Cloudflare access remain outside RC.1.",
      "Live OpenAI execution was intentionally not tested.",
    ],
    final_verdict: pass ? "PASS" : "FAIL",
  };
  await writeTextAtomic(reportPath, renderReport(manifest));
  await writeJsonAtomic(manifestPath, manifest);
  return { manifest, manifestPath, reportPath };
}

export function validateProviderBudgets(
  cycles: Array<{ request_counts: Record<string, number> }>,
  limits: Record<string, number>,
): boolean {
  const allowed = new Set(Object.keys(limits));
  return cycles.every((cycle) => Object.entries(cycle.request_counts).every(([source, count]) =>
    allowed.has(source) && Number.isSafeInteger(count) && count >= 0 && count <= (limits[source] ?? -1)));
}

export function validateCadence(events: LocalRcSoakWakeupEvent[]): boolean {
  if (events.filter((event) => event.initial_full_cycle).length !== 1) return false;
  return events.every((event) => {
    if (event.initial_full_cycle) return event.run_mode === "scanner_and_context";
    if (event.decision === "RUN_SCANNER_AND_CONTEXT") {
      const due = event.before.next_scanner_run_at;
      return due !== null && Date.parse(event.started_at) >= Date.parse(due);
    }
    if (event.decision === "RUN_CONTEXT_ONLY") {
      const dueTimes = [event.before.next_alternative_me_run_at, event.before.next_defillama_run_at]
        .filter((value): value is string => value !== null)
        .map(Date.parse);
      return dueTimes.some((due) => Date.parse(event.started_at) >= due);
    }
    if (event.decision === "NOTHING_DUE") {
      const dueTimes = [
        event.before.next_scanner_run_at,
        event.before.next_alternative_me_run_at,
        event.before.next_defillama_run_at,
      ].filter((value): value is string => value !== null).map(Date.parse);
      return dueTimes.length > 0 && dueTimes.every((due) => Date.parse(event.started_at) < due);
    }
    return event.decision === "RUN_ALREADY_IN_PROGRESS"
      || event.decision === "AUTOMATION_SUSPENDED"
      || event.decision === "STATE_UNAVAILABLE";
  });
}

function backupAudit(result: ProductBackupResult): BackupAudit {
  return {
    backup_id: result.manifest.backup_id,
    backup_path: result.backupDirectory,
    manifest_path: result.manifestPath,
    validation: "PASS",
    pointer_validation: result.operation.pointer_validation,
    sqlite_integrity: result.operation.sqlite_integrity,
  };
}

async function withCollectorQuiescence<T>(phase: "prebackup" | "postbackup", action: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 4 * 60_000;
  const lockRunId = `rc1_${phase}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  while (true) {
    const lock = await acquireGlobalCollectorLock(lockRunId, { ttlMs: 5 * 60_000 });
    if (lock.status === "ACQUIRED") {
      try {
        return await action();
      } finally {
        await lock.release();
      }
    }
    if (Date.now() >= deadline) throw new Error(`RC1_${phase.toUpperCase()}_LOCK_TIMEOUT`);
    await wait(1_000);
  }
}

async function captureObservedCycle(
  stateStore: AutomationStateStore,
  observed: Map<string, ObservedCentralCycle>,
  windowStart: Date,
  baselineRunId: string | null,
  windowEnd?: Date,
): Promise<void> {
  const state = await stateStore.read();
  const runId = state.last_run_id;
  if (!runId || runId === baselineRunId || observed.has(runId)) return;
  if (state.cycle_status === "IN_PROGRESS" || !isFinalCycleStatus(state.last_result) || !state.last_attempt_at) return;
  const startedAtMs = Date.parse(state.last_attempt_at);
  if (startedAtMs < windowStart.getTime() || (windowEnd && startedAtMs > windowEnd.getTime())) return;
  const validation = await validateAutomationPointers(state);
  const finishedAtMs = startedAtMs + (state.cycle_duration_ms ?? 0);
  observed.set(runId, {
    trigger: "PRODUCTION_TASK",
    wake_event_id: null,
    central_run_id: runId,
    started_at: state.last_attempt_at,
    finished_at: new Date(finishedAtMs).toISOString(),
    mode: inferCycleMode(state.request_counts),
    status: state.last_result,
    source_statuses: { ...state.source_statuses },
    request_counts: { ...state.request_counts },
    error_code: state.failure_code ?? state.last_error_code,
    scanner_run_id: state.last_published_scanner_run_id,
    context_run_id: state.last_published_context_run_id,
    scanner_valid: validation.scanner,
    context_valid: validation.context,
    follow_up_ingested: state.follow_up_ingested,
  });
}

export function mergeCentralCycles(
  events: LocalRcSoakWakeupEvent[],
  observed: ReadonlyMap<string, ObservedCentralCycle>,
): ObservedCentralCycle[] {
  const cycles = new Map(observed);
  for (const event of events) {
    if (!event.central_run_id || !isFinalCycleStatus(event.run_status)) continue;
    cycles.set(event.central_run_id, {
      trigger: "TEMPORARY_TASK",
      wake_event_id: event.event_id,
      central_run_id: event.central_run_id,
      started_at: event.started_at,
      finished_at: event.finished_at,
      mode: event.run_mode,
      status: event.run_status,
      source_statuses: { ...event.source_statuses },
      request_counts: { ...event.request_counts },
      error_code: event.error_code,
      scanner_run_id: event.after.scanner_run_id,
      context_run_id: event.after.context_run_id,
      scanner_valid: event.scanner_snapshot_valid,
      context_valid: event.context_snapshot_valid,
      follow_up_ingested: event.follow_up.ingested,
    });
  }
  return [...cycles.values()].sort((left, right) => left.started_at.localeCompare(right.started_at));
}

function isFinalCycleStatus(value: unknown): value is ObservedCentralCycle["status"] {
  return value === "SUCCESS" || value === "PARTIAL" || value === "FAILED";
}

function inferCycleMode(requestCounts: Record<string, number>): "scanner_and_context" | "context_only" | null {
  if ((requestCounts.dexscreener ?? 0) > 0 || (requestCounts.goplus_security ?? 0) > 0) return "scanner_and_context";
  if ((requestCounts.alternative_me_fng ?? 0) > 0 || (requestCounts.defillama_api ?? 0) > 0) return "context_only";
  return null;
}

async function validateAutomationPointers(state: AutomationState): Promise<{ scanner: boolean; context: boolean }> {
  return {
    scanner: await validateSnapshotFile(
      state.last_published_scanner_run_id,
      "full_output.json",
      (value) => validateDisplayEligibleScannerSnapshot(value as Parameters<typeof validateDisplayEligibleScannerSnapshot>[0]),
    ),
    context: await validateSnapshotFile(
      state.last_published_context_run_id,
      "approved_sources_output.json",
      (value) => validateDisplayEligibleContextSnapshot(value as Parameters<typeof validateDisplayEligibleContextSnapshot>[0]),
    ),
  };
}

async function validateSnapshotFile(
  runId: string | null,
  fileName: "full_output.json" | "approved_sources_output.json",
  validate: (value: unknown) => unknown,
): Promise<boolean> {
  if (!runId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) return false;
  try {
    const value = JSON.parse(await readFile(resolve(DATA_OUTPUT_ROOT, runId, fileName), "utf8")) as unknown;
    validate(value);
    return true;
  } catch {
    return false;
  }
}

async function startRuntime(commitSha: string): Promise<{ child: ChildProcess; baseUrl: string }> {
  const distIndex = resolve(UI_ROOT, "dist", "index.html");
  const info = await stat(distIndex).catch(() => null);
  if (!info?.isFile()) throw new Error("RC1_UI_DIST_NOT_READY");
  const port = await reservePort();
  const child = spawn(process.execPath, ["--import", "tsx", "server/productVpsServer.ts"], {
    cwd: UI_ROOT,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      CRYPTO_EDGE_DATA_ENV: "INTERNAL_BETA",
      CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
      CRYPTO_EDGE_PRODUCT_HOST: "127.0.0.1",
      CRYPTO_EDGE_PRODUCT_PORT: String(port),
      CRYPTO_EDGE_BUILD_SHA: commitSha,
      CRYPTO_EDGE_AUTOMATION_ENABLED: "0",
      ALLOW_LIVE_PROVIDER_CALLS: "0",
      CRYPTO_EDGE_AI_WORKER_ENABLED: "0",
      CRYPTO_EDGE_AI_RESEARCH_PROVIDER: "DISABLED",
      CRYPTO_EDGE_AI_RESEARCH_MODEL: "",
      OPENAI_API_KEY: "",
    },
  });
  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`[runtime] ${chunk.toString()}`));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[runtime] ${chunk.toString()}`));
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

async function waitForRuntime(baseUrl: string, audit: ApiAudit): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2_000) });
      audit.healthChecks += 1;
      audit.requests += 1;
      if (response.status === 200) return;
    } catch { /* bounded startup polling */ }
    await wait(500);
  }
  throw new Error("RC1_RUNTIME_START_TIMEOUT");
}

async function probeApi(baseUrl: string, audit: ApiAudit): Promise<void> {
  audit.healthChecks += 1;
  await Promise.all(API_PATHS.map(async (path) => {
    audit.requests += 1;
    try {
      const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(10_000) });
      if (response.status !== 200) audit.failures.push(`${path}:HTTP_${response.status}`);
      if (response.status === 200 && path === "/api/automation/status") {
        const body = await response.json() as Record<string, unknown>;
        if (typeof body.data_status === "string") audit.automationDataStatuses.push(body.data_status);
        else audit.failures.push(`${path}:DATA_STATUS_MISSING`);
      }
      if (response.status === 200 && path === "/api/ai-research/status") {
        const body = await response.json() as Record<string, unknown>;
        if (typeof body.provider_mode === "string") audit.aiProviderModes.push(body.provider_mode);
        if (body.provider_mode !== "DISABLED") audit.failures.push(`${path}:PROVIDER_NOT_DISABLED`);
      }
    } catch {
      audit.failures.push(`${path}:REQUEST_FAILED`);
    }
  }));
}

async function stopRuntime(child: ChildProcess): Promise<void> {
  if (isChildStopped(child)) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolveExit) => child.once("exit", () => resolveExit())),
    wait(10_000),
  ]);
  if (!isChildStopped(child)) child.kill("SIGKILL");
  if (!isChildStopped(child)) {
    await Promise.race([
      new Promise<void>((resolveExit) => child.once("exit", () => resolveExit())),
      wait(2_000),
    ]);
  }
}

function isChildStopped(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function isRuntimeReachable(baseUrl: string): Promise<boolean> {
  try {
    await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1_000) });
    return true;
  } catch {
    return false;
  }
}

async function reservePort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close((error) => error ? rejectPort(error) : resolvePort(port));
    });
  });
}

async function registerAndStartTask(runDirectory: string): Promise<void> {
  const user = await currentUser();
  await execFileAsync("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", TASK_REGISTER_SCRIPT,
    "-TaskName", LOCAL_RC_TASK_NAME,
    "-TaskUser", user,
    "-RepoRoot", REPO_ROOT,
    "-RunnerPath", TASK_WAKEUP_SCRIPT,
    "-RunDirectory", runDirectory,
  ], { cwd: REPO_ROOT, windowsHide: true });
}

async function removeTask(): Promise<void> {
  await runPowerShell(`$task=Get-ScheduledTask -TaskName '${LOCAL_RC_TASK_NAME}' -ErrorAction SilentlyContinue; if($null -eq $task){exit 0}; Disable-ScheduledTask -TaskName '${LOCAL_RC_TASK_NAME}' | Out-Null`);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const observed = await observeTask(LOCAL_RC_TASK_NAME);
    if (!observed.present || observed.state !== "Running") break;
    await wait(1_000);
  }
  const observed = await observeTask(LOCAL_RC_TASK_NAME);
  if (observed.present && observed.state === "Running") {
    await runPowerShell(`Stop-ScheduledTask -TaskName '${LOCAL_RC_TASK_NAME}'`);
  }
  await runPowerShell(`$task=Get-ScheduledTask -TaskName '${LOCAL_RC_TASK_NAME}' -ErrorAction SilentlyContinue; if($null -ne $task){Unregister-ScheduledTask -TaskName '${LOCAL_RC_TASK_NAME}' -Confirm:$false}`);
}

export async function observeTask(taskName: string): Promise<TaskObservation> {
  if (taskName !== LOCAL_RC_TASK_NAME && taskName !== PRODUCTION_TASK_NAME) throw new Error("RC1_TASK_NAME_INVALID");
  const script = `$task=Get-ScheduledTask -TaskName '${taskName}' -ErrorAction SilentlyContinue; if($null -eq $task){[pscustomobject]@{task_name='${taskName}';present=$false;state='NOT_INSTALLED';last_run_time=$null;last_task_result=$null;next_run_time=$null;missed_runs=$null}|ConvertTo-Json -Compress}else{$info=Get-ScheduledTaskInfo -TaskName '${taskName}';[pscustomobject]@{task_name=$task.TaskName;present=$true;state=[string]$task.State;last_run_time=if($info.LastRunTime.Year -le 1900){$null}else{$info.LastRunTime.ToUniversalTime().ToString('o')};last_task_result=[int]$info.LastTaskResult;next_run_time=if($info.NextRunTime.Year -le 1900){$null}else{$info.NextRunTime.ToUniversalTime().ToString('o')};missed_runs=[int]$info.NumberOfMissedRuns}|ConvertTo-Json -Compress}`;
  const output = await runPowerShell(script);
  return parseTaskObservation(JSON.parse(output) as unknown, taskName);
}

function parseTaskObservation(value: unknown, taskName: string): TaskObservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RC1_TASK_STATUS_INVALID");
  const record = value as Record<string, unknown>;
  if (record.task_name !== taskName || typeof record.present !== "boolean" || typeof record.state !== "string") {
    throw new Error("RC1_TASK_STATUS_INVALID");
  }
  return {
    task_name: taskName,
    present: record.present,
    state: record.state,
    last_run_time: typeof record.last_run_time === "string" ? record.last_run_time : null,
    last_task_result: typeof record.last_task_result === "number" ? record.last_task_result : null,
    next_run_time: typeof record.next_run_time === "string" ? record.next_run_time : null,
    missed_runs: typeof record.missed_runs === "number" ? record.missed_runs : null,
  };
}

async function runPowerShell(script: string): Promise<string> {
  const result = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], {
    cwd: REPO_ROOT,
    windowsHide: true,
  });
  return result.stdout.trim();
}

async function currentUser(): Promise<string> {
  const result = await execFileAsync("whoami", [], { windowsHide: true });
  const user = result.stdout.trim();
  if (!/^[A-Za-z0-9._ -]+\\[A-Za-z0-9._ -]+$/.test(user)) throw new Error("RC1_TASK_USER_INVALID");
  return user;
}

async function readWakeupEvents(runDirectory: string): Promise<LocalRcSoakWakeupEvent[]> {
  const eventsDirectory = resolve(runDirectory, "events");
  const names = (await readdir(eventsDirectory)).filter((name) => /^wake_\d{8}T\d{6}Z_[0-9a-f]{8}\.json$/.test(name));
  const events = await Promise.all(names.map(async (name) => parseWakeupEvent(
    JSON.parse(await readFile(resolve(eventsDirectory, name), "utf8")) as unknown,
  )));
  return events.sort((left, right) => left.started_at.localeCompare(right.started_at));
}

function parseWakeupEvent(value: unknown): LocalRcSoakWakeupEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RC1_WAKEUP_EVENT_INVALID");
  const event = value as LocalRcSoakWakeupEvent;
  if (event.schema_version !== LOCAL_RC_SOAK_WAKEUP_SCHEMA_VERSION
    || typeof event.event_id !== "string"
    || !Number.isFinite(Date.parse(event.started_at))
    || !Number.isFinite(Date.parse(event.finished_at))) {
    throw new Error("RC1_WAKEUP_EVENT_INVALID");
  }
  return event;
}

async function resolveProviderBudgetLimits(): Promise<Record<string, number>> {
  const enabled = await readEstablishedUniverseStore()
    .then((store) => store.current.entries.filter((entry) => entry.enabled).length)
    .catch(() => loadEstablishedAddressUniverse().entries.filter((entry) => entry.enabled).length);
  return {
    dexscreener: 1 + 20 + 5 + enabled + Math.min(enabled, 5) + 5 + 2,
    goplus_security: 13,
    alternative_me_fng: 2,
    defillama_api: 2,
    honeypot_is: 0,
  };
}

async function collectorLockExists(): Promise<boolean> {
  try {
    await access(resolve(getDefaultAutomationDirectory(), "collector.lock.json"));
    return true;
  } catch {
    return false;
  }
}

function sumProviderCalls(cycles: Array<{ request_counts: Record<string, number> }>): Record<string, number> {
  const totals: Record<string, number> = {
    dexscreener: 0,
    goplus_security: 0,
    alternative_me_fng: 0,
    defillama_api: 0,
    honeypot_is: 0,
  };
  for (const cycle of cycles) {
    for (const [source, count] of Object.entries(cycle.request_counts)) totals[source] = (totals[source] ?? 0) + count;
  }
  return totals;
}

function collectSnapshotIds(
  cycles: ObservedCentralCycle[],
  baseline: AutomationState,
): { scanner: string[]; context: string[] } {
  const scanner = new Set<string>();
  const context = new Set<string>();
  let scannerPointer = baseline.last_published_scanner_run_id;
  let contextPointer = baseline.last_published_context_run_id;
  for (const cycle of cycles) {
    if (cycle.scanner_run_id && cycle.scanner_run_id !== scannerPointer) scanner.add(cycle.scanner_run_id);
    if (cycle.context_run_id && cycle.context_run_id !== contextPointer) context.add(cycle.context_run_id);
    scannerPointer = cycle.scanner_run_id;
    contextPointer = cycle.context_run_id;
  }
  return { scanner: [...scanner], context: [...context] };
}

function createPointerHistory(
  events: LocalRcSoakWakeupEvent[],
  cycles: ObservedCentralCycle[],
): LocalRcSoakManifest["pointer_history"] {
  const temporary = events.map((event) => ({
    observation_id: event.event_id,
    trigger: "TEMPORARY_TASK" as const,
    observed_at: event.finished_at,
    scanner_run_id: event.after.scanner_run_id,
    context_run_id: event.after.context_run_id,
    scanner_valid: event.scanner_snapshot_valid,
    context_valid: event.context_snapshot_valid,
  }));
  const production = cycles.filter((cycle) => cycle.trigger === "PRODUCTION_TASK").map((cycle) => ({
    observation_id: cycle.central_run_id,
    trigger: cycle.trigger,
    observed_at: cycle.finished_at,
    scanner_run_id: cycle.scanner_run_id,
    context_run_id: cycle.context_run_id,
    scanner_valid: cycle.scanner_valid,
    context_valid: cycle.context_valid,
  }));
  return [...temporary, ...production].sort((left, right) => left.observed_at.localeCompare(right.observed_at));
}

function lastKnownGoodPreserved(cycles: ObservedCentralCycle[], baseline: AutomationState): boolean {
  let scannerPointer = baseline.last_published_scanner_run_id;
  let contextPointer = baseline.last_published_context_run_id;
  for (const cycle of cycles) {
    if (cycle.status === "FAILED"
      && (cycle.scanner_run_id !== scannerPointer || cycle.context_run_id !== contextPointer)) return false;
    scannerPointer = cycle.scanner_run_id;
    contextPointer = cycle.context_run_id;
  }
  return true;
}

function countBy(values: Array<string | null>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value ?? "NONE"] = (counts[value ?? "NONE"] ?? 0) + 1;
  return counts;
}

function changedKeys(before: Record<string, string>, after: Record<string, string>): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => before[key] !== after[key])
    .sort();
}

function duplicateIdentityCount(entries: Array<{ chain: string; contract_address: string }>): number {
  const identities = entries.map((entry) => `${entry.chain}:${entry.contract_address}`);
  return identities.length - new Set(identities).size;
}

function renderReport(manifest: LocalRcSoakManifest): string {
  const line = (label: string, value: unknown) => `- ${label}: **${String(value)}**`;
  const list = (values: string[]) => values.length ? values.map((value) => `  - \`${value}\``).join("\n") : "  - none";
  return [
    "# RC.1 — Local Release Candidate Owner Review",
    "",
    `## ${manifest.final_verdict}`,
    "",
    line("Run ID", manifest.run_id),
    line("Commit", manifest.commit_sha),
    line("Real soak time", `${manifest.real_elapsed_minutes} minutes`),
    line("Wake-ups", manifest.wake_up_count),
    line("Central cycles", manifest.cycle_count),
    line("Cycle statuses", JSON.stringify(manifest.cycle_statuses)),
    line("Provider calls", JSON.stringify(manifest.provider_calls_per_source)),
    line("OpenAI calls", manifest.openai_calls),
    line("Cadence", manifest.cadence_validation),
    line("Provider budgets", manifest.provider_budget_validation),
    line("Pointer validation", manifest.pointer_validation),
    line("Last-known-good", manifest.last_known_good),
    line("SQLite integrity", manifest.sqlite_integrity),
    "",
    "## Snapshots",
    "",
    "Scanner:",
    list(manifest.snapshot_ids.scanner),
    "",
    "Context:",
    list(manifest.snapshot_ids.context),
    "",
    "## Follow-up and AI queue",
    "",
    line("Follow-up entries delta", manifest.follow_up_mutations.entries_delta),
    line("Follow-up audit delta", manifest.follow_up_mutations.audit_delta),
    line("Follow-up ingested", manifest.follow_up_mutations.ingested_total),
    line("Follow-up duplicates", manifest.follow_up_mutations.duplicate_identities),
    line("AI provider mode", manifest.ai_queue.provider_mode),
    line("AI worker started", manifest.ai_queue.worker_started),
    line("AI queue unchanged", manifest.ai_queue.unchanged),
    line("Automation resume", `${manifest.automation_resume.status} (was suspended: ${manifest.automation_resume.was_suspended})`),
    "",
    "## Mutations",
    "",
    "Expected:",
    manifest.expected_mutations.length
      ? manifest.expected_mutations.map((store) => `  - \`${store}\`: ${manifest.mutation_explanations[store]}`).join("\n")
      : "  - none",
    "",
    "Unexpected:",
    list(manifest.unexpected_mutations),
    "",
    "## Runtime, failures and recovery",
    "",
    line("API health checks", manifest.runtime.health_checks),
    line("API requests", manifest.runtime.api_requests),
    line("API failures", manifest.runtime.api_failures),
    line("Automation data statuses", JSON.stringify(manifest.runtime.automation_data_statuses)),
    line("AI provider modes", JSON.stringify(manifest.runtime.ai_provider_modes)),
    line("Runtime stopped", manifest.runtime.stopped),
    line("Runtime orphaned", manifest.runtime.orphaned_after),
    line("Lock overlaps", manifest.lock_events.overlap_count),
    line("Orphaned lock", manifest.lock_events.orphaned_after),
    "",
    "Errors:",
    list(manifest.errors),
    "",
    "Recovery:",
    list(manifest.recovery),
    "",
    "## Cycles",
    "",
    "| Run ID | Trigger | Mode | Status | Sources | Requests |",
    "|---|---|---|---|---|---|",
    ...manifest.cycles.map((cycle) => `| \`${cycle.central_run_id}\` | ${cycle.trigger} | ${cycle.mode ?? "none"} | ${cycle.status} | ${JSON.stringify(cycle.source_statuses)} | ${JSON.stringify(cycle.request_counts)} |`),
    "",
    "## Backups and Task Scheduler",
    "",
    line("Pre-soak backup", manifest.pre_soak_backup.backup_id),
    line("Pre-soak backup path", manifest.pre_soak_backup.backup_path),
    line("Post-soak backup", manifest.post_soak_backup.backup_id),
    line("Post-soak backup path", manifest.post_soak_backup.backup_path),
    line("Temporary task creations", manifest.task_scheduler.create_count),
    line("Temporary task runs", manifest.task_scheduler.run_count),
    line("Temporary task deletions", manifest.task_scheduler.delete_count),
    line("Temporary task absent", manifest.task_scheduler.final_temporary_task_absent),
    line("Production task before", `${manifest.task_scheduler.production_before.present}/${manifest.task_scheduler.production_before.state}`),
    line("Production task after", `${manifest.task_scheduler.production_after.present}/${manifest.task_scheduler.production_after.state}`),
    "",
    "## Remaining risks",
    "",
    ...manifest.remaining_risks.map((risk) => `- ${risk}`),
    "",
  ].join("\n");
}

function assertLiveEnvironment(env: NodeJS.ProcessEnv): void {
  if (env.CRYPTO_EDGE_DATA_ENV !== "INTERNAL_BETA"
    || env.CRYPTO_EDGE_RUNTIME_MODE !== "INTERNAL_BETA"
    || env.CRYPTO_EDGE_AUTOMATION_ENABLED !== "1"
    || env.ALLOW_LIVE_PROVIDER_CALLS !== "1") {
    throw new Error("RC1_LIVE_LOCAL_OPT_IN_REQUIRED");
  }
  if (env.CRYPTO_EDGE_AI_WORKER_ENABLED !== "0"
    || env.CRYPTO_EDGE_AI_RESEARCH_PROVIDER !== "DISABLED"
    || Boolean(env.OPENAI_API_KEY?.trim())) {
    throw new Error("RC1_OPENAI_NOT_DISABLED");
  }
}

async function gitSha(): Promise<string> {
  const result = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, windowsHide: true });
  const sha = result.stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("RC1_COMMIT_SHA_INVALID");
  return sha;
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomic(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(value, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

function stamp(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "RC1_ORCHESTRATION_FAILED";
  return raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 120) || "RC1_ORCHESTRATION_FAILED";
}

function mutationExplanation(store: string): string {
  const explanations: Record<string, string> = {
    central_automation_state: "Scheduler observations, cycle receipts and active snapshot pointers changed during the soak.",
    active_scanner_snapshot: "A validated scanner snapshot was published by a due scanner cycle.",
    active_context_snapshot: "A validated context snapshot was published by a due context-capable cycle.",
    central_run_once_receipt: "The controlled central run-once receipt changed.",
    follow_up_store: "Central scanner ingest/recheck updated the validated Follow-up store.",
    follow_up_backup: "The atomic Follow-up writer preserved the previous validated Follow-up generation.",
  };
  return explanations[store] ?? "Expected RC.1 operational mutation.";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

export function reportUrl(path: string): string {
  return pathToFileURL(path).href;
}
