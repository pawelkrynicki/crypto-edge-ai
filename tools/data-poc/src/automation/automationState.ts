import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getDefaultAutomationDirectory } from "./automationPaths.js";

export const AUTOMATION_STATE_SCHEMA_VERSION = "central_automation_state_v1";
export const AUTOMATION_SCHEDULER_SCHEMA_VERSION = "central_source_scheduler_v1";

export type AutomationSchedulerDecision =
  | "RUN_SCANNER_AND_CONTEXT"
  | "RUN_CONTEXT_ONLY"
  | "NOTHING_DUE"
  | "RUN_ALREADY_IN_PROGRESS"
  | "AUTOMATION_DISABLED"
  | "STATE_UNAVAILABLE";

export type AutomationRequestCounts = Record<string, number>;

export type AutomationState = {
  schema_version: typeof AUTOMATION_STATE_SCHEMA_VERSION;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_run_id: string | null;
  active_run_id: string | null;
  last_result: "SUCCESS" | "FAILED" | null;
  last_error_code: string | null;
  request_counts: AutomationRequestCounts;
  last_published_scanner_run_id: string | null;
  last_published_context_run_id: string | null;
  scheduler_schema_version: typeof AUTOMATION_SCHEDULER_SCHEMA_VERSION;
  last_scheduler_check_at: string | null;
  last_decision: AutomationSchedulerDecision | null;
  next_scanner_run_at: string | null;
  next_alternative_me_run_at: string | null;
  next_defillama_run_at: string | null;
  last_scanner_success_at: string | null;
  last_context_success_at: string | null;
  last_scanner_run_id: string | null;
  last_context_run_id: string | null;
  missed_schedule_count: number;
};

export type AutomationStateStore = {
  read: () => Promise<AutomationState>;
  write: (state: AutomationState) => Promise<void>;
};

export class AutomationStateError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AutomationStateError";
    this.code = code;
  }
}

export function createInitialAutomationState(): AutomationState {
  return {
    schema_version: AUTOMATION_STATE_SCHEMA_VERSION,
    last_attempt_at: null,
    last_success_at: null,
    last_failure_at: null,
    last_run_id: null,
    active_run_id: null,
    last_result: null,
    last_error_code: null,
    request_counts: {},
    last_published_scanner_run_id: null,
    last_published_context_run_id: null,
    scheduler_schema_version: AUTOMATION_SCHEDULER_SCHEMA_VERSION,
    last_scheduler_check_at: null,
    last_decision: null,
    next_scanner_run_at: null,
    next_alternative_me_run_at: null,
    next_defillama_run_at: null,
    last_scanner_success_at: null,
    last_context_success_at: null,
    last_scanner_run_id: null,
    last_context_run_id: null,
    missed_schedule_count: 0,
  };
}

export function createAutomationStateStore(directoryPath = getDefaultAutomationDirectory()): AutomationStateStore {
  const statePath = resolve(directoryPath, "automation-state.json");
  return {
    read: () => readAutomationState(statePath),
    write: (state) => writeAutomationStateAtomic(statePath, state),
  };
}

export async function readAutomationState(statePath: string): Promise<AutomationState> {
  let serialized: string;
  try {
    serialized = await readFile(statePath, "utf8");
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return createInitialAutomationState();
    throw new AutomationStateError("AUTOMATION_STATE_READ_FAILED");
  }

  try {
    return normalizeAutomationState(JSON.parse(serialized) as unknown);
  } catch (error) {
    if (error instanceof AutomationStateError) throw error;
    throw new AutomationStateError("AUTOMATION_STATE_INVALID");
  }
}

export async function writeAutomationStateAtomic(statePath: string, state: AutomationState): Promise<void> {
  const normalized = normalizeAutomationState(state);
  const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(statePath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, statePath);
  } catch {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw new AutomationStateError("AUTOMATION_STATE_WRITE_FAILED");
  }
}

export function normalizeAutomationState(value: unknown): AutomationState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AutomationStateError("AUTOMATION_STATE_INVALID");
  }
  const record = value as Record<string, unknown>;
  if (record.schema_version !== AUTOMATION_STATE_SCHEMA_VERSION) {
    throw new AutomationStateError("AUTOMATION_STATE_INVALID");
  }

  const state: AutomationState = {
    schema_version: AUTOMATION_STATE_SCHEMA_VERSION,
    last_attempt_at: nullableIso(record.last_attempt_at),
    last_success_at: nullableIso(record.last_success_at),
    last_failure_at: nullableIso(record.last_failure_at),
    last_run_id: nullableSafeText(record.last_run_id),
    active_run_id: nullableSafeText(record.active_run_id),
    last_result: record.last_result === null || record.last_result === "SUCCESS" || record.last_result === "FAILED"
      ? record.last_result
      : invalidState(),
    last_error_code: nullableSafeText(record.last_error_code),
    request_counts: normalizeRequestCounts(record.request_counts),
    last_published_scanner_run_id: nullableSafeText(record.last_published_scanner_run_id),
    last_published_context_run_id: nullableSafeText(record.last_published_context_run_id),
    scheduler_schema_version: optionalSchedulerVersion(record.scheduler_schema_version),
    last_scheduler_check_at: optionalNullableIso(record.last_scheduler_check_at),
    last_decision: optionalDecision(record.last_decision),
    next_scanner_run_at: optionalNullableIso(record.next_scanner_run_at),
    next_alternative_me_run_at: optionalNullableIso(record.next_alternative_me_run_at),
    next_defillama_run_at: optionalNullableIso(record.next_defillama_run_at),
    last_scanner_success_at: optionalNullableIso(record.last_scanner_success_at),
    last_context_success_at: optionalNullableIso(record.last_context_success_at),
    last_scanner_run_id: optionalNullableSafeText(record.last_scanner_run_id),
    last_context_run_id: optionalNullableSafeText(record.last_context_run_id),
    missed_schedule_count: optionalNonNegativeInteger(record.missed_schedule_count),
  };
  return state;
}

function optionalSchedulerVersion(value: unknown): typeof AUTOMATION_SCHEDULER_SCHEMA_VERSION {
  if (value === undefined || value === AUTOMATION_SCHEDULER_SCHEMA_VERSION) return AUTOMATION_SCHEDULER_SCHEMA_VERSION;
  return invalidState();
}

function optionalDecision(value: unknown): AutomationSchedulerDecision | null {
  if (value === undefined || value === null) return null;
  if ([
    "RUN_SCANNER_AND_CONTEXT", "RUN_CONTEXT_ONLY", "NOTHING_DUE",
    "RUN_ALREADY_IN_PROGRESS", "AUTOMATION_DISABLED", "STATE_UNAVAILABLE",
  ].includes(String(value))) return value as AutomationSchedulerDecision;
  return invalidState();
}

function optionalNullableIso(value: unknown): string | null {
  return value === undefined ? null : nullableIso(value);
}

function optionalNullableSafeText(value: unknown): string | null {
  return value === undefined ? null : nullableSafeText(value);
}

function optionalNonNegativeInteger(value: unknown): number {
  if (value === undefined) return 0;
  if (Number.isSafeInteger(value) && Number(value) >= 0) return Number(value);
  return invalidState();
}

function normalizeRequestCounts(value: unknown): AutomationRequestCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidState();
  const counts: AutomationRequestCounts = {};
  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(key) || !Number.isSafeInteger(count) || Number(count) < 0) invalidState();
    counts[key] = Number(count);
  }
  return counts;
}

function nullableIso(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return value;
  return invalidState();
}

function nullableSafeText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) return value;
  return invalidState();
}

function invalidState(): never {
  throw new AutomationStateError("AUTOMATION_STATE_INVALID");
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
