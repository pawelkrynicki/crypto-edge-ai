import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getDataPocRuntimeRoot } from "./dataPocRuntimeRoot.js";
import type { PersistableCandidate } from "./persistableScannerModel.js";

export const LEGACY_NEW_RECHECK_STORE_SCHEMA_VERSION = "new_recheck_store_v1";
export const PREVIOUS_NEW_RECHECK_STORE_SCHEMA_VERSION = "new_recheck_store_v2";
export const NEW_RECHECK_STORE_SCHEMA_VERSION = "new_recheck_store_v3";
export const NEW_RECHECK_CHECKPOINT_DAYS = [1, 3, 8, 14, 30, 60, 90] as const;
export const NEW_RECHECK_MAX_ATTEMPTS_PER_CHECKPOINT = 4;
export type NewRecheckCheckpointDay = (typeof NEW_RECHECK_CHECKPOINT_DAYS)[number];
export type NewRecheckCheckpointOutcome = "PENDING" | "RETRY_WAIT" | "SUCCESS" | "EXHAUSTED";

export type NewRecheckCheckpointState = {
  checkpoint: NewRecheckCheckpointDay;
  attempt_count: number;
  last_attempt_at: string | null;
  last_error_code: string | null;
  retry_not_before: string | null;
  outcome: NewRecheckCheckpointOutcome;
};

export type NewRecheckFilterResult = {
  status: "passed_basic_filter" | "rejected_basic_filter";
  reasons: string[];
  evaluated_at: string;
};

export type NewRecheckEntry = {
  identity: string;
  chain: string;
  contract_address: string;
  /** Immutable historical discovery timestamp. */
  first_seen_at: string;
  /** Operational origin used to calculate DISC.1 incubation checkpoints. */
  schedule_origin_at: string;
  completed_checkpoints: NewRecheckCheckpointDay[];
  checkpoint_states: NewRecheckCheckpointState[];
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_checkpoint: NewRecheckCheckpointDay | null;
  next_checkpoint: NewRecheckCheckpointDay | null;
  latest_source_timestamp: string | null;
  latest_normalized_candidate: PersistableCandidate | null;
  latest_filter_result: NewRecheckFilterResult | null;
  last_error_code: string | null;
};

export type NewRecheckReceipt = {
  recheck_id: string;
  central_cycle_id: string | null;
  started_at: string;
  finished_at: string;
  records_due: number;
  records_selected: number;
  records_rechecked: number;
  records_failed: number;
  provider_batches: number;
  provider_request_count: number;
  promoted_to_follow_up: number;
  duplicate_noop: number;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
};

export type NewRecheckStore = {
  schema_version: typeof NEW_RECHECK_STORE_SCHEMA_VERSION;
  generated_at: string;
  entries: NewRecheckEntry[];
  last_receipt: NewRecheckReceipt | null;
  checksum: string;
};

export type NewRecheckStoreValidationCode =
  | "INVALID_STORE"
  | "UNKNOWN_FIELD"
  | "INVALID_ENTRY"
  | "INVALID_CANDIDATE"
  | "INVALID_FILTER_RESULT"
  | "INVALID_CHECKPOINT_STATE"
  | "INVALID_RECEIPT"
  | "CHECKSUM_MISMATCH";

export class NewRecheckStoreValidationError extends Error {
  readonly code: NewRecheckStoreValidationCode;
  readonly field: string | null;

  constructor(code: NewRecheckStoreValidationCode, field: string | null = null) {
    super(`NEW_RECHECK_STORE_${code}`);
    this.name = "NewRecheckStoreValidationError";
    this.code = code;
    this.field = field;
  }
}

export type NewRecheckValidationDiagnostic = {
  valid: boolean;
  code: "VALID" | `NEW_RECHECK_STORE_${NewRecheckStoreValidationCode}`;
  field?: string;
};

type LegacyNewRecheckEntry = Omit<NewRecheckEntry, "checkpoint_states" | "schedule_origin_at">;
type LegacyNewRecheckStore = {
  schema_version: typeof LEGACY_NEW_RECHECK_STORE_SCHEMA_VERSION;
  generated_at: string;
  entries: LegacyNewRecheckEntry[];
  last_receipt: NewRecheckReceipt | null;
  checksum: string;
};
type PreviousNewRecheckEntry = Omit<NewRecheckEntry, "schedule_origin_at">;
type PreviousNewRecheckStore = {
  schema_version: typeof PREVIOUS_NEW_RECHECK_STORE_SCHEMA_VERSION;
  generated_at: string;
  entries: PreviousNewRecheckEntry[];
  last_receipt: NewRecheckReceipt | null;
  checksum: string;
};

const STORE_FIELDS = new Set(["schema_version", "generated_at", "entries", "last_receipt", "checksum"]);
const ENTRY_FIELDS = new Set(["identity", "chain", "contract_address", "first_seen_at", "schedule_origin_at", "completed_checkpoints", "checkpoint_states", "last_attempt_at", "last_success_at", "last_checkpoint", "next_checkpoint", "latest_source_timestamp", "latest_normalized_candidate", "latest_filter_result", "last_error_code"]);
const PREVIOUS_ENTRY_FIELDS = new Set(["identity", "chain", "contract_address", "first_seen_at", "completed_checkpoints", "checkpoint_states", "last_attempt_at", "last_success_at", "last_checkpoint", "next_checkpoint", "latest_source_timestamp", "latest_normalized_candidate", "latest_filter_result", "last_error_code"]);
const LEGACY_ENTRY_FIELDS = new Set(["identity", "chain", "contract_address", "first_seen_at", "completed_checkpoints", "last_attempt_at", "last_success_at", "last_checkpoint", "next_checkpoint", "latest_source_timestamp", "latest_normalized_candidate", "latest_filter_result", "last_error_code"]);
const CHECKPOINT_STATE_FIELDS = new Set(["checkpoint", "attempt_count", "last_attempt_at", "last_error_code", "retry_not_before", "outcome"]);
const FILTER_FIELDS = new Set(["status", "reasons", "evaluated_at"]);
const RECEIPT_FIELDS = new Set(["recheck_id", "central_cycle_id", "started_at", "finished_at", "records_due", "records_selected", "records_rechecked", "records_failed", "provider_batches", "provider_request_count", "promoted_to_follow_up", "duplicate_noop", "status"]);
const HOUR_MS = 60 * 60 * 1000;

export function getDefaultNewRecheckStorePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.CRYPTO_EDGE_NEW_RECHECK_STORE_PATH?.trim() || resolve(getDataPocRuntimeRoot(env), ".local", "new-recheck", "store.json"));
}

export function createEmptyNewRecheckStore(now = new Date(0)): NewRecheckStore {
  return finalizeNewRecheckStore({ schema_version: NEW_RECHECK_STORE_SCHEMA_VERSION, generated_at: iso(now), entries: [], last_receipt: null }, now);
}

export async function readNewRecheckStore(path = getDefaultNewRecheckStorePath()): Promise<NewRecheckStore> {
  try {
    return validateNewRecheckStore(JSON.parse(await readFile(resolve(path), "utf8")) as unknown);
  } catch (error) {
    if (isError(error, "ENOENT")) return createEmptyNewRecheckStore();
    throw new Error("NEW_RECHECK_STORE_INVALID", { cause: error });
  }
}

export async function updateNewRecheckStore(
  mutation: (store: NewRecheckStore) => NewRecheckStore,
  path = getDefaultNewRecheckStorePath(),
): Promise<NewRecheckStore> {
  return withStoreLock(path, async () => {
    const current = await readNewRecheckStore(path);
    const next = validateNewRecheckStore(mutation(current));
    if (canonical(current) === canonical(next)) return current;
    await writeJsonAtomic(path, next);
    return next;
  });
}

/** Canonical persistence order only; upstream basic-filter reason order remains untouched. */
export function canonicalizeNewRecheckFilterReasons(reasons: readonly string[]): string[] {
  return [...new Set(reasons.filter(isFilterReasonText))].sort((left, right) => left.localeCompare(right));
}

export function createNewRecheckFilterResult(
  status: NewRecheckFilterResult["status"],
  reasons: readonly string[],
  evaluatedAt: string,
): NewRecheckFilterResult {
  if (!reasons.every(isFilterReasonText)) invalid("INVALID_FILTER_RESULT", "latest_filter_result.reasons");
  if (!isoText(evaluatedAt)) invalid("INVALID_FILTER_RESULT", "latest_filter_result.evaluated_at");
  return { status, reasons: canonicalizeNewRecheckFilterReasons(reasons), evaluated_at: evaluatedAt };
}

export function createNewRecheckCheckpointStates(): NewRecheckCheckpointState[] {
  return NEW_RECHECK_CHECKPOINT_DAYS.map((checkpoint) => pendingCheckpointState(checkpoint));
}

export function checkpointState(entry: Pick<NewRecheckEntry, "checkpoint_states">, checkpoint: NewRecheckCheckpointDay): NewRecheckCheckpointState {
  const state = entry.checkpoint_states.find((item) => item.checkpoint === checkpoint);
  if (!state) throw new NewRecheckStoreValidationError("INVALID_CHECKPOINT_STATE", `checkpoint_states.${checkpoint}`);
  return state;
}

export function isNewRecheckCheckpointDue(entry: NewRecheckEntry, checkpoint: NewRecheckCheckpointDay, now: Date): boolean {
  if (Date.parse(entry.schedule_origin_at) + checkpoint * 86_400_000 > now.getTime()) return false;
  const state = checkpointState(entry, checkpoint);
  return state.outcome === "PENDING"
    || state.outcome === "RETRY_WAIT" && state.retry_not_before !== null && Date.parse(state.retry_not_before) <= now.getTime();
}

export function updateCheckpointAfterFailure(
  state: NewRecheckCheckpointState,
  errorCode: string,
  now: Date,
): NewRecheckCheckpointState {
  const attemptCount = state.attempt_count + 1;
  if (attemptCount >= NEW_RECHECK_MAX_ATTEMPTS_PER_CHECKPOINT) {
    return { checkpoint: state.checkpoint, attempt_count: NEW_RECHECK_MAX_ATTEMPTS_PER_CHECKPOINT, last_attempt_at: iso(now), last_error_code: errorCode, retry_not_before: null, outcome: "EXHAUSTED" };
  }
  return { checkpoint: state.checkpoint, attempt_count: attemptCount, last_attempt_at: iso(now), last_error_code: errorCode, retry_not_before: new Date(now.getTime() + retryDelayMs(attemptCount)).toISOString(), outcome: "RETRY_WAIT" };
}

export function updateCheckpointAfterSuccess(state: NewRecheckCheckpointState, now: Date): NewRecheckCheckpointState {
  return { checkpoint: state.checkpoint, attempt_count: Math.max(1, state.attempt_count + 1), last_attempt_at: iso(now), last_error_code: null, retry_not_before: null, outcome: "SUCCESS" };
}

export function nextCheckpoint(entry: Pick<NewRecheckEntry, "completed_checkpoints">): NewRecheckCheckpointDay | null {
  return NEW_RECHECK_CHECKPOINT_DAYS.find((checkpoint) => !entry.completed_checkpoints.includes(checkpoint)) ?? null;
}

export function nextAvailableCheckpoint(states: readonly NewRecheckCheckpointState[]): NewRecheckCheckpointDay | null {
  return [...states].sort((left, right) => left.checkpoint - right.checkpoint).find((state) => state.outcome === "PENDING" || state.outcome === "RETRY_WAIT")?.checkpoint ?? null;
}

export function validationDiagnostic(error: unknown): NewRecheckValidationDiagnostic {
  if (error instanceof NewRecheckStoreValidationError) {
    return { valid: false, code: `NEW_RECHECK_STORE_${error.code}`, ...(error.field ? { field: error.field } : {}) };
  }
  return { valid: false, code: "NEW_RECHECK_STORE_INVALID_STORE" };
}

export function validateNewRecheckStore(value: unknown): NewRecheckStore {
  if (!record(value)) invalid("INVALID_STORE");
  if (value.schema_version === LEGACY_NEW_RECHECK_STORE_SCHEMA_VERSION) return migrateLegacyStore(validateLegacyStore(value));
  if (value.schema_version === PREVIOUS_NEW_RECHECK_STORE_SCHEMA_VERSION) return migratePreviousStore(validatePreviousStore(value));
  if (value.schema_version !== NEW_RECHECK_STORE_SCHEMA_VERSION) invalid("INVALID_STORE", "schema_version");
  return validateV3Store(value);
}

export function finalizeNewRecheckStore(store: Omit<NewRecheckStore, "checksum"> | NewRecheckStore, now: Date): NewRecheckStore {
  const base: Omit<NewRecheckStore, "checksum"> = {
    schema_version: NEW_RECHECK_STORE_SCHEMA_VERSION,
    generated_at: iso(now),
    entries: store.entries.map(validateV3Entry).sort((left, right) => left.identity.localeCompare(right.identity)),
    last_receipt: store.last_receipt === null ? null : validateReceipt(store.last_receipt),
  };
  return { ...base, checksum: checksum(base) };
}

function validateV3Store(value: Record<string, unknown>): NewRecheckStore {
  if (!isoText(value.generated_at) || !Array.isArray(value.entries) || !(value.last_receipt === null || record(value.last_receipt)) || typeof value.checksum !== "string") invalid("INVALID_STORE");
  assertExactFields(value, STORE_FIELDS, "store");
  const entries = value.entries.map(validateV3Entry).sort((left, right) => left.identity.localeCompare(right.identity));
  if (new Set(entries.map((entry) => entry.identity)).size !== entries.length) invalid("INVALID_ENTRY", "entries.identity");
  const base: Omit<NewRecheckStore, "checksum"> = { schema_version: NEW_RECHECK_STORE_SCHEMA_VERSION, generated_at: value.generated_at, entries, last_receipt: value.last_receipt === null ? null : validateReceipt(value.last_receipt) };
  if (value.checksum !== checksum(base)) invalid("CHECKSUM_MISMATCH", "checksum");
  return { ...base, checksum: value.checksum };
}

function validatePreviousStore(value: Record<string, unknown>): PreviousNewRecheckStore {
  if (!isoText(value.generated_at) || !Array.isArray(value.entries) || !(value.last_receipt === null || record(value.last_receipt)) || typeof value.checksum !== "string") invalid("INVALID_STORE");
  assertExactFields(value, STORE_FIELDS, "store");
  const entries = value.entries.map(validatePreviousEntry).sort((left, right) => left.identity.localeCompare(right.identity));
  if (new Set(entries.map((entry) => entry.identity)).size !== entries.length) invalid("INVALID_ENTRY", "entries.identity");
  const base: Omit<PreviousNewRecheckStore, "checksum"> = { schema_version: PREVIOUS_NEW_RECHECK_STORE_SCHEMA_VERSION, generated_at: value.generated_at, entries, last_receipt: value.last_receipt === null ? null : validateReceipt(value.last_receipt) };
  if (value.checksum !== checksum(base)) invalid("CHECKSUM_MISMATCH", "checksum");
  return { ...base, checksum: value.checksum };
}

function validateLegacyStore(value: Record<string, unknown>): LegacyNewRecheckStore {
  if (!isoText(value.generated_at) || !Array.isArray(value.entries) || !(value.last_receipt === null || record(value.last_receipt)) || typeof value.checksum !== "string") invalid("INVALID_STORE");
  assertExactFields(value, STORE_FIELDS, "store");
  const entries = value.entries.map(validateLegacyEntry).sort((left, right) => left.identity.localeCompare(right.identity));
  if (new Set(entries.map((entry) => entry.identity)).size !== entries.length) invalid("INVALID_ENTRY", "entries.identity");
  const base: Omit<LegacyNewRecheckStore, "checksum"> = { schema_version: LEGACY_NEW_RECHECK_STORE_SCHEMA_VERSION, generated_at: value.generated_at, entries, last_receipt: value.last_receipt === null ? null : validateReceipt(value.last_receipt) };
  if (value.checksum !== checksum(base)) invalid("CHECKSUM_MISMATCH", "checksum");
  return { ...base, checksum: value.checksum };
}

function migrateLegacyStore(store: LegacyNewRecheckStore): NewRecheckStore {
  const entries = store.entries.map((entry) => {
    const states = createNewRecheckCheckpointStates().map((state) => entry.completed_checkpoints.includes(state.checkpoint)
      ? { ...state, attempt_count: 1, last_attempt_at: entry.last_success_at ?? entry.last_attempt_at, outcome: "SUCCESS" as const }
      : state,
    );
    return validateV3Entry({ ...entry, schedule_origin_at: entry.first_seen_at, checkpoint_states: states, next_checkpoint: nextAvailableCheckpoint(states), latest_filter_result: entry.latest_filter_result === null ? null : createNewRecheckFilterResult(entry.latest_filter_result.status, entry.latest_filter_result.reasons, entry.latest_filter_result.evaluated_at) });
  });
  return finalizeNewRecheckStore({ schema_version: NEW_RECHECK_STORE_SCHEMA_VERSION, generated_at: store.generated_at, entries, last_receipt: store.last_receipt }, new Date(store.generated_at));
}

function migratePreviousStore(store: PreviousNewRecheckStore): NewRecheckStore {
  const entries = store.entries.map((entry) => validateV3Entry({ ...entry, schedule_origin_at: entry.first_seen_at }));
  return finalizeNewRecheckStore({ schema_version: NEW_RECHECK_STORE_SCHEMA_VERSION, generated_at: store.generated_at, entries, last_receipt: store.last_receipt }, new Date(store.generated_at));
}

function validateV3Entry(value: unknown): NewRecheckEntry {
  if (!record(value)) invalid("INVALID_ENTRY", "entry");
  assertExactFields(value, ENTRY_FIELDS, "entry");
  const common = validateEntryCommon(value);
  if (!isoText(value.schedule_origin_at)) invalid("INVALID_ENTRY", "schedule_origin_at");
  if (!Array.isArray(value.checkpoint_states)) invalid("INVALID_CHECKPOINT_STATE", "checkpoint_states");
  const states = value.checkpoint_states.map(validateCheckpointState).sort((left, right) => left.checkpoint - right.checkpoint);
  if (states.length !== NEW_RECHECK_CHECKPOINT_DAYS.length || states.some((state, index) => state.checkpoint !== NEW_RECHECK_CHECKPOINT_DAYS[index])) invalid("INVALID_CHECKPOINT_STATE", "checkpoint_states");
  const completed = states.filter((state) => state.outcome === "SUCCESS").map((state) => state.checkpoint);
  if (canonical(completed) !== canonical(common.completed_checkpoints)) invalid("INVALID_CHECKPOINT_STATE", "completed_checkpoints");
  const expectedNext = nextAvailableCheckpoint(states);
  if (common.next_checkpoint !== expectedNext || (common.last_checkpoint !== null && !completed.includes(common.last_checkpoint))) invalid("INVALID_CHECKPOINT_STATE", "next_checkpoint");
  return { ...common, schedule_origin_at: value.schedule_origin_at, completed_checkpoints: completed, checkpoint_states: states, next_checkpoint: expectedNext };
}

function validatePreviousEntry(value: unknown): PreviousNewRecheckEntry {
  if (!record(value)) invalid("INVALID_ENTRY", "entry");
  assertExactFields(value, PREVIOUS_ENTRY_FIELDS, "entry");
  const common = validateEntryCommon(value);
  if (!Array.isArray(value.checkpoint_states)) invalid("INVALID_CHECKPOINT_STATE", "checkpoint_states");
  const states = value.checkpoint_states.map(validateCheckpointState).sort((left, right) => left.checkpoint - right.checkpoint);
  if (states.length !== NEW_RECHECK_CHECKPOINT_DAYS.length || states.some((state, index) => state.checkpoint !== NEW_RECHECK_CHECKPOINT_DAYS[index])) invalid("INVALID_CHECKPOINT_STATE", "checkpoint_states");
  const completed = states.filter((state) => state.outcome === "SUCCESS").map((state) => state.checkpoint);
  if (canonical(completed) !== canonical(common.completed_checkpoints)) invalid("INVALID_CHECKPOINT_STATE", "completed_checkpoints");
  const expectedNext = nextAvailableCheckpoint(states);
  if (common.next_checkpoint !== expectedNext || (common.last_checkpoint !== null && !completed.includes(common.last_checkpoint))) invalid("INVALID_CHECKPOINT_STATE", "next_checkpoint");
  return { ...common, completed_checkpoints: completed, checkpoint_states: states, next_checkpoint: expectedNext };
}

function validateLegacyEntry(value: unknown): LegacyNewRecheckEntry {
  if (!record(value)) invalid("INVALID_ENTRY", "entry");
  assertExactFields(value, LEGACY_ENTRY_FIELDS, "entry");
  // Preserve the exact v1 wire representation while verifying its old checksum.
  // Canonicalization happens only when it is migrated to v2 below.
  const common = validateEntryCommon(value, false);
  const expectedNext = nextCheckpoint({ completed_checkpoints: common.completed_checkpoints });
  if (common.next_checkpoint !== expectedNext || (common.last_checkpoint !== null && !common.completed_checkpoints.includes(common.last_checkpoint))) invalid("INVALID_CHECKPOINT_STATE", "next_checkpoint");
  return { ...common, next_checkpoint: expectedNext };
}

function validateEntryCommon(value: Record<string, unknown>, canonicalizeFilter = true): Omit<NewRecheckEntry, "checkpoint_states" | "schedule_origin_at"> {
  if (!text(value.identity, 240) || !text(value.chain, 64) || !text(value.contract_address, 180) || !isoText(value.first_seen_at) || !Array.isArray(value.completed_checkpoints) || !value.completed_checkpoints.every(isCheckpoint) || !nullableIso(value.last_attempt_at) || !nullableIso(value.last_success_at) || !(value.last_checkpoint === null || isCheckpoint(value.last_checkpoint)) || !(value.next_checkpoint === null || isCheckpoint(value.next_checkpoint)) || !nullableIso(value.latest_source_timestamp) || !(value.latest_normalized_candidate === null || validCandidate(value.latest_normalized_candidate)) || !(value.latest_filter_result === null || record(value.latest_filter_result)) || !(value.last_error_code === null || text(value.last_error_code, 160))) invalid("INVALID_ENTRY", "entry");
  const filter = value.latest_filter_result === null ? null : validateFilter(value.latest_filter_result, canonicalizeFilter);
  if (filter && value.latest_normalized_candidate === null) invalid("INVALID_FILTER_RESULT", "latest_filter_result");
  const latest = value.latest_normalized_candidate as PersistableCandidate | null;
  if (latest && (latest.chain.toLowerCase() !== value.chain.trim().toLowerCase() || latest.contract_address !== value.contract_address.trim() || (filter !== null && filter.status !== latest.basic_filter_status))) invalid("INVALID_CANDIDATE", "latest_normalized_candidate");
  return {
    identity: value.identity.trim(), chain: value.chain.trim().toLowerCase(), contract_address: value.contract_address.trim(), first_seen_at: value.first_seen_at,
    completed_checkpoints: [...new Set(value.completed_checkpoints as NewRecheckCheckpointDay[])].sort((left, right) => left - right),
    last_attempt_at: value.last_attempt_at, last_success_at: value.last_success_at, last_checkpoint: value.last_checkpoint as NewRecheckCheckpointDay | null, next_checkpoint: value.next_checkpoint as NewRecheckCheckpointDay | null,
    latest_source_timestamp: value.latest_source_timestamp, latest_normalized_candidate: latest, latest_filter_result: filter, last_error_code: value.last_error_code,
  };
}

function validateCheckpointState(value: unknown): NewRecheckCheckpointState {
  if (!record(value)) invalid("INVALID_CHECKPOINT_STATE", "checkpoint_states");
  assertExactFields(value, CHECKPOINT_STATE_FIELDS, "checkpoint_states");
  if (!isCheckpoint(value.checkpoint) || !Number.isSafeInteger(value.attempt_count) || Number(value.attempt_count) < 0 || Number(value.attempt_count) > NEW_RECHECK_MAX_ATTEMPTS_PER_CHECKPOINT || !nullableIso(value.last_attempt_at) || !(value.last_error_code === null || text(value.last_error_code, 160)) || !nullableIso(value.retry_not_before) || !isCheckpointOutcome(value.outcome)) invalid("INVALID_CHECKPOINT_STATE", "checkpoint_states");
  const state: NewRecheckCheckpointState = { checkpoint: value.checkpoint, attempt_count: Number(value.attempt_count), last_attempt_at: value.last_attempt_at, last_error_code: value.last_error_code, retry_not_before: value.retry_not_before, outcome: value.outcome };
  if (state.outcome === "PENDING" && (state.attempt_count !== 0 || state.last_attempt_at !== null || state.last_error_code !== null || state.retry_not_before !== null)) invalid("INVALID_CHECKPOINT_STATE", `checkpoint_states.${state.checkpoint}`);
  if (state.outcome === "RETRY_WAIT" && (state.attempt_count < 1 || state.attempt_count >= NEW_RECHECK_MAX_ATTEMPTS_PER_CHECKPOINT || state.last_attempt_at === null || state.last_error_code === null || state.retry_not_before === null || Date.parse(state.retry_not_before) <= Date.parse(state.last_attempt_at))) invalid("INVALID_CHECKPOINT_STATE", `checkpoint_states.${state.checkpoint}`);
  if (state.outcome === "SUCCESS" && (state.attempt_count < 1 || state.last_error_code !== null || state.retry_not_before !== null)) invalid("INVALID_CHECKPOINT_STATE", `checkpoint_states.${state.checkpoint}`);
  if (state.outcome === "EXHAUSTED" && (state.attempt_count !== NEW_RECHECK_MAX_ATTEMPTS_PER_CHECKPOINT || state.last_attempt_at === null || state.last_error_code === null || state.retry_not_before !== null)) invalid("INVALID_CHECKPOINT_STATE", `checkpoint_states.${state.checkpoint}`);
  return state;
}

function validateFilter(value: Record<string, unknown>, canonicalize = true): NewRecheckFilterResult {
  assertExactFields(value, FILTER_FIELDS, "latest_filter_result");
  if (!(value.status === "passed_basic_filter" || value.status === "rejected_basic_filter") || !Array.isArray(value.reasons) || !value.reasons.every(isFilterReasonText) || !isoText(value.evaluated_at)) invalid("INVALID_FILTER_RESULT", "latest_filter_result");
  return canonicalize
    ? createNewRecheckFilterResult(value.status, value.reasons, value.evaluated_at)
    : { status: value.status, reasons: [...value.reasons], evaluated_at: value.evaluated_at };
}

function validateReceipt(value: Record<string, unknown>): NewRecheckReceipt {
  assertExactFields(value, RECEIPT_FIELDS, "last_receipt");
  if (!text(value.recheck_id, 128) || !(value.central_cycle_id === null || text(value.central_cycle_id, 128)) || !isoText(value.started_at) || !isoText(value.finished_at) || !["SUCCESS", "PARTIAL", "FAILED"].includes(String(value.status))) invalid("INVALID_RECEIPT", "last_receipt");
  const numeric = ["records_due", "records_selected", "records_rechecked", "records_failed", "provider_batches", "provider_request_count", "promoted_to_follow_up", "duplicate_noop"] as const;
  if (!numeric.every((key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0)) invalid("INVALID_RECEIPT", "last_receipt");
  return { recheck_id: value.recheck_id, central_cycle_id: value.central_cycle_id, started_at: value.started_at, finished_at: value.finished_at, records_due: Number(value.records_due), records_selected: Number(value.records_selected), records_rechecked: Number(value.records_rechecked), records_failed: Number(value.records_failed), provider_batches: Number(value.provider_batches), provider_request_count: Number(value.provider_request_count), promoted_to_follow_up: Number(value.promoted_to_follow_up), duplicate_noop: Number(value.duplicate_noop), status: value.status as NewRecheckReceipt["status"] };
}

function validCandidate(value: unknown): value is PersistableCandidate {
  if (!record(value)) return false;
  return typeof value.run_id === "string" && typeof value.candidate_id === "string" && typeof value.symbol === "string" && (typeof value.name === "string" || value.name === null) && typeof value.chain === "string" && (typeof value.contract_address === "string" || value.contract_address === null) && (typeof value.pair_address === "string" || value.pair_address === null) && typeof value.source === "string" && (typeof value.source_url === "string" || value.source_url === null) && (value.basic_filter_status === "passed_basic_filter" || value.basic_filter_status === "rejected_basic_filter") && Array.isArray(value.filter_reasons) && Array.isArray(value.final_reasons) && typeof value.final_label === "string" && isoText(value.created_at);
}

function pendingCheckpointState(checkpoint: NewRecheckCheckpointDay): NewRecheckCheckpointState {
  return { checkpoint, attempt_count: 0, last_attempt_at: null, last_error_code: null, retry_not_before: null, outcome: "PENDING" };
}

function retryDelayMs(attemptCount: number): number {
  if (attemptCount === 1) return HOUR_MS;
  if (attemptCount === 2) return 6 * HOUR_MS;
  if (attemptCount === 3) return 24 * HOUR_MS;
  throw new NewRecheckStoreValidationError("INVALID_CHECKPOINT_STATE", "attempt_count");
}

function isCheckpoint(value: unknown): value is NewRecheckCheckpointDay { return typeof value === "number" && (NEW_RECHECK_CHECKPOINT_DAYS as readonly number[]).includes(value); }
function isCheckpointOutcome(value: unknown): value is NewRecheckCheckpointOutcome { return value === "PENDING" || value === "RETRY_WAIT" || value === "SUCCESS" || value === "EXHAUSTED"; }
function isFilterReasonText(value: unknown): value is string { return text(value, 160); }
function text(value: unknown, limit: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= limit; }
function nullableIso(value: unknown): value is string | null { return value === null || isoText(value); }
function iso(value: Date): string { if (!Number.isFinite(value.getTime())) throw new NewRecheckStoreValidationError("INVALID_STORE", "date"); return value.toISOString(); }
function isoText(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function record(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function assertExactFields(value: Record<string, unknown>, expected: Set<string>, field: string): void { if (Object.keys(value).length !== expected.size || Object.keys(value).some((key) => !expected.has(key))) invalid("UNKNOWN_FIELD", field); }
function invalid(code: NewRecheckStoreValidationCode, field: string | null = null): never { throw new NewRecheckStoreValidationError(code, field); }
function checksum(value: unknown): string { return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`; }
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function isError(value: unknown, code: string): value is NodeJS.ErrnoException { return value instanceof Error && "code" in value && (value as NodeJS.ErrnoException).code === code; }
async function withStoreLock<T>(path: string, run: () => Promise<T>): Promise<T> {
  const lockPath = `${resolve(path)}.lock`; await mkdir(dirname(lockPath), { recursive: true }); let handle: Awaited<ReturnType<typeof open>> | null = null;
  for (let attempt = 0; attempt < 40 && !handle; attempt += 1) { try { handle = await open(lockPath, "wx"); } catch (error) { if (!isError(error, "EEXIST")) throw error; await new Promise((done) => setTimeout(done, 10)); } }
  if (!handle) throw new Error("NEW_RECHECK_STORE_LOCK_UNAVAILABLE");
  try { return await run(); } finally { await handle.close().catch(() => undefined); await rm(lockPath, { force: true }).catch(() => undefined); }
}
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const target = resolve(path); const temporary = `${target}.${randomUUID()}.tmp`; await mkdir(dirname(target), { recursive: true }); let handle: Awaited<ReturnType<typeof open>> | null = null;
  try { handle = await open(temporary, "wx"); await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); await handle.close(); handle = null; await rename(temporary, target); } catch (error) { await handle?.close().catch(() => undefined); await rm(temporary, { force: true }).catch(() => undefined); throw new Error("NEW_RECHECK_ATOMIC_WRITE_FAILED", { cause: error }); }
}
