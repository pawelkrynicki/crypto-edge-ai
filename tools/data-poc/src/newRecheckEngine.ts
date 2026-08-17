import { randomUUID } from "node:crypto";
import type { BoundedHttpClient } from "./boundedHttpClient.js";
import { MAX_DEXSCREENER_TOKEN_ADDRESSES_PER_BATCH, fetchDexScreenerTokenBatch } from "./dexscreenerClient.js";
import { selectHighestLiquidityEstablishedPair } from "./establishedAddressDiscovery.js";
import { isSameContractAddress, normalizeEstablishedAddress, normalizeEstablishedChain, universeIdentityKey, type EstablishedAddressUniverseEntry } from "./establishedAddressUniverse.js";
import { normalizeDexScreenerPairForConfiguredToken } from "./normalizeDexScreener.js";
import { buildCandidateId, type PersistableCandidate } from "./persistableScannerModel.js";
import { applyNewRecheckLifecycle, getDefaultNewInboxStorePath, readNewInboxStore } from "./systemLifecycle.js";
import type { CryptoEdgeCandidate } from "./types.js";
import {
  NEW_RECHECK_CHECKPOINT_DAYS,
  createNewRecheckCheckpointStates,
  createNewRecheckFilterResult,
  createEmptyNewRecheckStore,
  finalizeNewRecheckStore,
  getDefaultNewRecheckStorePath,
  isNewRecheckCheckpointDue,
  nextAvailableCheckpoint,
  readNewRecheckStore,
  updateCheckpointAfterFailure,
  updateCheckpointAfterSuccess,
  updateNewRecheckStore,
  validateNewRecheckStore,
  validationDiagnostic,
  type NewRecheckCheckpointDay,
  type NewRecheckEntry,
  type NewRecheckReceipt,
  type NewRecheckValidationDiagnostic,
} from "./newRecheckStore.js";

export const MAX_NEW_RECHECK_BATCHES_PER_CYCLE = 12;

export type NewRecheckRunResult = NewRecheckReceipt & {
  store_path: string;
  unsupported_identities: string[];
  failed_identities: string[];
  promoted_identities: string[];
};

type DueEntry = { entry: NewRecheckEntry; checkpoint: NewRecheckCheckpointDay; scanner_run_id: string };
type RecheckSuccess = DueEntry & { candidate: PersistableCandidate };
type RecheckFailure = DueEntry & { error_code: string };

/** Runs a bounded, batch-only refresh for due identities still in canonical New. */
export async function runCentralNewRechecks(options: {
  client: BoundedHttpClient;
  now?: Date;
  environment?: string | null;
  recheckStorePath?: string;
  newInboxStorePath?: string;
  followUpStorePath?: string;
  establishedStorePath?: string;
  auditStorePath?: string;
  operationJournalPath?: string;
  centralCycleId?: string | null;
  recheckId?: string;
  maxBatches?: number;
}): Promise<NewRecheckRunResult> {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("NEW_RECHECK_DATE_INVALID");
  const recheckId = options.recheckId ?? uniqueRecheckId(now);
  const storePath = options.recheckStorePath ?? getDefaultNewRecheckStorePath();
  const inboxPath = options.newInboxStorePath ?? getDefaultNewInboxStorePath();
  const startedAt = now.toISOString();
  const inbox = await readNewInboxStore(inboxPath);
  const active = inbox.entries.filter((entry) => entry.system_status === "NEW" && entry.archived_at === null && entry.rejected_at === null);
  const activeByIdentity = new Map(active.map((entry) => [entry.identity, entry]));
  await updateNewRecheckStore((current) => {
    const byIdentity = new Map(current.entries.map((entry) => [entry.identity, entry]));
    for (const entry of active) {
      if (byIdentity.has(entry.identity)) continue;
      byIdentity.set(entry.identity, {
        identity: entry.identity,
        chain: entry.chain,
        contract_address: entry.contract_address,
        first_seen_at: entry.first_seen_at,
        schedule_origin_at: entry.first_seen_at,
        completed_checkpoints: [],
        checkpoint_states: createNewRecheckCheckpointStates(),
        last_attempt_at: null,
        last_success_at: null,
        last_checkpoint: null,
        next_checkpoint: NEW_RECHECK_CHECKPOINT_DAYS[0],
        latest_source_timestamp: null,
        latest_normalized_candidate: null,
        latest_filter_result: null,
        last_error_code: null,
      });
    }
    return finalizeNewRecheckStore({ ...current, entries: [...byIdentity.values()] }, now);
  }, storePath);
  const prepared = await readNewRecheckStore(storePath);
  const due = prepared.entries.flatMap((entry): DueEntry[] => {
    const inboxEntry = activeByIdentity.get(entry.identity);
    const checkpoint = nextDueCheckpoint(entry, now);
    if (!inboxEntry || checkpoint === null) return [];
    return [{ entry, checkpoint, scanner_run_id: inboxEntry.last_scanner_run_id }];
  });
  const maxBatches = Math.max(1, Math.min(MAX_NEW_RECHECK_BATCHES_PER_CYCLE, options.maxBatches ?? MAX_NEW_RECHECK_BATCHES_PER_CYCLE));
  const supported: DueEntry[] = [];
  const unsupported: RecheckFailure[] = [];
  for (const item of due) {
    if (isSupportedNewRecheckIdentity(item.entry.chain, item.entry.contract_address, item.entry.identity)) supported.push(item);
    else unsupported.push({ ...item, error_code: "NEW_RECHECK_UNSUPPORTED_CHAIN" });
  }
  const batches = groupBatches(supported).slice(0, maxBatches);
  const successes: RecheckSuccess[] = [];
  const failures: RecheckFailure[] = [...unsupported];
  for (const batch of batches) {
    try {
      const pairs = await fetchDexScreenerTokenBatch(batch.chain, batch.items.map((item) => item.entry.contract_address), {
        environment: options.environment ?? "INTERNAL_BETA",
        client: options.client,
      });
      for (const item of batch.items) {
        try {
          const chain = normalizeEstablishedChain(item.entry.chain);
          const address = normalizeEstablishedAddress(chain, item.entry.contract_address);
          const selected = selectHighestLiquidityEstablishedPair(selectionEntry(chain, address, item.entry.first_seen_at), pairs);
          const normalized = normalizeDexScreenerPairForConfiguredToken(selected, chain, address, now);
          if (normalized.chain !== chain || !isSameContractAddress(chain, normalized.contract_address ?? undefined, address)) throw new Error("NEW_RECHECK_IDENTITY_MAPPING_INVALID");
          if (!hasRequiredBaselineInputs(normalized)) throw new Error("NEW_RECHECK_REQUIRED_DATA_UNAVAILABLE");
          const candidate = toPersistableCandidate(normalized, recheckId, now);
          const persistence = validateNewRecheckObservation(item.entry, item.checkpoint, candidate, now);
          if (!persistence.valid) throw new Error(persistence.code);
          successes.push({ ...item, candidate });
        } catch (error) {
          failures.push({ ...item, error_code: safeErrorCode(error) });
        }
      }
    } catch (error) {
      failures.push(...batch.items.map((item) => ({ ...item, error_code: `NEW_RECHECK_BATCH_${safeErrorCode(error)}` })));
    }
  }
  const attempted = new Set([...successes, ...failures].map(workKey));
  const promoted: string[] = [];
  let duplicateNoop = 0;
  const lifecycleFailed = new Set<string>();
  for (const success of successes) {
    try {
      const result = await applyNewRecheckLifecycle(success.candidate, {
        recheckId,
        centralCycleId: options.centralCycleId,
        scannerRunId: success.scanner_run_id,
        newInboxStorePath: inboxPath,
        followUpStorePath: options.followUpStorePath,
        establishedStorePath: options.establishedStorePath,
        auditStorePath: options.auditStorePath,
        operationJournalPath: options.operationJournalPath,
        now,
      });
      if (result.promoted_to_follow_up > 0) promoted.push(success.entry.identity);
      duplicateNoop += result.duplicate_noop;
    } catch (error) {
      failures.push({ ...success, error_code: `NEW_RECHECK_LIFECYCLE_${safeErrorCode(error)}` });
      lifecycleFailed.add(workKey(success));
    }
  }
  const persistedSuccesses = successes.filter((success) => !lifecycleFailed.has(workKey(success)));
  const failureByWork = new Map(failures.map((failure) => [workKey(failure), failure]));
  const receipt: NewRecheckReceipt = {
    recheck_id: recheckId,
    central_cycle_id: options.centralCycleId ?? null,
    started_at: startedAt,
    finished_at: now.toISOString(),
    records_due: due.length,
    records_selected: attempted.size,
    records_rechecked: persistedSuccesses.length,
    records_failed: failureByWork.size,
    provider_batches: batches.length,
    provider_request_count: batches.length,
    promoted_to_follow_up: promoted.length,
    duplicate_noop: duplicateNoop,
    status: failureByWork.size === 0 ? "SUCCESS" : persistedSuccesses.length > 0 ? "PARTIAL" : "FAILED",
  };
  await updateNewRecheckStore((current) => {
    const successesByIdentity = new Map<string, RecheckSuccess[]>();
    const failuresByIdentity = new Map<string, RecheckFailure[]>();
    for (const success of persistedSuccesses) successesByIdentity.set(success.entry.identity, [...(successesByIdentity.get(success.entry.identity) ?? []), success]);
    for (const failure of failureByWork.values()) failuresByIdentity.set(failure.entry.identity, [...(failuresByIdentity.get(failure.entry.identity) ?? []), failure]);
    const entries = current.entries.map((entry) => {
      const entrySuccesses = successesByIdentity.get(entry.identity) ?? [];
      const entryFailures = failuresByIdentity.get(entry.identity) ?? [];
      if (entrySuccesses.length === 0 && entryFailures.length === 0) return entry;
      let updated = entry;
      for (const success of entrySuccesses) updated = entryAfterSuccessfulRefresh(updated, success.checkpoint, success.candidate, now);
      for (const failure of entryFailures) updated = entryAfterFailedRefresh(updated, failure.checkpoint, failure.error_code, now);
      return updated;
    });
    return finalizeNewRecheckStore({ ...current, entries, last_receipt: receipt }, now);
  }, storePath);
  return {
    ...receipt,
    store_path: storePath,
    unsupported_identities: unsupported.map((item) => item.entry.identity),
    failed_identities: [...new Set([...failureByWork.values()].map((item) => item.entry.identity))].sort(),
    promoted_identities: promoted.sort(),
  };
}

function groupBatches(items: DueEntry[]): Array<{ chain: string; checkpoint: NewRecheckCheckpointDay; items: DueEntry[] }> {
  const byWindow = new Map<string, DueEntry[]>();
  for (const item of items) {
    const key = `${item.entry.chain}\u0000${item.checkpoint}`;
    byWindow.set(key, [...(byWindow.get(key) ?? []), item]);
  }
  return [...byWindow.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([key, entries]) => {
    const [chain, checkpointText] = key.split("\u0000");
    const checkpoint = Number(checkpointText) as NewRecheckCheckpointDay;
    const batches: Array<{ chain: string; checkpoint: NewRecheckCheckpointDay; items: DueEntry[] }> = [];
    for (let start = 0; start < entries.length; start += MAX_DEXSCREENER_TOKEN_ADDRESSES_PER_BATCH) batches.push({ chain, checkpoint, items: entries.slice(start, start + MAX_DEXSCREENER_TOKEN_ADDRESSES_PER_BATCH) });
    return batches;
  });
}

export function isSupportedNewRecheckIdentity(chain: string, address: string, identity: string): boolean {
  try {
    const normalized = normalizeEstablishedChain(chain);
    return universeIdentityKey(normalized, normalizeEstablishedAddress(normalized, address)) === identity;
  } catch { return false; }
}

function selectionEntry(chain: ReturnType<typeof normalizeEstablishedChain>, address: string, firstSeenAt: string): EstablishedAddressUniverseEntry {
  return { chain, contract_address: address, enabled: true, added_at: firstSeenAt, updated_at: firstSeenAt, added_by: "new-recheck-system", entry_id: `est_${randomUUID().replace(/-/g, "").slice(0, 24)}` };
}

function toPersistableCandidate(candidate: CryptoEdgeCandidate, runId: string, now: Date): PersistableCandidate {
  const createdAt = now.toISOString();
  const passed = candidate.status === "passed_basic_filter";
  return {
    run_id: runId,
    candidate_id: buildCandidateId(candidate.chain, candidate.contract_address, candidate.pair_address, candidate.source),
    symbol: candidate.symbol,
    name: candidate.name,
    chain: candidate.chain,
    contract_address: candidate.contract_address,
    pair_address: candidate.pair_address,
    dex: candidate.dex,
    source: candidate.source,
    source_url: candidate.source_url,
    social_links: (candidate.social_links ?? []).map((link) => ({ ...link, source: "DexScreener", snapshot_at: createdAt })),
    price_usd: candidate.price_usd,
    market_cap_usd: candidate.market_cap_usd,
    fdv_usd: candidate.fdv_usd,
    liquidity_usd: candidate.liquidity_usd,
    volume_24h_usd: candidate.volume_24h_usd,
    volume_market_cap_ratio: candidate.volume_market_cap_ratio,
    pair_created_at: candidate.pair_created_at,
    pair_age_days: candidate.pair_age_days,
    basic_filter_status: candidate.status,
    filter_reasons: [...candidate.filter_reasons],
    final_label: passed ? "WATCHLIST" : "REJECT",
    final_reasons: [...candidate.filter_reasons],
    created_at: createdAt,
    discovery_basket: "new_emerging",
    discovery_method: "dexscreener_latest_token_profiles",
    observation_only: true,
    established_eligible: false,
    universe_version: null,
    universe_entry_index: null,
    address_identity_verified: true,
  };
}

function hasRequiredBaselineInputs(candidate: CryptoEdgeCandidate): boolean {
  return (candidate.market_cap_usd !== null || candidate.fdv_usd !== null)
    && candidate.volume_24h_usd !== null
    && candidate.liquidity_usd !== null
    && candidate.volume_market_cap_ratio !== null
    && candidate.pair_age_days !== null;
}

/** Validate only the record about to be committed; a malformed response must not poison its batch. */
export function validateNewRecheckObservation(entry: NewRecheckEntry, checkpoint: NewRecheckCheckpointDay, candidate: PersistableCandidate, now: Date): NewRecheckValidationDiagnostic {
  try {
    const empty = createEmptyNewRecheckStore(now);
    validateNewRecheckStore(finalizeNewRecheckStore({
      ...empty,
      entries: [entryAfterSuccessfulRefresh(entry, checkpoint, candidate, now)],
    }, now));
    return { valid: true, code: "VALID" };
  } catch (error) { return validationDiagnostic(error); }
}

function nextDueCheckpoint(entry: NewRecheckEntry, now: Date): NewRecheckCheckpointDay | null {
  return NEW_RECHECK_CHECKPOINT_DAYS.find((checkpoint) => isNewRecheckCheckpointDue(entry, checkpoint, now)) ?? null;
}

function entryAfterSuccessfulRefresh(entry: NewRecheckEntry, checkpoint: NewRecheckCheckpointDay, candidate: PersistableCandidate, now: Date): NewRecheckEntry {
  const states = entry.checkpoint_states.map((state) => state.checkpoint === checkpoint ? updateCheckpointAfterSuccess(state, now) : state);
  const completed = states.filter((state) => state.outcome === "SUCCESS").map((state) => state.checkpoint);
  return {
    ...entry,
    completed_checkpoints: completed,
    checkpoint_states: states,
    last_attempt_at: now.toISOString(),
    last_success_at: now.toISOString(),
    last_checkpoint: checkpoint,
    next_checkpoint: nextAvailableCheckpoint(states),
    latest_source_timestamp: now.toISOString(),
    latest_normalized_candidate: candidate,
    latest_filter_result: createNewRecheckFilterResult(candidate.basic_filter_status as "passed_basic_filter" | "rejected_basic_filter", candidate.filter_reasons, now.toISOString()),
    last_error_code: null,
  };
}

function entryAfterFailedRefresh(entry: NewRecheckEntry, checkpoint: NewRecheckCheckpointDay, errorCode: string, now: Date): NewRecheckEntry {
  const states = entry.checkpoint_states.map((state) => state.checkpoint === checkpoint ? updateCheckpointAfterFailure(state, errorCode, now) : state);
  return {
    ...entry,
    checkpoint_states: states,
    completed_checkpoints: states.filter((state) => state.outcome === "SUCCESS").map((state) => state.checkpoint),
    last_attempt_at: now.toISOString(),
    next_checkpoint: nextAvailableCheckpoint(states),
    last_error_code: errorCode,
  };
}

function workKey(item: Pick<DueEntry, "entry" | "checkpoint">): string { return `${item.entry.identity}\u0000${item.checkpoint}`; }
function uniqueRecheckId(now: Date): string { return `newrecheck_${now.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}_${randomUUID().replace(/-/g, "").slice(0, 8)}`; }
function safeErrorCode(error: unknown): string { const message = error instanceof Error ? error.message : "UNKNOWN"; return /^[A-Z0-9_]{3,120}$/.test(message) ? message : "FAILED"; }
