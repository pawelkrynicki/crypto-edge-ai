import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadEstablishedAddressUniverse,
  normalizeEstablishedAddress,
  normalizeEstablishedChain,
  universeIdentityKey,
  type EstablishedAddressUniverse,
  type SupportedEstablishedChain,
} from "./establishedAddressUniverse.js";
import type { PersistableCandidate, PersistableScannerOutput } from "./persistableScannerModel.js";

export const FOLLOW_UP_STORE_SCHEMA_VERSION = "follow_up_store_v1";
export const FOLLOW_UP_CHECKPOINT_DAYS = [1, 3, 7, 14, 30] as const;
export const FOLLOW_UP_ENTRY_LIMIT = 500;
export const FOLLOW_UP_AUDIT_LIMIT = 200;
export const DEFAULT_FOLLOW_UP_RECHECK_LIMIT = 5;
export const FOLLOW_UP_LIST_LIMIT = 100;

export type FollowUpCheckpointDay = (typeof FOLLOW_UP_CHECKPOINT_DAYS)[number];
export type FollowUpLifecycleStatus =
  | "NEW"
  | "MATURING"
  | "CANDIDATE_FOR_ESTABLISHED"
  | "ESTABLISHED"
  | "ARCHIVED";

export type FollowUpMarketSnapshot = {
  captured_at: string;
  price_usd: number | null;
  market_cap_usd: number | null;
  fdv_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  volume_market_cap_ratio: number | null;
  pair_age_days: number | null;
};

export type FollowUpFilterResult = {
  status: "passed_basic_filter" | "rejected_basic_filter";
  reasons: string[];
  evaluated_at: string;
};

export type FollowUpSecurityStatus = {
  status:
    | "MANUAL_VERIFICATION_REQUIRED"
    | "CHECKED"
    | "PARTIAL"
    | "UNAVAILABLE"
    | "CRITICAL_RISK";
  source: "goplus_security" | null;
  checked_at: string | null;
  missing_data: string[];
  risk_flags: string[];
};

export type FollowUpEntry = {
  entry_id: string;
  chain: SupportedEstablishedChain;
  contract_address: string;
  display_name: string | null;
  symbol_hint: string | null;
  pair_address: string | null;
  pair_created_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_checked_at: string | null;
  next_check_at: string | null;
  completed_checkpoints: FollowUpCheckpointDay[];
  lifecycle_status: FollowUpLifecycleStatus;
  candidate_since: string | null;
  archived_at: string | null;
  last_valid_market_snapshot: FollowUpMarketSnapshot | null;
  latest_filter_result: FollowUpFilterResult | null;
  latest_security_status: FollowUpSecurityStatus;
  source_run_id: string;
};

export type FollowUpAuditEntry = {
  audit_id: string;
  changed_at: string;
  operation: "INGEST" | "RECHECK" | "MEMBERSHIP_SYNC" | "BOOTSTRAP";
  entry_id: string;
  from_status: FollowUpLifecycleStatus | null;
  to_status: FollowUpLifecycleStatus;
  source_run_id: string;
};

export type FollowUpStore = {
  schema_version: typeof FOLLOW_UP_STORE_SCHEMA_VERSION;
  generated_at: string;
  entries: FollowUpEntry[];
  checksum: string;
  audit_log: FollowUpAuditEntry[];
};

export type FollowUpStoreDiagnostics = {
  store: FollowUpStore;
  store_available: true;
  validation_status: "valid" | "recovered";
  recovered_from_backup: boolean;
};

export type FollowUpStoreReadFailure = {
  store_available: false;
  validation_status: "invalid" | "unavailable";
  reason_code: "FOLLOW_UP_STORE_INVALID" | "FOLLOW_UP_STORE_UNAVAILABLE";
};

export type FollowUpObservationCandidate = Pick<PersistableCandidate,
  | "candidate_id"
  | "symbol"
  | "name"
  | "chain"
  | "contract_address"
  | "pair_address"
  | "pair_created_at"
  | "price_usd"
  | "market_cap_usd"
  | "fdv_usd"
  | "liquidity_usd"
  | "volume_24h_usd"
  | "volume_market_cap_ratio"
  | "pair_age_days"
  | "basic_filter_status"
  | "filter_reasons"
  | "discovery_basket"
  | "observation_only"
>;

export type FollowUpRecheckSuccess = {
  entry_id: string;
  candidate: FollowUpObservationCandidate;
  checked_at: string;
  source_run_id: string;
  security_status?: FollowUpSecurityStatus;
};

const DAY_MS = 24 * 60 * 60 * 1_000;
const STORE_FIELDS = new Set(["schema_version", "generated_at", "entries", "checksum", "audit_log"]);
const ENTRY_FIELDS = new Set([
  "entry_id", "chain", "contract_address", "display_name", "symbol_hint", "pair_address",
  "pair_created_at", "first_seen_at", "last_seen_at", "last_checked_at", "next_check_at",
  "completed_checkpoints", "lifecycle_status", "candidate_since", "archived_at",
  "last_valid_market_snapshot", "latest_filter_result", "latest_security_status", "source_run_id",
]);
const MARKET_FIELDS = new Set([
  "captured_at", "price_usd", "market_cap_usd", "fdv_usd", "liquidity_usd",
  "volume_24h_usd", "volume_market_cap_ratio", "pair_age_days",
]);
const FILTER_FIELDS = new Set(["status", "reasons", "evaluated_at"]);
const SECURITY_FIELDS = new Set(["status", "source", "checked_at", "missing_data", "risk_flags"]);
const AUDIT_FIELDS = new Set([
  "audit_id", "changed_at", "operation", "entry_id", "from_status", "to_status", "source_run_id",
]);
const DEFAULT_FOLLOW_UP_STORE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../.local/follow-up/store.json");

export function getDefaultFollowUpStorePath(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(env.CRYPTO_EDGE_FOLLOW_UP_STORE_PATH?.trim() || DEFAULT_FOLLOW_UP_STORE_PATH);
}

export function followUpIdentity(chain: string, contractAddress: string): {
  chain: SupportedEstablishedChain;
  contract_address: string;
  identity: string;
  entry_id: string;
} {
  const normalizedChain = normalizeEstablishedChain(chain);
  const normalizedAddress = normalizeEstablishedAddress(normalizedChain, contractAddress);
  const identity = universeIdentityKey(normalizedChain, normalizedAddress);
  return {
    chain: normalizedChain,
    contract_address: normalizedAddress,
    identity,
    entry_id: `fup_${createHash("sha256").update(identity, "utf8").digest("hex").slice(0, 16)}`,
  };
}

export function createEmptyFollowUpStore(now = new Date(0)): FollowUpStore {
  const base: Omit<FollowUpStore, "checksum"> = {
    schema_version: FOLLOW_UP_STORE_SCHEMA_VERSION,
    generated_at: validDate(now).toISOString(),
    entries: [],
    audit_log: [],
  };
  return { ...base, checksum: calculateFollowUpChecksum(base) };
}

export function calculateFollowUpChecksum(
  value: Omit<FollowUpStore, "checksum">,
): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

export function validateFollowUpStore(value: unknown): FollowUpStore {
  if (!isRecord(value) || hasUnknownFields(value, STORE_FIELDS)) fail("FOLLOW_UP_STORE_INVALID");
  if (value.schema_version !== FOLLOW_UP_STORE_SCHEMA_VERSION || !isIso(value.generated_at)) fail("FOLLOW_UP_STORE_INVALID");
  if (!Array.isArray(value.entries) || value.entries.length > FOLLOW_UP_ENTRY_LIMIT) fail("FOLLOW_UP_STORE_INVALID");
  if (!Array.isArray(value.audit_log) || value.audit_log.length > FOLLOW_UP_AUDIT_LIMIT) fail("FOLLOW_UP_STORE_INVALID");
  const entries = value.entries.map(validateFollowUpEntry);
  const identities = new Set<string>();
  const entryIds = new Set<string>();
  for (const entry of entries) {
    const identity = universeIdentityKey(entry.chain, entry.contract_address);
    if (identities.has(identity) || entryIds.has(entry.entry_id)) fail("FOLLOW_UP_STORE_INVALID");
    identities.add(identity);
    entryIds.add(entry.entry_id);
  }
  const sorted = sortEntries(entries);
  if (entries.some((entry, index) => entry.entry_id !== sorted[index]?.entry_id)) fail("FOLLOW_UP_STORE_INVALID");
  const auditLog = value.audit_log.map(validateAuditEntry);
  const store = {
    schema_version: FOLLOW_UP_STORE_SCHEMA_VERSION,
    generated_at: value.generated_at,
    entries,
    checksum: value.checksum,
    audit_log: auditLog,
  } as FollowUpStore;
  if (typeof value.checksum !== "string" || value.checksum !== calculateFollowUpChecksum(withoutChecksum(store))) {
    fail("FOLLOW_UP_STORE_INVALID");
  }
  return store;
}

export async function readFollowUpStoreWithDiagnostics(
  storePath = getDefaultFollowUpStorePath(),
): Promise<FollowUpStoreDiagnostics> {
  const path = resolve(storePath);
  try {
    return {
      store: validateFollowUpStore(JSON.parse(await readFile(path, "utf8")) as unknown),
      store_available: true,
      validation_status: "valid",
      recovered_from_backup: false,
    };
  } catch (error) {
    if (isErrorCode(error, "ENOENT")) {
      return {
        store: createEmptyFollowUpStore(),
        store_available: true,
        validation_status: "valid",
        recovered_from_backup: false,
      };
    }
    try {
      const backup = validateFollowUpStore(JSON.parse(await readFile(`${path}.bak`, "utf8")) as unknown);
      return {
        store: backup,
        store_available: true,
        validation_status: "recovered",
        recovered_from_backup: true,
      };
    } catch {
      throw new Error(isErrorCode(error, "EACCES") || isErrorCode(error, "EPERM")
        ? "FOLLOW_UP_STORE_UNAVAILABLE"
        : "FOLLOW_UP_STORE_INVALID");
    }
  }
}

export async function readFollowUpStore(storePath = getDefaultFollowUpStorePath()): Promise<FollowUpStore> {
  return (await readFollowUpStoreWithDiagnostics(storePath)).store;
}

export async function inspectFollowUpStore(
  storePath = getDefaultFollowUpStorePath(),
): Promise<FollowUpStoreDiagnostics | FollowUpStoreReadFailure> {
  try {
    return await readFollowUpStoreWithDiagnostics(storePath);
  } catch (error) {
    const unavailable = error instanceof Error && error.message === "FOLLOW_UP_STORE_UNAVAILABLE";
    return {
      store_available: false,
      validation_status: unavailable ? "unavailable" : "invalid",
      reason_code: unavailable ? "FOLLOW_UP_STORE_UNAVAILABLE" : "FOLLOW_UP_STORE_INVALID",
    };
  }
}

export async function updateFollowUpStore(
  mutation: (store: FollowUpStore) => FollowUpStore,
  options: { storePath?: string; now?: Date } = {},
): Promise<FollowUpStore> {
  const path = resolve(options.storePath ?? getDefaultFollowUpStorePath());
  const lock = await acquireFollowUpLock(path);
  try {
    const current = await readFollowUpStore(path);
    const next = finalizeStore(mutation(current), options.now ?? new Date());
    await writeFollowUpStoreAtomic(path, next, current);
    return next;
  } finally {
    await lock.release();
  }
}

export function ingestScannerSnapshot(
  store: FollowUpStore,
  snapshot: Pick<PersistableScannerOutput, "candidates" | "scan_run" | "provenance">,
  establishedUniverse?: EstablishedAddressUniverse | null,
  operation: FollowUpAuditEntry["operation"] = "INGEST",
): FollowUpStore {
  const observedAt = requireIso(snapshot.provenance?.generated_at ?? snapshot.scan_run.finished_at);
  return ingestFollowUpObservations(
    store,
    snapshot.candidates,
    observedAt,
    snapshot.scan_run.run_id,
    establishedUniverse,
    operation,
  );
}

export function ingestFollowUpObservations(
  store: FollowUpStore,
  candidates: FollowUpObservationCandidate[],
  observedAt: string,
  sourceRunId: string,
  establishedUniverse?: EstablishedAddressUniverse | null,
  operation: FollowUpAuditEntry["operation"] = "INGEST",
): FollowUpStore {
  requireIso(observedAt);
  assertSafeRunId(sourceRunId);
  const selected = deduplicateObservations(candidates);
  const entries = new Map(store.entries.map((entry) => [universeIdentityKey(entry.chain, entry.contract_address), entry]));
  const audits = [...store.audit_log];
  const established = enabledUniverseIdentities(establishedUniverse);

  for (const candidate of selected) {
    if (candidate.discovery_basket !== "new_emerging" && candidate.observation_only !== true) continue;
    if (!candidate.contract_address) continue;
    let identity;
    try {
      identity = followUpIdentity(candidate.chain, candidate.contract_address);
    } catch {
      continue;
    }
    const existing = entries.get(identity.identity);
    if (existing && Date.parse(observedAt) <= Date.parse(existing.last_seen_at)) continue;
    const isEstablished = established.has(identity.identity);
    const observedLifecycle = existing
      ? lifecycleAfterObservation(existing, candidate, observedAt, isEstablished)
      : isEstablished ? "ESTABLISHED" : "NEW";
    const next: FollowUpEntry = existing
      ? {
        ...existing,
        display_name: boundedNullable(candidate.name, 120) ?? existing.display_name,
        symbol_hint: boundedNullable(candidate.symbol, 120) ?? existing.symbol_hint,
        pair_address: boundedNullable(candidate.pair_address, 160),
        pair_created_at: nullableIso(candidate.pair_created_at),
        last_seen_at: observedAt,
        next_check_at: observedLifecycle === "NEW" || observedLifecycle === "MATURING"
          ? firstUncompletedCheckpoint(existing.first_seen_at, existing.completed_checkpoints)
          : null,
        lifecycle_status: observedLifecycle,
        candidate_since: observedLifecycle === "CANDIDATE_FOR_ESTABLISHED" ? existing.candidate_since ?? observedAt : null,
        archived_at: observedLifecycle === "ARCHIVED" ? existing.archived_at ?? observedAt : null,
        last_valid_market_snapshot: marketSnapshot(candidate, observedAt),
        latest_filter_result: filterResult(candidate, observedAt),
        source_run_id: sourceRunId,
      }
      : {
        entry_id: identity.entry_id,
        chain: identity.chain,
        contract_address: identity.contract_address,
        display_name: boundedNullable(candidate.name, 120),
        symbol_hint: boundedNullable(candidate.symbol, 120),
        pair_address: boundedNullable(candidate.pair_address, 160),
        pair_created_at: nullableIso(candidate.pair_created_at),
        first_seen_at: observedAt,
        last_seen_at: observedAt,
        last_checked_at: null,
        next_check_at: isEstablished ? null : checkpointAt(observedAt, 1),
        completed_checkpoints: [],
        lifecycle_status: observedLifecycle,
        candidate_since: null,
        archived_at: null,
        last_valid_market_snapshot: marketSnapshot(candidate, observedAt),
        latest_filter_result: filterResult(candidate, observedAt),
        latest_security_status: manualSecurityStatus(),
        source_run_id: sourceRunId,
      };
    entries.set(identity.identity, next);
    audits.unshift(audit(operation, observedAt, next.entry_id, existing?.lifecycle_status ?? null, next.lifecycle_status, sourceRunId));
  }
  return rebuildStore([...entries.values()], audits, observedAt);
}

export function selectDueFollowUpEntries(
  store: FollowUpStore,
  now = new Date(),
  limit = DEFAULT_FOLLOW_UP_RECHECK_LIMIT,
): FollowUpEntry[] {
  const checkedAt = validDate(now).getTime();
  const boundedLimit = clampLimit(limit);
  return store.entries
    .filter((entry) => (
      (entry.lifecycle_status === "NEW" || entry.lifecycle_status === "MATURING")
      && entry.next_check_at !== null
      && Date.parse(entry.next_check_at) <= checkedAt
    ))
    .sort((left, right) => (
      Date.parse(left.next_check_at ?? "") - Date.parse(right.next_check_at ?? "")
      || left.entry_id.localeCompare(right.entry_id)
    ))
    .slice(0, boundedLimit)
    .map((entry) => structuredClone(entry));
}

export function dueFollowUpCount(store: FollowUpStore, now = new Date()): number {
  const nowMs = validDate(now).getTime();
  return store.entries.filter((entry) => (
    (entry.lifecycle_status === "NEW" || entry.lifecycle_status === "MATURING")
    && entry.next_check_at !== null
    && Date.parse(entry.next_check_at) <= nowMs
  )).length;
}

export function applyFollowUpRecheckSuccess(
  store: FollowUpStore,
  result: FollowUpRecheckSuccess,
  establishedUniverse?: EstablishedAddressUniverse | null,
): FollowUpStore {
  const checkedAt = requireIso(result.checked_at);
  assertSafeRunId(result.source_run_id);
  const established = enabledUniverseIdentities(establishedUniverse);
  const entries = store.entries.map((entry) => {
    if (entry.entry_id !== result.entry_id) return entry;
    const elapsed = elapsedCheckpointDays(entry.first_seen_at, checkedAt);
    const completed = [...new Set([...entry.completed_checkpoints, ...elapsed])]
      .sort((left, right) => left - right) as FollowUpCheckpointDay[];
    const identity = universeIdentityKey(entry.chain, entry.contract_address);
    const filter = filterResult(result.candidate, checkedAt);
    const isEstablished = established.has(identity);
    const passed = filter.status === "passed_basic_filter";
    const completedPlan = completed.includes(30);
    const lifecycle: FollowUpLifecycleStatus = isEstablished
      ? "ESTABLISHED"
      : passed
        ? "CANDIDATE_FOR_ESTABLISHED"
        : completedPlan ? "ARCHIVED" : "MATURING";
    const nextCheckpoint = lifecycle === "MATURING"
      ? nextFutureCheckpoint(entry.first_seen_at, checkedAt, completed)
      : null;
    return {
      ...entry,
      display_name: boundedNullable(result.candidate.name, 120) ?? entry.display_name,
      symbol_hint: boundedNullable(result.candidate.symbol, 120) ?? entry.symbol_hint,
      pair_address: boundedNullable(result.candidate.pair_address, 160),
      pair_created_at: nullableIso(result.candidate.pair_created_at),
      last_checked_at: checkedAt,
      next_check_at: nextCheckpoint,
      completed_checkpoints: completed,
      lifecycle_status: lifecycle,
      candidate_since: lifecycle === "CANDIDATE_FOR_ESTABLISHED" ? entry.candidate_since ?? checkedAt : entry.candidate_since,
      archived_at: lifecycle === "ARCHIVED" ? entry.archived_at ?? checkedAt : null,
      last_valid_market_snapshot: marketSnapshot(result.candidate, checkedAt),
      latest_filter_result: filter,
      latest_security_status: result.security_status ?? manualSecurityStatus(),
      source_run_id: result.source_run_id,
    };
  });
  const before = store.entries.find((entry) => entry.entry_id === result.entry_id);
  const after = entries.find((entry) => entry.entry_id === result.entry_id);
  if (!before || !after) return store;
  const audits = [audit("RECHECK", checkedAt, after.entry_id, before.lifecycle_status, after.lifecycle_status, result.source_run_id), ...store.audit_log];
  return rebuildStore(entries, audits, checkedAt);
}

export function synchronizeFollowUpEstablishedMembership(
  store: FollowUpStore,
  universe: EstablishedAddressUniverse | null | undefined,
  changedAt: string,
  sourceRunId: string,
): FollowUpStore {
  requireIso(changedAt);
  assertSafeRunId(sourceRunId);
  const enabled = enabledUniverseIdentities(universe);
  const audits = [...store.audit_log];
  const entries = store.entries.map((entry) => {
    const isEstablished = enabled.has(universeIdentityKey(entry.chain, entry.contract_address));
    const lifecycle = isEstablished ? "ESTABLISHED" : resolveNonEstablishedLifecycle(entry, changedAt);
    if (lifecycle === entry.lifecycle_status) return entry;
    const next = {
      ...entry,
      lifecycle_status: lifecycle,
      next_check_at: lifecycle === "MATURING" || lifecycle === "NEW"
        ? nextFutureCheckpoint(entry.first_seen_at, changedAt, entry.completed_checkpoints)
        : null,
      archived_at: lifecycle === "ARCHIVED" ? entry.archived_at ?? changedAt : null,
    };
    audits.unshift(audit("MEMBERSHIP_SYNC", changedAt, entry.entry_id, entry.lifecycle_status, lifecycle, sourceRunId));
    return next;
  });
  return rebuildStore(entries, audits, changedAt);
}

export function elapsedCheckpointDays(firstSeenAt: string, checkedAt: string): FollowUpCheckpointDay[] {
  const elapsedMs = Date.parse(requireIso(checkedAt)) - Date.parse(requireIso(firstSeenAt));
  if (elapsedMs < 0) return [];
  return FOLLOW_UP_CHECKPOINT_DAYS.filter((day) => elapsedMs >= day * DAY_MS);
}

export function nextFutureCheckpoint(
  firstSeenAt: string,
  checkedAt: string,
  completed: FollowUpCheckpointDay[],
): string | null {
  const nowMs = Date.parse(requireIso(checkedAt));
  const complete = new Set(completed);
  const next = FOLLOW_UP_CHECKPOINT_DAYS.find((day) => (
    !complete.has(day) && Date.parse(checkpointAt(firstSeenAt, day)) > nowMs
  ));
  return next === undefined ? null : checkpointAt(firstSeenAt, next);
}

export function loadEnabledEstablishedUniverse(path?: string): EstablishedAddressUniverse | null {
  try {
    return loadEstablishedAddressUniverse(path);
  } catch {
    return null;
  }
}

export function resolveFollowUpStatusAt(entry: FollowUpEntry, at: string): FollowUpLifecycleStatus {
  if (entry.lifecycle_status === "ESTABLISHED" || entry.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" || entry.lifecycle_status === "ARCHIVED") {
    return entry.lifecycle_status;
  }
  return Date.parse(requireIso(at)) - Date.parse(entry.first_seen_at) < DAY_MS ? "NEW" : "MATURING";
}

function validateFollowUpEntry(value: unknown): FollowUpEntry {
  if (!isRecord(value) || hasUnknownFields(value, ENTRY_FIELDS)) fail("FOLLOW_UP_STORE_INVALID");
  let identity;
  try {
    identity = followUpIdentity(String(value.chain ?? ""), String(value.contract_address ?? ""));
  } catch {
    fail("FOLLOW_UP_STORE_INVALID");
  }
  if (value.chain !== identity.chain || value.contract_address !== identity.contract_address || value.entry_id !== identity.entry_id) {
    fail("FOLLOW_UP_STORE_INVALID");
  }
  for (const field of ["first_seen_at", "last_seen_at"] as const) if (!isIso(value[field])) fail("FOLLOW_UP_STORE_INVALID");
  for (const field of ["last_checked_at", "next_check_at", "candidate_since", "archived_at", "pair_created_at"] as const) {
    if (!isNullableIso(value[field])) fail("FOLLOW_UP_STORE_INVALID");
  }
  if (Date.parse(value.last_seen_at as string) < Date.parse(value.first_seen_at as string)) fail("FOLLOW_UP_STORE_INVALID");
  if (!isNullableBounded(value.display_name, 120) || !isNullableBounded(value.symbol_hint, 120) || !isNullableBounded(value.pair_address, 160)) {
    fail("FOLLOW_UP_STORE_INVALID");
  }
  const completedCheckpoints = Array.isArray(value.completed_checkpoints) ? value.completed_checkpoints : null;
  if (!completedCheckpoints
    || completedCheckpoints.some((day) => !FOLLOW_UP_CHECKPOINT_DAYS.includes(day as FollowUpCheckpointDay))
    || completedCheckpoints.some((day, index) => index > 0 && Number(day) <= Number(completedCheckpoints[index - 1]))) {
    fail("FOLLOW_UP_STORE_INVALID");
  }
  if (!isLifecycle(value.lifecycle_status) || !isSafeRunId(value.source_run_id)) fail("FOLLOW_UP_STORE_INVALID");
  if (value.lifecycle_status === "CANDIDATE_FOR_ESTABLISHED" && !isIso(value.candidate_since)) fail("FOLLOW_UP_STORE_INVALID");
  if (value.lifecycle_status === "ARCHIVED" && !isIso(value.archived_at)) fail("FOLLOW_UP_STORE_INVALID");
  const market = value.last_valid_market_snapshot === null ? null : validateMarket(value.last_valid_market_snapshot);
  const filter = value.latest_filter_result === null ? null : validateFilter(value.latest_filter_result);
  const security = validateSecurity(value.latest_security_status);
  return {
    ...value,
    chain: identity.chain,
    contract_address: identity.contract_address,
    completed_checkpoints: [...completedCheckpoints] as FollowUpCheckpointDay[],
    last_valid_market_snapshot: market,
    latest_filter_result: filter,
    latest_security_status: security,
  } as FollowUpEntry;
}

function validateMarket(value: unknown): FollowUpMarketSnapshot {
  if (!isRecord(value) || hasUnknownFields(value, MARKET_FIELDS) || !isIso(value.captured_at)) fail("FOLLOW_UP_STORE_INVALID");
  for (const field of ["price_usd", "market_cap_usd", "fdv_usd", "liquidity_usd", "volume_24h_usd", "volume_market_cap_ratio", "pair_age_days"] as const) {
    if (!isNullableFinite(value[field])) fail("FOLLOW_UP_STORE_INVALID");
  }
  return value as FollowUpMarketSnapshot;
}

function validateFilter(value: unknown): FollowUpFilterResult {
  if (!isRecord(value) || hasUnknownFields(value, FILTER_FIELDS) || !isIso(value.evaluated_at)) fail("FOLLOW_UP_STORE_INVALID");
  if (value.status !== "passed_basic_filter" && value.status !== "rejected_basic_filter") fail("FOLLOW_UP_STORE_INVALID");
  if (!isStringArray(value.reasons, 100, 160)) fail("FOLLOW_UP_STORE_INVALID");
  return value as FollowUpFilterResult;
}

function validateSecurity(value: unknown): FollowUpSecurityStatus {
  if (!isRecord(value) || hasUnknownFields(value, SECURITY_FIELDS)) fail("FOLLOW_UP_STORE_INVALID");
  if (!["MANUAL_VERIFICATION_REQUIRED", "CHECKED", "PARTIAL", "UNAVAILABLE", "CRITICAL_RISK"].includes(String(value.status))) {
    fail("FOLLOW_UP_STORE_INVALID");
  }
  if (value.source !== null && value.source !== "goplus_security") fail("FOLLOW_UP_STORE_INVALID");
  if (!isNullableIso(value.checked_at) || !isStringArray(value.missing_data, 100, 160) || !isStringArray(value.risk_flags, 100, 160)) {
    fail("FOLLOW_UP_STORE_INVALID");
  }
  return value as FollowUpSecurityStatus;
}

function validateAuditEntry(value: unknown): FollowUpAuditEntry {
  if (!isRecord(value) || hasUnknownFields(value, AUDIT_FIELDS)) fail("FOLLOW_UP_STORE_INVALID");
  if (typeof value.audit_id !== "string" || !/^fua_[0-9a-f-]{36}$/.test(value.audit_id)) fail("FOLLOW_UP_STORE_INVALID");
  if (!isIso(value.changed_at) || !["INGEST", "RECHECK", "MEMBERSHIP_SYNC", "BOOTSTRAP"].includes(String(value.operation))) fail("FOLLOW_UP_STORE_INVALID");
  if (typeof value.entry_id !== "string" || !/^fup_[0-9a-f]{16}$/.test(value.entry_id)) fail("FOLLOW_UP_STORE_INVALID");
  if (value.from_status !== null && !isLifecycle(value.from_status)) fail("FOLLOW_UP_STORE_INVALID");
  if (!isLifecycle(value.to_status) || !isSafeRunId(value.source_run_id)) fail("FOLLOW_UP_STORE_INVALID");
  return value as FollowUpAuditEntry;
}

function deduplicateObservations(candidates: FollowUpObservationCandidate[]): FollowUpObservationCandidate[] {
  const selected = new Map<string, FollowUpObservationCandidate>();
  for (const candidate of candidates) {
    if (!candidate.contract_address) continue;
    let identity: string;
    try {
      identity = followUpIdentity(candidate.chain, candidate.contract_address).identity;
    } catch {
      continue;
    }
    const current = selected.get(identity);
    const candidateLiquidity = finiteOr(candidate.liquidity_usd, -1);
    const currentLiquidity = finiteOr(current?.liquidity_usd, -1);
    if (!current || candidateLiquidity > currentLiquidity
      || (candidateLiquidity === currentLiquidity && candidate.candidate_id.localeCompare(current.candidate_id) < 0)) {
      selected.set(identity, candidate);
    }
  }
  return [...selected.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, value]) => value);
}

function resolveNonEstablishedLifecycle(entry: FollowUpEntry, at: string): FollowUpLifecycleStatus {
  if (entry.latest_filter_result?.status === "passed_basic_filter" && entry.candidate_since) return "CANDIDATE_FOR_ESTABLISHED";
  if (entry.completed_checkpoints.includes(30)) return "ARCHIVED";
  return Date.parse(at) - Date.parse(entry.first_seen_at) < DAY_MS ? "NEW" : "MATURING";
}

function lifecycleAfterObservation(
  entry: FollowUpEntry,
  candidate: FollowUpObservationCandidate,
  observedAt: string,
  isEstablished: boolean,
): FollowUpLifecycleStatus {
  if (isEstablished) return "ESTABLISHED";
  if (Date.parse(observedAt) - Date.parse(entry.first_seen_at) < DAY_MS) return "NEW";
  if (candidate.basic_filter_status === "passed_basic_filter") return "CANDIDATE_FOR_ESTABLISHED";
  if (entry.completed_checkpoints.includes(30)) return "ARCHIVED";
  return "MATURING";
}

function firstUncompletedCheckpoint(
  firstSeenAt: string,
  completed: FollowUpCheckpointDay[],
): string | null {
  const completedSet = new Set(completed);
  const next = FOLLOW_UP_CHECKPOINT_DAYS.find((day) => !completedSet.has(day));
  return next === undefined ? null : checkpointAt(firstSeenAt, next);
}

function enabledUniverseIdentities(universe: EstablishedAddressUniverse | null | undefined): Set<string> {
  return new Set((universe?.entries ?? [])
    .filter((entry) => entry.enabled)
    .map((entry) => universeIdentityKey(entry.chain, entry.contract_address)));
}

function marketSnapshot(candidate: FollowUpObservationCandidate, capturedAt: string): FollowUpMarketSnapshot {
  return {
    captured_at: capturedAt,
    price_usd: nullableFinite(candidate.price_usd),
    market_cap_usd: nullableFinite(candidate.market_cap_usd),
    fdv_usd: nullableFinite(candidate.fdv_usd),
    liquidity_usd: nullableFinite(candidate.liquidity_usd),
    volume_24h_usd: nullableFinite(candidate.volume_24h_usd),
    volume_market_cap_ratio: nullableFinite(candidate.volume_market_cap_ratio),
    pair_age_days: nullableFinite(candidate.pair_age_days),
  };
}

function filterResult(candidate: FollowUpObservationCandidate, evaluatedAt: string): FollowUpFilterResult {
  return {
    status: candidate.basic_filter_status === "passed_basic_filter" ? "passed_basic_filter" : "rejected_basic_filter",
    reasons: candidate.filter_reasons.filter((reason) => typeof reason === "string" && reason.length <= 160).slice(0, 100),
    evaluated_at: evaluatedAt,
  };
}

export function manualSecurityStatus(): FollowUpSecurityStatus {
  return {
    status: "MANUAL_VERIFICATION_REQUIRED",
    source: null,
    checked_at: null,
    missing_data: ["security_not_checked"],
    risk_flags: [],
  };
}

function audit(
  operation: FollowUpAuditEntry["operation"],
  changedAt: string,
  entryId: string,
  fromStatus: FollowUpLifecycleStatus | null,
  toStatus: FollowUpLifecycleStatus,
  sourceRunId: string,
): FollowUpAuditEntry {
  return {
    audit_id: `fua_${randomUUID()}`,
    changed_at: changedAt,
    operation,
    entry_id: entryId,
    from_status: fromStatus,
    to_status: toStatus,
    source_run_id: sourceRunId,
  };
}

function rebuildStore(
  entries: FollowUpEntry[],
  auditLog: FollowUpAuditEntry[],
  generatedAt: string,
): FollowUpStore {
  const boundedEntries = sortEntries(entries).slice(0, FOLLOW_UP_ENTRY_LIMIT);
  const base = {
    schema_version: FOLLOW_UP_STORE_SCHEMA_VERSION,
    generated_at: requireIso(generatedAt),
    entries: boundedEntries,
    audit_log: auditLog.slice(0, FOLLOW_UP_AUDIT_LIMIT),
  } as const;
  return validateFollowUpStore({ ...base, checksum: calculateFollowUpChecksum(base) });
}

function finalizeStore(store: FollowUpStore, now: Date): FollowUpStore {
  return rebuildStore(store.entries, store.audit_log, validDate(now).toISOString());
}

function withoutChecksum(store: FollowUpStore): Omit<FollowUpStore, "checksum"> {
  const { checksum: _checksum, ...rest } = store;
  return rest;
}

async function writeFollowUpStoreAtomic(path: string, store: FollowUpStore, previous: FollowUpStore): Promise<void> {
  validateFollowUpStore(store);
  const temporary = `${path}.${randomUUID()}.tmp`;
  const backupTemporary = `${path}.bak.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    const backupHandle = await open(backupTemporary, "wx");
    await backupHandle.writeFile(`${JSON.stringify(previous, null, 2)}\n`, "utf8");
    await backupHandle.sync();
    await backupHandle.close();
    await rename(backupTemporary, `${path}.bak`);
    const handle = await open(temporary, "wx");
    await handle.writeFile(`${JSON.stringify(store, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    await rm(backupTemporary, { force: true }).catch(() => undefined);
    throw new Error("FOLLOW_UP_STORE_WRITE_FAILED", { cause: error });
  }
}

async function acquireFollowUpLock(storePath: string): Promise<{ release: () => Promise<void> }> {
  const lockPath = `${storePath}.lock`;
  await mkdir(dirname(storePath), { recursive: true });
  let handle;
  try {
    handle = await open(lockPath, "wx");
    await handle.writeFile(`${process.pid}\n`, "utf8");
    await handle.sync();
    await handle.close();
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (isErrorCode(error, "EEXIST")) throw new Error("FOLLOW_UP_STORE_LOCKED");
    throw new Error("FOLLOW_UP_STORE_LOCK_FAILED", { cause: error });
  }
  return { release: () => rm(lockPath, { force: true }) };
}

function checkpointAt(firstSeenAt: string, day: FollowUpCheckpointDay): string {
  return new Date(Date.parse(requireIso(firstSeenAt)) + day * DAY_MS).toISOString();
}

function sortEntries(entries: FollowUpEntry[]): FollowUpEntry[] {
  return [...entries].sort((left, right) => (
    universeIdentityKey(left.chain, left.contract_address).localeCompare(universeIdentityKey(right.chain, right.contract_address))
  ));
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function boundedNullable(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= limit ? normalized : null;
}

function nullableIso(value: unknown): string | null {
  return isIso(value) ? value : null;
}

function nullableFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function requireIso(value: unknown): string {
  if (!isIso(value)) throw new Error("FOLLOW_UP_TIMESTAMP_INVALID");
  return value;
}

function validDate(value: Date): Date {
  if (!Number.isFinite(value.getTime())) throw new Error("FOLLOW_UP_TIMESTAMP_INVALID");
  return value;
}

function clampLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) return DEFAULT_FOLLOW_UP_RECHECK_LIMIT;
  return Math.min(value, DEFAULT_FOLLOW_UP_RECHECK_LIMIT);
}

function assertSafeRunId(value: string): void {
  if (!isSafeRunId(value)) throw new Error("FOLLOW_UP_SOURCE_RUN_ID_INVALID");
}

function isSafeRunId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function isLifecycle(value: unknown): value is FollowUpLifecycleStatus {
  return ["NEW", "MATURING", "CANDIDATE_FOR_ESTABLISHED", "ESTABLISHED", "ARCHIVED"].includes(String(value));
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function isNullableIso(value: unknown): value is string | null {
  return value === null || isIso(value);
}

function isNullableFinite(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNullableBounded(value: unknown, max: number): value is string | null {
  return value === null || (typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= max);
}

function isStringArray(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems
    && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= maxLength);
}

function hasUnknownFields(value: Record<string, unknown>, allowed: Set<string>): boolean {
  return Object.keys(value).some((field) => !allowed.has(field));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

function fail(code: string): never {
  throw new Error(code);
}
