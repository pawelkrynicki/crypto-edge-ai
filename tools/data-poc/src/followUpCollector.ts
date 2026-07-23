import type { BoundedHttpClient } from "./boundedHttpClient.js";
import { fetchDexScreenerTokenPairs } from "./dexscreenerClient.js";
import { selectHighestLiquidityEstablishedPair } from "./establishedAddressDiscovery.js";
import type { EstablishedAddressUniverse, EstablishedAddressUniverseEntry } from "./establishedAddressUniverse.js";
import {
  applyFollowUpRecheckSuccess,
  inspectFollowUpStore,
  manualSecurityStatus,
  selectDueFollowUpEntries,
  type FollowUpEntry,
  type FollowUpObservationCandidate,
  type FollowUpRecheckSuccess,
  type FollowUpSecurityStatus,
  type FollowUpStoreDiagnostics,
  type FollowUpStoreReadFailure,
} from "./followUpBasket.js";
import { normalizeDexScreenerPairForConfiguredToken } from "./normalizeDexScreener.js";
import type { CryptoEdgeCandidate } from "./types.js";

export type FollowUpRecheckPreparation = {
  diagnostics: FollowUpStoreDiagnostics | FollowUpStoreReadFailure;
  due_entries: FollowUpEntry[];
};

export type FollowUpRecheckBatch = {
  successes: FollowUpRecheckSuccess[];
  failed_entry_ids: string[];
  records_selected: number;
  provider_calls_expected_max: number;
};

export async function prepareFollowUpRechecks(options: {
  storePath?: string;
  now: Date;
  limit: number;
}): Promise<FollowUpRecheckPreparation> {
  const diagnostics = await inspectFollowUpStore(options.storePath);
  return {
    diagnostics,
    due_entries: diagnostics.store_available
      ? selectDueFollowUpEntries(diagnostics.store, options.now, options.limit)
      : [],
  };
}

export async function collectDueFollowUpRechecks(options: {
  dueEntries: FollowUpEntry[];
  client: BoundedHttpClient;
  now: Date;
  sourceRunId: string;
  securityProvider?: (candidate: CryptoEdgeCandidate) => Promise<FollowUpSecurityStatus>;
}): Promise<FollowUpRecheckBatch> {
  if (options.dueEntries.length === 0) {
    return { successes: [], failed_entry_ids: [], records_selected: 0, provider_calls_expected_max: 0 };
  }
  const settled = await Promise.allSettled(options.dueEntries.map(async (entry) => {
    const pairs = await fetchDexScreenerTokenPairs(entry.chain, entry.contract_address, {
      environment: "INTERNAL_BETA",
      client: options.client,
    });
    const selected = selectHighestLiquidityEstablishedPair(asSelectionEntry(entry), pairs);
    const candidate = normalizeDexScreenerPairForConfiguredToken(
      selected,
      entry.chain,
      entry.contract_address,
      options.now,
    );
    const securityStatus = candidate.status === "passed_basic_filter" && options.securityProvider
      ? await options.securityProvider(candidate)
      : manualSecurityStatus();
    return {
      entry_id: entry.entry_id,
      candidate: toObservationCandidate(entry, candidate),
      checked_at: options.now.toISOString(),
      source_run_id: options.sourceRunId,
      security_status: securityStatus,
    } satisfies FollowUpRecheckSuccess;
  }));
  return {
    successes: settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
    failed_entry_ids: settled.flatMap((result, index) => (
      result.status === "rejected" ? [options.dueEntries[index]?.entry_id ?? "unknown"] : []
    )),
    records_selected: options.dueEntries.length,
    provider_calls_expected_max: options.dueEntries.length,
  };
}

export function applyFollowUpRecheckBatch(
  store: FollowUpStoreDiagnostics["store"],
  batch: FollowUpRecheckBatch,
  universe?: EstablishedAddressUniverse | null,
): FollowUpStoreDiagnostics["store"] {
  return batch.successes.reduce(
    (current, success) => applyFollowUpRecheckSuccess(current, success, universe),
    store,
  );
}

function asSelectionEntry(entry: FollowUpEntry): EstablishedAddressUniverseEntry {
  return {
    chain: entry.chain,
    contract_address: entry.contract_address,
    enabled: true,
    ...(entry.display_name ? { display_name: entry.display_name } : {}),
    ...(entry.symbol_hint ? { symbol_hint: entry.symbol_hint } : {}),
    added_at: entry.first_seen_at,
    updated_at: entry.last_seen_at,
    added_by: "follow-up-system",
    entry_id: `est_${entry.entry_id.slice(4)}`,
  };
}

function toObservationCandidate(
  entry: FollowUpEntry,
  candidate: CryptoEdgeCandidate,
): FollowUpObservationCandidate {
  return {
    candidate_id: entry.entry_id,
    symbol: candidate.symbol,
    name: candidate.name,
    chain: candidate.chain,
    contract_address: candidate.contract_address,
    pair_address: candidate.pair_address,
    pair_created_at: candidate.pair_created_at,
    price_usd: candidate.price_usd,
    market_cap_usd: candidate.market_cap_usd,
    fdv_usd: candidate.fdv_usd,
    liquidity_usd: candidate.liquidity_usd,
    volume_24h_usd: candidate.volume_24h_usd,
    volume_market_cap_ratio: candidate.volume_market_cap_ratio,
    pair_age_days: candidate.pair_age_days,
    basic_filter_status: candidate.status,
    filter_reasons: candidate.filter_reasons,
    discovery_basket: "new_emerging",
    observation_only: true,
  };
}
