import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export type AutomationStatusOutput = {
  enabled: boolean;
  active_run_id: string | null;
  last_result: "SUCCESS" | "PARTIAL" | "FAILED" | null;
  last_error_code: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  next_run_at: string | null;
  next_due_at: string | null;
  next_scanner_run_at: string | null;
  next_context_run_at: string | null;
  last_published_scanner_run_id: string | null;
  last_published_context_run_id: string | null;
  request_counts: Record<string, number>;
  scheduler_status: string;
  cycle_id: string | null;
  cycle_status: "IN_PROGRESS" | "SUCCESS" | "PARTIAL" | "FAILED" | null;
  cycle_duration_ms: number | null;
  snapshot_generated_at: string | null;
  snapshot_age_seconds: number | null;
  records_received: number;
  records_valid: number;
  records_rejected: number;
  new_records: number;
  follow_up_ingested: number;
  checkpoints_processed: number;
  source_statuses: Record<string, "READY" | "DEGRADED" | "UNAVAILABLE" | "NOT_INVOKED">;
  failure_code: string | null;
  safe_error: string | null;
  data_status: "FRESH" | "STALE" | "PARTIAL" | "LAST_KNOWN_GOOD" | "IN_PROGRESS" | "UNAVAILABLE";
};

export type AutomationStatusOptions = {
  enabled?: boolean;
  stateFilePath?: string;
  readState?: () => Promise<unknown>;
  now?: () => Date;
};

export async function readAutomationStatus(options: AutomationStatusOptions = {}): Promise<AutomationStatusOutput> {
  const enabled = options.enabled ?? process.env.CRYPTO_EDGE_AUTOMATION_ENABLED === "1";
  let raw: unknown;
  try {
    raw = options.readState
      ? await options.readState()
      : JSON.parse(await readFile(options.stateFilePath ?? getDefaultAutomationStatePath(), "utf8")) as unknown;
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) return initialStatus(enabled);
    return { ...initialStatus(enabled), scheduler_status: "STATE_UNAVAILABLE" };
  }
  try {
    const state = asRecord(raw);
    if (state.schema_version !== "central_automation_state_v1") throw new Error("STATE_INVALID");
    const nextScanner = nullableIso(state.next_scanner_run_at);
    const nextAlternative = nullableIso(state.next_alternative_me_run_at);
    const nextDefillama = nullableIso(state.next_defillama_run_at);
    const nextContext = earliestIso(nextAlternative, nextDefillama);
    const nextDue = earliestIso(nextScanner, nextContext);
    const cycleStatus = nullableCycleStatus(state.cycle_status ?? state.last_result);
    const snapshotGeneratedAt = nullableIso(state.snapshot_generated_at);
    const snapshotAgeSeconds = ageSeconds(snapshotGeneratedAt, options.now?.() ?? new Date());
    const sourceStatuses = safeSourceStatuses(state.source_statuses);
    return {
      enabled,
      active_run_id: nullableSafeText(state.active_run_id),
      last_result: nullableResult(state.last_result),
      last_error_code: nullableSafeText(state.last_error_code),
      last_attempt_at: nullableIso(state.last_attempt_at),
      last_success_at: nullableIso(state.last_success_at),
      last_failure_at: nullableIso(state.last_failure_at),
      next_run_at: enabled ? nextDue : null,
      next_due_at: nextDue,
      next_scanner_run_at: nextScanner,
      next_context_run_at: nextContext,
      last_published_scanner_run_id: nullableSafeText(state.last_published_scanner_run_id),
      last_published_context_run_id: nullableSafeText(state.last_published_context_run_id),
      request_counts: safeRequestCounts(state.request_counts),
      scheduler_status: safeSchedulerStatus(state.last_decision),
      cycle_id: nullableSafeText(state.cycle_id ?? state.last_run_id),
      cycle_status: cycleStatus,
      cycle_duration_ms: nullableNonNegativeInteger(state.cycle_duration_ms),
      snapshot_generated_at: snapshotGeneratedAt,
      snapshot_age_seconds: snapshotAgeSeconds,
      records_received: nonNegativeInteger(state.records_received),
      records_valid: nonNegativeInteger(state.records_valid),
      records_rejected: nonNegativeInteger(state.records_rejected),
      new_records: nonNegativeInteger(state.new_records),
      follow_up_ingested: nonNegativeInteger(state.follow_up_ingested),
      checkpoints_processed: nonNegativeInteger(state.checkpoints_processed),
      source_statuses: sourceStatuses,
      failure_code: nullableSafeText(state.failure_code ?? state.last_error_code),
      safe_error: nullableSafeDescription(state.safe_error),
      data_status: resolveDataStatus(cycleStatus, snapshotAgeSeconds, sourceStatuses),
    };
  } catch {
    return { ...initialStatus(enabled), scheduler_status: "STATE_UNAVAILABLE" };
  }
}

export function getDefaultAutomationStatePath(): string {
  const modulePath = fileURLToPath(import.meta.url);
  const marker = `${sep}tools${sep}ui-mock${sep}`;
  const index = modulePath.toLowerCase().indexOf(marker.toLowerCase());
  if (index < 0) throw new Error("AUTOMATION_STATE_PATH_UNAVAILABLE");
  const repoRoot = modulePath.slice(0, index);
  return resolve(repoRoot, "tools", "data-poc", ".local", "automation", "automation-state.json");
}

function initialStatus(enabled: boolean): AutomationStatusOutput {
  return {
    enabled,
    active_run_id: null,
    last_result: null,
    last_error_code: null,
    last_attempt_at: null,
    last_success_at: null,
    last_failure_at: null,
    next_run_at: null,
    next_due_at: null,
    next_scanner_run_at: null,
    next_context_run_at: null,
    last_published_scanner_run_id: null,
    last_published_context_run_id: null,
    request_counts: {},
    scheduler_status: "NOT_YET_RUN",
    cycle_id: null,
    cycle_status: null,
    cycle_duration_ms: null,
    snapshot_generated_at: null,
    snapshot_age_seconds: null,
    records_received: 0,
    records_valid: 0,
    records_rejected: 0,
    new_records: 0,
    follow_up_ingested: 0,
    checkpoints_processed: 0,
    source_statuses: {},
    failure_code: null,
    safe_error: null,
    data_status: "UNAVAILABLE",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("STATE_INVALID");
  return value as Record<string, unknown>;
}

function nullableIso(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return value;
  throw new Error("STATE_INVALID");
}

function nullableSafeText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) return value;
  throw new Error("STATE_INVALID");
}

function nullableResult(value: unknown): AutomationStatusOutput["last_result"] {
  if (value === undefined || value === null || value === "SUCCESS" || value === "PARTIAL" || value === "FAILED") return value ?? null;
  throw new Error("STATE_INVALID");
}

function nullableCycleStatus(value: unknown): AutomationStatusOutput["cycle_status"] {
  if (value === undefined || value === null) return null;
  if (["IN_PROGRESS", "SUCCESS", "PARTIAL", "FAILED"].includes(String(value))) {
    return value as Exclude<AutomationStatusOutput["cycle_status"], null>;
  }
  throw new Error("STATE_INVALID");
}

function nullableNonNegativeInteger(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (Number.isSafeInteger(value) && Number(value) >= 0) return Number(value);
  throw new Error("STATE_INVALID");
}

function nonNegativeInteger(value: unknown): number {
  return nullableNonNegativeInteger(value) ?? 0;
}

function nullableSafeDescription(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.length > 0 && value.length <= 240 && !/[\r\n]/.test(value)) return value;
  throw new Error("STATE_INVALID");
}

function safeSourceStatuses(value: unknown): AutomationStatusOutput["source_statuses"] {
  if (value === undefined) return {};
  const record = asRecord(value);
  return Object.fromEntries(Object.entries(record).map(([key, status]) => {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(key) || !["READY", "DEGRADED", "UNAVAILABLE", "NOT_INVOKED"].includes(String(status))) {
      throw new Error("STATE_INVALID");
    }
    return [key, status];
  })) as AutomationStatusOutput["source_statuses"];
}

function ageSeconds(timestamp: string | null, now: Date): number | null {
  if (timestamp === null || !Number.isFinite(now.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - Date.parse(timestamp)) / 1_000));
}

function resolveDataStatus(
  cycleStatus: AutomationStatusOutput["cycle_status"],
  snapshotAgeSeconds: number | null,
  sourceStatuses: AutomationStatusOutput["source_statuses"],
): AutomationStatusOutput["data_status"] {
  if (cycleStatus === "IN_PROGRESS") return "IN_PROGRESS";
  if (cycleStatus === "FAILED" && snapshotAgeSeconds !== null) return "LAST_KNOWN_GOOD";
  if (cycleStatus === "PARTIAL" || Object.values(sourceStatuses).some((status) => status === "DEGRADED" || status === "UNAVAILABLE")) {
    return "PARTIAL";
  }
  if (snapshotAgeSeconds === null) return "UNAVAILABLE";
  return snapshotAgeSeconds > 30 * 60 ? "STALE" : "FRESH";
}

function safeRequestCounts(value: unknown): Record<string, number> {
  if (value === undefined) return {};
  const record = asRecord(value);
  return Object.fromEntries(Object.entries(record).map(([key, count]) => {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(key) || !Number.isSafeInteger(count) || Number(count) < 0) {
      throw new Error("STATE_INVALID");
    }
    return [key, Number(count)];
  }));
}

function safeSchedulerStatus(value: unknown): string {
  if (value === undefined || value === null) return "NOT_YET_RUN";
  const allowed = new Set([
    "RUN_SCANNER_AND_CONTEXT", "RUN_CONTEXT_ONLY", "NOTHING_DUE", "RUN_ALREADY_IN_PROGRESS",
    "AUTOMATION_DISABLED", "STATE_UNAVAILABLE",
  ]);
  if (typeof value === "string" && allowed.has(value)) return value;
  throw new Error("STATE_INVALID");
}

function earliestIso(...values: Array<string | null>): string | null {
  const available = values.filter((value): value is string => value !== null);
  return available.sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}
