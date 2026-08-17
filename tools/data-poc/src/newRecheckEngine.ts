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
  createEmptyNewRecheckStore,
  finalizeNewRecheckStore,
  getDefaultNewRecheckStorePath,
  nextCheckpoint,
  readNewRecheckStore,
  updateNewRecheckStore,
  validateNewRecheckStore,
  type NewRecheckCheckpointDay,
  type NewRecheckEntry,
  type NewRecheckReceipt,
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
        completed_checkpoints: [],
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
    const checkpoint = nextCheckpoint(entry);
    if (!inboxEntry || checkpoint === null || !isDue(entry.first_seen_at, checkpoint, now)) return [];
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
          if (!canPersistObservation(item.entry, item.checkpoint, candidate, now)) throw new Error("NEW_RECHECK_RESULT_INVALID");
          successes.push({ ...item, candidate });
        } catch (error) {
          failures.push({ ...item, error_code: safeErrorCode(error) });
        }
      }
    } catch (error) {
      failures.push(...batch.items.map((item) => ({ ...item, error_code: `NEW_RECHECK_BATCH_${safeErrorCode(error)}` })));
    }
  }
  const attempted = new Set([...successes, ...failures].map((item) => item.entry.identity));
  const promoted: string[] = [];
  let duplicateNoop = 0;
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
    }
  }
  const failureByIdentity = new Map(failures.map((failure) => [failure.entry.identity, failure]));
  const receipt: NewRecheckReceipt = {
    recheck_id: recheckId,
    central_cycle_id: options.centralCycleId ?? null,
    started_at: startedAt,
    finished_at: now.toISOString(),
    records_due: due.length,
    records_selected: attempted.size,
    records_rechecked: successes.length,
    records_failed: failureByIdentity.size,
    provider_batches: batches.length,
    provider_request_count: batches.length,
    promoted_to_follow_up: promoted.length,
    duplicate_noop: duplicateNoop,
    status: failureByIdentity.size === 0 ? "SUCCESS" : successes.length > 0 ? "PARTIAL" : "FAILED",
  };
  await updateNewRecheckStore((current) => {
    const successesByIdentity = new Map(successes.map((success) => [success.entry.identity, success]));
    const entries = current.entries.map((entry) => {
      const success = successesByIdentity.get(entry.identity);
      const failure = failureByIdentity.get(entry.identity);
      if (success) {
        const completed = [...new Set([...entry.completed_checkpoints, success.checkpoint])].sort((left, right) => left - right) as NewRecheckCheckpointDay[];
        return {
          ...entry,
          completed_checkpoints: completed,
          last_attempt_at: now.toISOString(),
          last_success_at: now.toISOString(),
          last_checkpoint: success.checkpoint,
          next_checkpoint: nextCheckpoint({ completed_checkpoints: completed }),
          latest_source_timestamp: now.toISOString(),
          latest_normalized_candidate: success.candidate,
          latest_filter_result: { status: success.candidate.basic_filter_status as "passed_basic_filter" | "rejected_basic_filter", reasons: [...success.candidate.filter_reasons], evaluated_at: now.toISOString() },
          last_error_code: failure?.error_code ?? null,
        };
      }
      if (failure) return { ...entry, last_attempt_at: now.toISOString(), last_error_code: failure.error_code };
      return entry;
    });
    return finalizeNewRecheckStore({ ...current, entries, last_receipt: receipt }, now);
  }, storePath);
  return {
    ...receipt,
    store_path: storePath,
    unsupported_identities: unsupported.map((item) => item.entry.identity),
    failed_identities: [...failureByIdentity.keys()].sort(),
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

/** Keep one malformed live response from invalidating an otherwise safe batch. */
function canPersistObservation(entry: NewRecheckEntry, checkpoint: NewRecheckCheckpointDay, candidate: PersistableCandidate, now: Date): boolean {
  try {
    const completed = [...new Set([...entry.completed_checkpoints, checkpoint])].sort((left, right) => left - right) as NewRecheckCheckpointDay[];
    const empty = createEmptyNewRecheckStore(now);
    validateNewRecheckStore(finalizeNewRecheckStore({
      ...empty,
      entries: [{
        ...entry,
        completed_checkpoints: completed,
        last_attempt_at: now.toISOString(),
        last_success_at: now.toISOString(),
        last_checkpoint: checkpoint,
        next_checkpoint: nextCheckpoint({ completed_checkpoints: completed }),
        latest_source_timestamp: now.toISOString(),
        latest_normalized_candidate: candidate,
        latest_filter_result: { status: candidate.basic_filter_status as "passed_basic_filter" | "rejected_basic_filter", reasons: [...candidate.filter_reasons], evaluated_at: now.toISOString() },
        last_error_code: null,
      }],
    }, now));
    return true;
  } catch { return false; }
}

function isDue(firstSeenAt: string, checkpoint: number, now: Date): boolean { return Date.parse(firstSeenAt) + checkpoint * 86_400_000 <= now.getTime(); }
function uniqueRecheckId(now: Date): string { return `newrecheck_${now.toISOString().replace(/[^0-9]/g, "").slice(0, 14)}_${randomUUID().replace(/-/g, "").slice(0, 8)}`; }
function safeErrorCode(error: unknown): string { const message = error instanceof Error ? error.message : "UNKNOWN"; return /^[A-Z0-9_]{3,120}$/.test(message) ? message : "FAILED"; }
