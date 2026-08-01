import { randomUUID } from "node:crypto";
import { access, mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExplicitLiveAutomationOptIn,
  runCentralLiveCycleOnce,
  runCentralSchedulerOnce,
  type RunCentralSchedulerOnceResult,
} from "../../data-poc/src/automation/runCentralAutomation.js";
import { createAutomationStateStore, type AutomationState } from "../../data-poc/src/automation/automationState.js";
import { inspectActiveGlobalCollectorLock } from "../../data-poc/src/automation/globalCollectorLock.js";
import { readFollowUpStore } from "../../data-poc/src/followUpBasket.js";
import { validatePersistableScannerOutput } from "../../data-poc/src/storageValidator.js";
import { validateDisplayEligibleContextSnapshot } from "../../data-poc/src/contextSnapshotValidator.js";

export const LOCAL_RC_SOAK_WAKEUP_SCHEMA_VERSION = "local_rc_soak_wakeup_v1";

const UI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOAK_ROOT = resolve(UI_ROOT, ".local", "local-rc-soak");
const OUTPUT_ROOT = resolve(UI_ROOT, "..", "data-poc", "output");

export type LocalRcSoakWakeupEvent = {
  schema_version: typeof LOCAL_RC_SOAK_WAKEUP_SCHEMA_VERSION;
  event_id: string;
  run_id: string;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  initial_full_cycle: boolean;
  decision: RunCentralSchedulerOnceResult["decision"] | "WAKEUP_FAILED";
  run_mode: RunCentralSchedulerOnceResult["run_mode"];
  run_status: RunCentralSchedulerOnceResult["run_status"];
  central_run_id: string | null;
  active_run_id: string | null;
  error_code: string | null;
  request_counts: Record<string, number>;
  source_statuses: Record<string, string>;
  before: PointerState;
  after: PointerState;
  scanner_snapshot_valid: boolean;
  context_snapshot_valid: boolean;
  follow_up: {
    entries_before: number;
    entries_after: number;
    audit_before: number;
    audit_after: number;
    duplicate_identities: number;
    ingested: number;
  };
  lock: {
    active_before: string | null;
    active_after: string | null;
  };
};

type PointerState = {
  scanner_run_id: string | null;
  context_run_id: string | null;
  cycle_status: AutomationState["cycle_status"];
  last_result: AutomationState["last_result"];
  last_scanner_success_at: string | null;
  last_context_success_at: string | null;
  next_scanner_run_at: string | null;
  next_alternative_me_run_at: string | null;
  next_defillama_run_at: string | null;
};

async function main(): Promise<void> {
  const runDirectory = parseRunDirectory(process.argv.slice(2));
  const event = await runWakeup(runDirectory);
  console.log(JSON.stringify({
    event_id: event.event_id,
    decision: event.decision,
    run_status: event.run_status,
    central_run_id: event.central_run_id,
  }));
  if (event.run_status === "FAILED" || event.decision === "WAKEUP_FAILED" || event.decision === "STATE_UNAVAILABLE") {
    process.exitCode = 1;
  }
}

export async function runWakeup(runDirectory: string): Promise<LocalRcSoakWakeupEvent> {
  assertSafeRunDirectory(runDirectory);
  assertLiveEnvironment(process.env);
  const control = parseControl(JSON.parse(await readFile(resolve(runDirectory, "run-control.json"), "utf8")) as unknown);
  const started = new Date();
  const eventId = `wake_${stamp(started)}_${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const stateStore = createAutomationStateStore();
  const beforeState = await stateStore.read();
  const followUpBefore = await readFollowUpStore();
  const lockBefore = await inspectActiveGlobalCollectorLock().catch(() => "LOCK_INSPECTION_FAILED");
  const initialFullCycle = await claimInitialFullCycle(runDirectory);
  let result: RunCentralSchedulerOnceResult;
  try {
    result = initialFullCycle
      ? await runCentralLiveCycleOnce({ stateStore })
      : await runCentralSchedulerOnce({ enabled: true, stateStore });
  } catch (error) {
    result = {
      decision: "STATE_UNAVAILABLE",
      run_mode: null,
      run_status: "FAILED",
      error_code: safeError(error),
    };
  }
  const finished = new Date();
  const afterState = await stateStore.read().catch(() => beforeState);
  const followUpAfter = await readFollowUpStore().catch(() => followUpBefore);
  const lockAfter = await inspectActiveGlobalCollectorLock().catch(() => "LOCK_INSPECTION_FAILED");
  const validation = await validatePointers(afterState);
  const event: LocalRcSoakWakeupEvent = {
    schema_version: LOCAL_RC_SOAK_WAKEUP_SCHEMA_VERSION,
    event_id: eventId,
    run_id: control.run_id,
    started_at: started.toISOString(),
    finished_at: finished.toISOString(),
    duration_ms: Math.max(0, finished.getTime() - started.getTime()),
    initial_full_cycle: initialFullCycle,
    decision: result.decision,
    run_mode: result.run_mode,
    run_status: result.run_status,
    central_run_id: result.run_id ?? null,
    active_run_id: result.active_run_id ?? null,
    error_code: result.error_code ?? null,
    request_counts: result.run_status === "SUCCESS" || result.run_status === "PARTIAL"
      ? { ...afterState.request_counts }
      : {},
    source_statuses: result.run_status === "SUCCESS" || result.run_status === "PARTIAL"
      ? { ...afterState.source_statuses }
      : {},
    before: pointerState(beforeState),
    after: pointerState(afterState),
    scanner_snapshot_valid: validation.scanner,
    context_snapshot_valid: validation.context,
    follow_up: {
      entries_before: followUpBefore.entries.length,
      entries_after: followUpAfter.entries.length,
      audit_before: followUpBefore.audit_log.length,
      audit_after: followUpAfter.audit_log.length,
      duplicate_identities: duplicateIdentityCount(followUpAfter.entries),
      ingested: result.run_status === "SUCCESS" || result.run_status === "PARTIAL"
        ? afterState.follow_up_ingested
        : 0,
    },
    lock: {
      active_before: lockBefore,
      active_after: lockAfter,
    },
  };
  await writeEvent(runDirectory, event);
  return event;
}

function assertLiveEnvironment(env: NodeJS.ProcessEnv): void {
  assertExplicitLiveAutomationOptIn(env);
  if (env.CRYPTO_EDGE_DATA_ENV !== "INTERNAL_BETA" || env.CRYPTO_EDGE_RUNTIME_MODE !== "INTERNAL_BETA") {
    throw new Error("RC1_INTERNAL_BETA_REQUIRED");
  }
  if (env.CRYPTO_EDGE_AI_WORKER_ENABLED !== "0"
    || env.CRYPTO_EDGE_AI_RESEARCH_PROVIDER !== "DISABLED"
    || Boolean(env.OPENAI_API_KEY?.trim())) {
    throw new Error("RC1_OPENAI_NOT_DISABLED");
  }
}

function parseRunDirectory(args: string[]): string {
  while (args[0] === "--") args.shift();
  if (args.length !== 2 || args[0] !== "--run-directory" || !args[1]) {
    throw new Error("RC1_WAKEUP_ARGUMENT_INVALID");
  }
  return resolve(args[1]);
}

function assertSafeRunDirectory(runDirectory: string): void {
  const rel = relative(SOAK_ROOT, resolve(runDirectory));
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || !/^rc1_\d{8}T\d{6}Z_[0-9a-f]{8}$/.test(rel)) {
    throw new Error("RC1_RUN_DIRECTORY_INVALID");
  }
}

function parseControl(value: unknown): { run_id: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RC1_CONTROL_INVALID");
  const record = value as Record<string, unknown>;
  if (record.schema_version !== "local_rc_soak_control_v1"
    || typeof record.run_id !== "string"
    || !/^rc1_\d{8}T\d{6}Z_[0-9a-f]{8}$/.test(record.run_id)) {
    throw new Error("RC1_CONTROL_INVALID");
  }
  return { run_id: record.run_id };
}

async function claimInitialFullCycle(runDirectory: string): Promise<boolean> {
  const path = resolve(runDirectory, "initial-full.claim");
  try {
    const handle = await open(path, "wx");
    await handle.writeFile(`${new Date().toISOString()}\n`, "utf8");
    await handle.sync();
    await handle.close();
    return true;
  } catch (error) {
    if (isErrorCode(error, "EEXIST")) return false;
    throw error;
  }
}

async function validatePointers(state: AutomationState): Promise<{ scanner: boolean; context: boolean }> {
  const scanner = await validateSnapshot(state.last_published_scanner_run_id, "full_output.json", validatePersistableScannerOutput);
  const context = await validateSnapshot(
    state.last_published_context_run_id,
    "approved_sources_output.json",
    validateDisplayEligibleContextSnapshot,
  );
  return { scanner, context };
}

async function validateSnapshot<T>(runId: string | null, fileName: string, validate: (value: T) => unknown): Promise<boolean> {
  if (!runId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) return false;
  try {
    const path = resolve(OUTPUT_ROOT, runId, fileName);
    await access(path);
    validate(JSON.parse(await readFile(path, "utf8")) as T);
    return true;
  } catch {
    return false;
  }
}

async function writeEvent(runDirectory: string, event: LocalRcSoakWakeupEvent): Promise<void> {
  const eventsDirectory = resolve(runDirectory, "events");
  await mkdir(eventsDirectory, { recursive: true });
  const finalPath = resolve(eventsDirectory, `${event.event_id}.json`);
  const temporaryPath = `${finalPath}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(event, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, finalPath);
}

function pointerState(state: AutomationState): PointerState {
  return {
    scanner_run_id: state.last_published_scanner_run_id,
    context_run_id: state.last_published_context_run_id,
    cycle_status: state.cycle_status,
    last_result: state.last_result,
    last_scanner_success_at: state.last_scanner_success_at,
    last_context_success_at: state.last_context_success_at,
    next_scanner_run_at: state.next_scanner_run_at,
    next_alternative_me_run_at: state.next_alternative_me_run_at,
    next_defillama_run_at: state.next_defillama_run_at,
  };
}

function duplicateIdentityCount(entries: Array<{ chain: string; contract_address: string }>): number {
  const identities = entries.map((entry) => `${entry.chain}:${entry.contract_address}`);
  return identities.length - new Set(identities).size;
}

function stamp(value: Date): string {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "RC1_WAKEUP_FAILED";
  return raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 120) || "RC1_WAKEUP_FAILED";
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

if (process.argv[1]?.endsWith("runLocalRcSoakWakeup.ts") || process.argv[1]?.endsWith("runLocalRcSoakWakeup.js")) {
  await main();
}
