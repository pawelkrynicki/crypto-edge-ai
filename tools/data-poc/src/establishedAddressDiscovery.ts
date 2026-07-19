import { BoundedHttpClient, type FetchLike } from "./boundedHttpClient.js";
import { fetchDexScreenerTokenPairs } from "./dexscreenerClient.js";
import {
  ESTABLISHED_UNIVERSE_EMPTY,
  isSameContractAddress,
  loadEstablishedAddressUniverse,
  universeIdentityKey,
  validateEstablishedAddressUniverse,
  type EstablishedAddressUniverse,
  type EstablishedAddressUniverseEntry,
} from "./establishedAddressUniverse.js";
import { normalizeDexScreenerPairForConfiguredToken } from "./normalizeDexScreener.js";
import type { CryptoEdgeCandidate, DexScreenerPair } from "./types.js";

export const ESTABLISHED_DISCOVERY_METHOD = "address_seeded_universe";
export const ESTABLISHED_DISCOVERY_READY = "ESTABLISHED_UNIVERSE_READY";

export type EstablishedCollectorEnvironment = {
  CRYPTO_EDGE_DATA_ENV?: string;
  CRYPTO_EDGE_RUNTIME_MODE?: string;
  ALLOW_LIVE_PROVIDER_CALLS?: string;
};

export type EstablishedAddressDiscoveryMetadata = {
  discovery_method: typeof ESTABLISHED_DISCOVERY_METHOD;
  universe_version: string;
  universe_status: typeof ESTABLISHED_UNIVERSE_EMPTY | typeof ESTABLISHED_DISCOVERY_READY;
  entries_total: number;
  entries_enabled: number;
  pairs_loaded: number;
  candidates_before_filters: number;
  candidates_after_filters: number;
  base_token_candidates: number;
  quote_token_candidates: number;
};

export type EstablishedAddressDiscoveryResult = {
  candidates: CryptoEdgeCandidate[];
  metadata: EstablishedAddressDiscoveryMetadata;
};

export type EstablishedAddressDiscoveryOptions = {
  env?: EstablishedCollectorEnvironment;
  universe?: unknown;
  universePath?: string;
  client?: BoundedHttpClient;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  concurrency?: number;
  now?: Date;
};

export type SelectedEstablishedPair = {
  entry: EstablishedAddressUniverseEntry;
  universe_entry_index: number;
  pair: DexScreenerPair;
};

export async function collectEstablishedAddressUniverse(
  options: EstablishedAddressDiscoveryOptions = {},
): Promise<EstablishedAddressDiscoveryResult> {
  assertEstablishedCollectorEnvironment(options.env ?? process.env);
  const universe = options.universe === undefined
    ? loadEstablishedAddressUniverse(options.universePath)
    : validateEstablishedAddressUniverse(options.universe);
  if (!universe.production_enabled) throw new Error("ESTABLISHED_UNIVERSE_PRODUCTION_DISABLED");

  const enabled = universe.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.enabled);
  if (enabled.length === 0) return emptyResult(universe);

  const client = options.client ?? new BoundedHttpClient({
    sourceId: "dexscreener",
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency,
    maxRequests: enabled.length + Math.min(enabled.length, 5),
  });
  let pairsLoaded = 0;
  const selected = await Promise.all(enabled.map(async ({ entry, index }) => {
    const pairs = await fetchDexScreenerTokenPairs(entry.chain, entry.contract_address, {
      environment: "INTERNAL_BETA",
      client,
    });
    pairsLoaded += pairs.length;
    return {
      entry,
      universe_entry_index: index,
      pair: selectHighestLiquidityEstablishedPair(entry, pairs),
    };
  }));
  const deduplicated = deduplicateEstablishedPairs(selected);
  const candidates = deduplicated.map(({ entry, universe_entry_index: universeEntryIndex, pair }) => {
    const normalized = normalizeDexScreenerPairForConfiguredToken(
      pair,
      entry.chain,
      entry.contract_address,
      options.now ?? new Date(),
    );
    return {
      ...normalized,
      discovery_basket: "established" as const,
      discovery_method: ESTABLISHED_DISCOVERY_METHOD as typeof ESTABLISHED_DISCOVERY_METHOD,
      observation_only: false,
      established_eligible: normalized.status === "passed_basic_filter",
      universe_version: universe.universe_version,
      universe_entry_index: universeEntryIndex,
      address_identity_verified: true,
    };
  });

  return {
    candidates,
    metadata: {
      discovery_method: ESTABLISHED_DISCOVERY_METHOD,
      universe_version: universe.universe_version,
      universe_status: ESTABLISHED_DISCOVERY_READY,
      entries_total: universe.entries.length,
      entries_enabled: enabled.length,
      pairs_loaded: pairsLoaded,
      candidates_before_filters: candidates.length,
      candidates_after_filters: candidates.filter((candidate) => candidate.status === "passed_basic_filter").length,
      base_token_candidates: deduplicated.filter((record) => configuredTokenSide(record.entry, record.pair) === "baseToken").length,
      quote_token_candidates: deduplicated.filter((record) => configuredTokenSide(record.entry, record.pair) === "quoteToken").length,
    },
  };
}

export function assertEstablishedCollectorEnvironment(env: EstablishedCollectorEnvironment): void {
  if (env.CRYPTO_EDGE_DATA_ENV !== "INTERNAL_BETA") throw new Error("COLLECTOR_DATA_ENV_INVALID");
  if (env.CRYPTO_EDGE_RUNTIME_MODE !== "INTERNAL_BETA") throw new Error("COLLECTOR_RUNTIME_MODE_INVALID");
  if (env.ALLOW_LIVE_PROVIDER_CALLS !== "1") throw new Error("LIVE_PROVIDER_CALLS_NOT_ALLOWED");
}

export function selectHighestLiquidityEstablishedPair(
  entry: EstablishedAddressUniverseEntry,
  pairs: DexScreenerPair[],
): DexScreenerPair {
  const sameChain = pairs.filter((pair) => pair.chainId?.toLowerCase() === entry.chain);
  const addressMatched = sameChain.filter((pair) => {
    const baseMatch = isSameContractAddress(entry.chain, pair.baseToken?.address, entry.contract_address);
    const quoteMatch = isSameContractAddress(entry.chain, pair.quoteToken?.address, entry.contract_address);
    if (baseMatch && quoteMatch) throw new Error("ESTABLISHED_ADDRESS_IDENTITY_AMBIGUOUS");
    return baseMatch || quoteMatch;
  });
  if (addressMatched.length === 0) throw new Error("ESTABLISHED_ADDRESS_NOT_FOUND_IN_PROVIDER_RESPONSE");

  const usable = addressMatched.filter((pair) => (
    isNonEmptyString(pair.pairAddress)
    && isNonEmptyString(pair.dexId)
    && isDexScreenerUrl(pair.url)
    && isFiniteNonNegative(pair.liquidity?.usd)
    && isFiniteNonNegative(pair.volume?.h24)
    && isValidTimestamp(pair.pairCreatedAt)
  ));
  if (usable.length === 0) throw new Error("ESTABLISHED_REQUIRED_PAIR_DATA_UNAVAILABLE");
  return usable.reduce((best, pair) => (
    Number(pair.liquidity?.usd) > Number(best.liquidity?.usd) ? pair : best
  ));
}

export function deduplicateEstablishedPairs(records: SelectedEstablishedPair[]): SelectedEstablishedPair[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const pairAddress = record.pair.pairAddress;
    if (!pairAddress) throw new Error("ESTABLISHED_PAIR_ADDRESS_MISSING");
    const key = `${universeIdentityKey(record.entry.chain, record.entry.contract_address)}:${pairAddress.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyResult(universe: EstablishedAddressUniverse): EstablishedAddressDiscoveryResult {
  return {
    candidates: [],
    metadata: {
      discovery_method: ESTABLISHED_DISCOVERY_METHOD,
      universe_version: universe.universe_version,
      universe_status: ESTABLISHED_UNIVERSE_EMPTY,
      entries_total: universe.entries.length,
      entries_enabled: 0,
      pairs_loaded: 0,
      candidates_before_filters: 0,
      candidates_after_filters: 0,
      base_token_candidates: 0,
      quote_token_candidates: 0,
    },
  };
}

function configuredTokenSide(
  entry: EstablishedAddressUniverseEntry,
  pair: DexScreenerPair,
): "baseToken" | "quoteToken" {
  return isSameContractAddress(entry.chain, pair.baseToken?.address, entry.contract_address)
    ? "baseToken"
    : "quoteToken";
}

function isDexScreenerUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "dexscreener.com" || url.hostname.endsWith(".dexscreener.com"))
      && !url.search && !url.hash && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && !Number.isNaN(new Date(value).getTime());
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
