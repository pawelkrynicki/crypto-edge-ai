import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getDataPocRuntimeRoot } from "./dataPocRuntimeRoot.js";
import type { PersistableCandidate } from "./persistableScannerModel.js";

export const NEW_RECHECK_STORE_SCHEMA_VERSION = "new_recheck_store_v1";
export const NEW_RECHECK_CHECKPOINT_DAYS = [1, 3, 8, 14, 30, 60, 90] as const;
export type NewRecheckCheckpointDay = (typeof NEW_RECHECK_CHECKPOINT_DAYS)[number];

export type NewRecheckFilterResult = {
  status: "passed_basic_filter" | "rejected_basic_filter";
  reasons: string[];
  evaluated_at: string;
};

export type NewRecheckEntry = {
  identity: string;
  chain: string;
  contract_address: string;
  first_seen_at: string;
  completed_checkpoints: NewRecheckCheckpointDay[];
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

const STORE_FIELDS = new Set(["schema_version", "generated_at", "entries", "last_receipt", "checksum"]);
const ENTRY_FIELDS = new Set(["identity", "chain", "contract_address", "first_seen_at", "completed_checkpoints", "last_attempt_at", "last_success_at", "last_checkpoint", "next_checkpoint", "latest_source_timestamp", "latest_normalized_candidate", "latest_filter_result", "last_error_code"]);
const FILTER_FIELDS = new Set(["status", "reasons", "evaluated_at"]);
const RECEIPT_FIELDS = new Set(["recheck_id", "central_cycle_id", "started_at", "finished_at", "records_due", "records_selected", "records_rechecked", "records_failed", "provider_batches", "provider_request_count", "promoted_to_follow_up", "duplicate_noop", "status"]);

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

export function validateNewRecheckStore(value: unknown): NewRecheckStore {
  if (!record(value) || value.schema_version !== NEW_RECHECK_STORE_SCHEMA_VERSION || !isoText(value.generated_at) || !Array.isArray(value.entries) || !(value.last_receipt === null || record(value.last_receipt)) || typeof value.checksum !== "string") throw new Error("NEW_RECHECK_STORE_INVALID");
  assertExactFields(value, STORE_FIELDS);
  const entries = value.entries.map(validateEntry).sort((left, right) => left.identity.localeCompare(right.identity));
  if (new Set(entries.map((entry) => entry.identity)).size !== entries.length) throw new Error("NEW_RECHECK_STORE_INVALID");
  const base: Omit<NewRecheckStore, "checksum"> = {
    schema_version: NEW_RECHECK_STORE_SCHEMA_VERSION,
    generated_at: value.generated_at,
    entries,
    last_receipt: value.last_receipt === null ? null : validateReceipt(value.last_receipt),
  };
  if (value.checksum !== checksum(base)) throw new Error("NEW_RECHECK_STORE_INVALID");
  return { ...base, checksum: value.checksum };
}

export function finalizeNewRecheckStore(store: Omit<NewRecheckStore, "checksum"> | NewRecheckStore, now: Date): NewRecheckStore {
  const base: Omit<NewRecheckStore, "checksum"> = {
    schema_version: NEW_RECHECK_STORE_SCHEMA_VERSION,
    generated_at: iso(now),
    entries: [...store.entries].sort((left, right) => left.identity.localeCompare(right.identity)),
    last_receipt: store.last_receipt,
  };
  return { ...base, checksum: checksum(base) };
}

export function nextCheckpoint(entry: Pick<NewRecheckEntry, "completed_checkpoints">): NewRecheckCheckpointDay | null {
  return NEW_RECHECK_CHECKPOINT_DAYS.find((checkpoint) => !entry.completed_checkpoints.includes(checkpoint)) ?? null;
}

function validateEntry(value: unknown): NewRecheckEntry {
  if (!record(value) || !text(value.identity, 240) || !text(value.chain, 64) || !text(value.contract_address, 180) || !isoText(value.first_seen_at) || !Array.isArray(value.completed_checkpoints) || !value.completed_checkpoints.every(isCheckpoint) || !nullableIso(value.last_attempt_at) || !nullableIso(value.last_success_at) || !(value.last_checkpoint === null || isCheckpoint(value.last_checkpoint)) || !(value.next_checkpoint === null || isCheckpoint(value.next_checkpoint)) || !nullableIso(value.latest_source_timestamp) || !(value.latest_normalized_candidate === null || validCandidate(value.latest_normalized_candidate)) || !(value.latest_filter_result === null || record(value.latest_filter_result)) || !(value.last_error_code === null || text(value.last_error_code, 160))) throw new Error("NEW_RECHECK_STORE_INVALID");
  assertExactFields(value, ENTRY_FIELDS);
  const checkpoints = [...new Set(value.completed_checkpoints as NewRecheckCheckpointDay[])].sort((left, right) => left - right);
  const expectedNext = nextCheckpoint({ completed_checkpoints: checkpoints });
  if (value.next_checkpoint !== expectedNext || (value.last_checkpoint !== null && !checkpoints.includes(value.last_checkpoint))) throw new Error("NEW_RECHECK_STORE_INVALID");
  const filter = value.latest_filter_result === null ? null : validateFilter(value.latest_filter_result);
  if (filter && value.latest_normalized_candidate === null) throw new Error("NEW_RECHECK_STORE_INVALID");
  const latest = value.latest_normalized_candidate as PersistableCandidate | null;
  if (latest && (latest.chain.toLowerCase() !== value.chain.trim().toLowerCase() || latest.contract_address !== value.contract_address.trim() || (filter !== null && filter.status !== latest.basic_filter_status))) throw new Error("NEW_RECHECK_STORE_INVALID");
  return {
    identity: value.identity.trim(), chain: value.chain.trim().toLowerCase(), contract_address: value.contract_address.trim(), first_seen_at: value.first_seen_at,
    completed_checkpoints: checkpoints, last_attempt_at: value.last_attempt_at, last_success_at: value.last_success_at, last_checkpoint: value.last_checkpoint as NewRecheckCheckpointDay | null, next_checkpoint: expectedNext,
    latest_source_timestamp: value.latest_source_timestamp, latest_normalized_candidate: value.latest_normalized_candidate as PersistableCandidate | null, latest_filter_result: filter, last_error_code: value.last_error_code,
  };
}

function validateFilter(value: Record<string, unknown>): NewRecheckFilterResult {
  if (!(value.status === "passed_basic_filter" || value.status === "rejected_basic_filter") || !Array.isArray(value.reasons) || !value.reasons.every((reason) => text(reason, 160)) || !isoText(value.evaluated_at)) throw new Error("NEW_RECHECK_STORE_INVALID");
  assertExactFields(value, FILTER_FIELDS);
  return { status: value.status, reasons: [...new Set(value.reasons as string[])].sort(), evaluated_at: value.evaluated_at };
}

function validateReceipt(value: Record<string, unknown>): NewRecheckReceipt {
  if (!text(value.recheck_id, 128) || !(value.central_cycle_id === null || text(value.central_cycle_id, 128)) || !isoText(value.started_at) || !isoText(value.finished_at) || !["SUCCESS", "PARTIAL", "FAILED"].includes(String(value.status))) throw new Error("NEW_RECHECK_STORE_INVALID");
  assertExactFields(value, RECEIPT_FIELDS);
  const numeric = ["records_due", "records_selected", "records_rechecked", "records_failed", "provider_batches", "provider_request_count", "promoted_to_follow_up", "duplicate_noop"] as const;
  if (!numeric.every((key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0)) throw new Error("NEW_RECHECK_STORE_INVALID");
  return { recheck_id: value.recheck_id, central_cycle_id: value.central_cycle_id, started_at: value.started_at, finished_at: value.finished_at, records_due: Number(value.records_due), records_selected: Number(value.records_selected), records_rechecked: Number(value.records_rechecked), records_failed: Number(value.records_failed), provider_batches: Number(value.provider_batches), provider_request_count: Number(value.provider_request_count), promoted_to_follow_up: Number(value.promoted_to_follow_up), duplicate_noop: Number(value.duplicate_noop), status: value.status as NewRecheckReceipt["status"] };
}

function validCandidate(value: unknown): boolean {
  if (!record(value)) return false;
  return typeof value.run_id === "string" && typeof value.candidate_id === "string" && typeof value.symbol === "string" && (typeof value.name === "string" || value.name === null) && typeof value.chain === "string" && (typeof value.contract_address === "string" || value.contract_address === null) && (typeof value.pair_address === "string" || value.pair_address === null) && typeof value.source === "string" && (typeof value.source_url === "string" || value.source_url === null) && (value.basic_filter_status === "passed_basic_filter" || value.basic_filter_status === "rejected_basic_filter") && Array.isArray(value.filter_reasons) && Array.isArray(value.final_reasons) && typeof value.final_label === "string" && isoText(value.created_at);
}

function isCheckpoint(value: unknown): value is NewRecheckCheckpointDay { return typeof value === "number" && (NEW_RECHECK_CHECKPOINT_DAYS as readonly number[]).includes(value); }
function text(value: unknown, limit: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= limit; }
function nullableIso(value: unknown): value is string | null { if (value === null) return true; return isoText(value); }
function iso(value: Date): string { if (!Number.isFinite(value.getTime())) throw new Error("NEW_RECHECK_DATE_INVALID"); return value.toISOString(); }
function isoText(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function record(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function assertExactFields(value: Record<string, unknown>, expected: Set<string>): void { if (Object.keys(value).length !== expected.size || Object.keys(value).some((key) => !expected.has(key))) throw new Error("NEW_RECHECK_STORE_INVALID"); }
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
