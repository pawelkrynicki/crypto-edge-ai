import { BoundedHttpClient, BoundedHttpError } from "./boundedHttpClient.js";
import {
  fetchDexScreenerTokenPairs,
  fetchLatestDexScreenerTokenProfiles,
} from "./dexscreenerClient.js";
import { normalizeDexScreenerPairs } from "./normalizeDexScreener.js";
import type { CryptoEdgeCandidate, DexScreenerPair, DexScreenerTokenProfile } from "./types.js";

export const DEXSCREENER_DISCOVERY_METHOD = "dexscreener_latest_token_profiles";
export const DEFAULT_DEXSCREENER_SEED_LIMIT = 20;
export const MAX_DEXSCREENER_SEED_LIMIT = 30;
export const DEXSCREENER_DISCOVERY_INSUFFICIENT_COVERAGE = "DEXSCREENER_DISCOVERY_INSUFFICIENT_COVERAGE";

export type DexScreenerFailureReason =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "HTTP_429"
  | "HTTP_4XX"
  | "HTTP_5XX"
  | "INVALID_RESPONSE"
  | "REQUEST_BUDGET_EXHAUSTED";

export type DexScreenerDiscoveryFailureDiagnostics = {
  profiles_request: "READY" | "FAILED";
  minimum_seed_requests_required: number;
  seed_count: number;
  pair_requests_succeeded: number;
  pair_requests_failed: number;
  pairs_loaded: number;
  failure_reason_counts: Partial<Record<DexScreenerFailureReason, number>>;
};

export type DexScreenerDiscoveryMetadata = {
  discovery_method: typeof DEXSCREENER_DISCOVERY_METHOD;
  seed_count: number;
  pair_requests_succeeded: number;
  pair_requests_failed: number;
  pairs_loaded: number;
  candidates_before_filters: number;
  candidates_after_filters: number;
  discovery_status: "READY" | "DEGRADED";
  failure_reason_counts: Partial<Record<DexScreenerFailureReason, number>>;
};

export type DexScreenerDiscoveryResult = {
  candidates: CryptoEdgeCandidate[];
  metadata: DexScreenerDiscoveryMetadata;
};

export type DexScreenerDiscoveryOptions = {
  environment: string;
  seedLimit?: number;
  now?: Date;
  client: BoundedHttpClient;
};

type Seed = { chainId: string; tokenAddress: string };

export class DexScreenerDiscoveryError extends Error {
  readonly code: string;
  readonly diagnostics: DexScreenerDiscoveryFailureDiagnostics;

  constructor(code: string, diagnostics: DexScreenerDiscoveryFailureDiagnostics) {
    super(code);
    this.name = "DexScreenerDiscoveryError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export class DexScreenerProfilesRequestError extends Error {
  readonly code: DexScreenerFailureReason;
  readonly sourceId = "dexscreener";
  readonly diagnostics: DexScreenerDiscoveryFailureDiagnostics;

  constructor(code: DexScreenerFailureReason, diagnostics: DexScreenerDiscoveryFailureDiagnostics) {
    super(code);
    this.name = "DexScreenerProfilesRequestError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export async function collectDexScreenerDiscovery(
  options: DexScreenerDiscoveryOptions,
): Promise<DexScreenerDiscoveryResult> {
  const seedLimit = clampSeedLimit(options.seedLimit);
  const minimumRequired = minimumSuccessfulSeedRequests(seedLimit);
  let profiles: DexScreenerTokenProfile[];
  try {
    profiles = await fetchLatestDexScreenerTokenProfiles({
      environment: options.environment,
      client: options.client,
    });
  } catch (error) {
    const reason = normalizeDexScreenerFailureReason(error);
    throw new DexScreenerProfilesRequestError(reason, {
      profiles_request: "FAILED",
      minimum_seed_requests_required: minimumRequired,
      seed_count: 0,
      pair_requests_succeeded: 0,
      pair_requests_failed: 0,
      pairs_loaded: 0,
      failure_reason_counts: { [reason]: 1 },
    });
  }
  const seeds = selectProfileSeeds(profiles, seedLimit);
  if (seeds.length === 0) {
    throw new DexScreenerDiscoveryError("DEXSCREENER_SEEDS_UNAVAILABLE", {
      profiles_request: "READY",
      minimum_seed_requests_required: minimumRequired,
      seed_count: 0,
      pair_requests_succeeded: 0,
      pair_requests_failed: 0,
      pairs_loaded: 0,
      failure_reason_counts: {},
    });
  }

  const pairResults = await Promise.allSettled(seeds.map(async (seed) => ({
    seed,
    pairs: await fetchDexScreenerTokenPairs(seed.chainId, seed.tokenAddress, {
      environment: options.environment,
      client: options.client,
    }),
  })));
  const pairGroups = pairResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const failedResults = pairResults.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
  const failureReasonCounts = countFailureReasons(failedResults);
  const pairRequestsSucceeded = pairGroups.length;
  const pairRequestsFailed = failedResults.length;

  const pairsLoaded = pairGroups.reduce((total, group) => total + group.pairs.length, 0);
  const selectedPairs = pairGroups
    .map(({ seed, pairs }) => selectHighestLiquidityPair(seed, pairs))
    .filter((pair): pair is DexScreenerPair => pair !== null);
  const deduplicatedPairs = deduplicatePairs(selectedPairs);
  const candidates = normalizeDexScreenerPairs(deduplicatedPairs, options.now ?? new Date()).map((candidate) => ({
    ...candidate,
    discovery_basket: "new_emerging" as const,
    discovery_method: DEXSCREENER_DISCOVERY_METHOD as typeof DEXSCREENER_DISCOVERY_METHOD,
    observation_only: true,
    established_eligible: false,
    universe_version: null,
    universe_entry_index: null,
    address_identity_verified: false,
  }));
  if (pairRequestsSucceeded < minimumRequired || candidates.length === 0) {
    throw new DexScreenerDiscoveryError(DEXSCREENER_DISCOVERY_INSUFFICIENT_COVERAGE, {
      profiles_request: "READY",
      minimum_seed_requests_required: minimumRequired,
      seed_count: seeds.length,
      pair_requests_succeeded: pairRequestsSucceeded,
      pair_requests_failed: pairRequestsFailed,
      pairs_loaded: pairsLoaded,
      failure_reason_counts: failureReasonCounts,
    });
  }

  return {
    candidates,
    metadata: {
      discovery_method: DEXSCREENER_DISCOVERY_METHOD,
      seed_count: seeds.length,
      pair_requests_succeeded: pairRequestsSucceeded,
      pair_requests_failed: pairRequestsFailed,
      pairs_loaded: pairsLoaded,
      candidates_before_filters: candidates.length,
      candidates_after_filters: candidates.filter((candidate) => candidate.status === "passed_basic_filter").length,
      discovery_status: pairRequestsFailed > 0 ? "DEGRADED" : "READY",
      failure_reason_counts: failureReasonCounts,
    },
  };
}

export function minimumSuccessfulSeedRequests(seedLimit: number): number {
  const normalizedLimit = clampSeedLimit(seedLimit);
  return Math.max(3, Math.ceil(normalizedLimit * 0.5));
}

export function normalizeDexScreenerFailureReason(error: unknown): DexScreenerFailureReason {
  if (!(error instanceof BoundedHttpError)) return "NETWORK_ERROR";
  if (error.code === "REQUEST_TIMEOUT") return "TIMEOUT";
  if (error.code === "RATE_LIMITED" || error.status === 429) return "HTTP_429";
  if (error.code === "INVALID_JSON") return "INVALID_RESPONSE";
  if (error.code === "REQUEST_BUDGET_EXHAUSTED") return "REQUEST_BUDGET_EXHAUSTED";
  if (error.status !== null && error.status >= 500) return "HTTP_5XX";
  if (error.status !== null && error.status >= 400) return "HTTP_4XX";
  return "NETWORK_ERROR";
}

function countFailureReasons(errors: unknown[]): Partial<Record<DexScreenerFailureReason, number>> {
  const counts = new Map<DexScreenerFailureReason, number>();
  for (const error of errors) {
    const reason = normalizeDexScreenerFailureReason(error);
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function selectProfileSeeds(profiles: DexScreenerTokenProfile[], limit: number): Seed[] {
  const selected: Seed[] = [];
  const seen = new Set<string>();

  for (const profile of profiles) {
    if (selected.length >= clampSeedLimit(limit)) break;
    if (typeof profile.chainId !== "string" || typeof profile.tokenAddress !== "string") continue;
    const chainId = profile.chainId.trim();
    const tokenAddress = profile.tokenAddress.trim();
    if (!chainId || !tokenAddress) continue;
    const key = `${chainId.toLowerCase()}:${tokenAddress.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({ chainId, tokenAddress });
  }

  return selected;
}

export function selectHighestLiquidityPair(seed: Seed, pairs: DexScreenerPair[]): DexScreenerPair | null {
  const matching = pairs.filter((pair) => {
    const address = pair.baseToken?.address;
    return typeof address === "string"
      && pair.chainId?.toLowerCase() === seed.chainId.toLowerCase()
      && address.toLowerCase() === seed.tokenAddress.toLowerCase()
      && typeof pair.liquidity?.usd === "number"
      && Number.isFinite(pair.liquidity.usd)
      && pair.liquidity.usd >= 0;
  });

  return matching.reduce<DexScreenerPair | null>((best, pair) => {
    if (!best) return pair;
    return Number(pair.liquidity?.usd) > Number(best.liquidity?.usd) ? pair : best;
  }, null);
}

export function deduplicatePairs(pairs: DexScreenerPair[]): DexScreenerPair[] {
  const seen = new Set<string>();
  return pairs.filter((pair) => {
    const key = [pair.chainId, pair.baseToken?.address, pair.pairAddress]
      .map((value) => String(value ?? "").toLowerCase())
      .join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function clampSeedLimit(value = DEFAULT_DEXSCREENER_SEED_LIMIT): number {
  if (!Number.isFinite(value)) return DEFAULT_DEXSCREENER_SEED_LIMIT;
  return Math.max(1, Math.min(Math.floor(value), MAX_DEXSCREENER_SEED_LIMIT));
}
