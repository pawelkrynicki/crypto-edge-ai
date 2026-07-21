import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getDefaultAutomationDirectory } from "./automationPaths.js";

export const AUTOMATION_STATE_SCHEMA_VERSION = "central_automation_state_v1";

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
  };
  return state;
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
