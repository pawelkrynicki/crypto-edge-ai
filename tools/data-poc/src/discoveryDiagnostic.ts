import { BoundedHttpClient, type FetchLike } from "./boundedHttpClient.js";
import {
  fetchDexScreenerTokenPairs,
  fetchLatestDexScreenerTokenProfiles,
} from "./dexscreenerClient.js";
import {
  clampSeedLimit,
  deduplicatePairs,
  selectHighestLiquidityPair,
  selectProfileSeeds,
} from "./dexscreenerDiscovery.js";
import {
  buildFilterCalibrationReport,
  splitFilterReasons,
  type CalibrationCandidate,
} from "./filterCalibration.js";
import { normalizeDexScreenerPairs } from "./normalizeDexScreener.js";
import { buildCandidateId } from "./persistableScannerModel.js";
import type { DexScreenerPair } from "./types.js";

export type DiscoveryDiagnosticEnvironment = {
  CRYPTO_EDGE_DATA_ENV?: string;
  CRYPTO_EDGE_RUNTIME_MODE?: string;
  ALLOW_LIVE_PROVIDER_CALLS?: string;
};

export type DiscoveryDiagnosticOptions = {
  env?: DiscoveryDiagnosticEnvironment;
  seedLimit?: number;
  now?: Date;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  concurrency?: number;
};

export async function runDiscoveryDiagnostic(options: DiscoveryDiagnosticOptions = {}) {
  assertDiscoveryDiagnosticEnvironment(options.env ?? process.env);
  const seedLimit = clampSeedLimit(options.seedLimit);
  const now = options.now ?? new Date();
  const client = new BoundedHttpClient({
    sourceId: "dexscreener",
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency,
    maxRequests: 1 + seedLimit + Math.min(seedLimit, 5),
  });

  const profiles = await fetchLatestDexScreenerTokenProfiles({
    environment: "INTERNAL_BETA",
    client,
  });
  const seeds = selectProfileSeeds(profiles, seedLimit);
  if (seeds.length === 0) throw new Error("DEXSCREENER_DIAGNOSTIC_SEEDS_UNAVAILABLE");

  const pairGroups = await Promise.all(seeds.map(async (seed) => ({
    seed,
    pairs: await fetchDexScreenerTokenPairs(seed.chainId, seed.tokenAddress, {
      environment: "INTERNAL_BETA",
      client,
    }),
  })));

  const pairsLoaded = pairGroups.reduce((total, group) => total + group.pairs.length, 0);
  const selectedPairs = pairGroups
    .map((group) => selectHighestLiquidityPair(group.seed, group.pairs))
    .filter((pair): pair is DexScreenerPair => pair !== null);
  const deduplicatedPairs = deduplicatePairs(selectedPairs);
  if (deduplicatedPairs.length === 0) throw new Error("DEXSCREENER_DIAGNOSTIC_PAIRS_UNAVAILABLE");

  const candidates = normalizeDexScreenerPairs(deduplicatedPairs, now);
  const calibrationCandidates = candidates.map((candidate): CalibrationCandidate => ({
    ...candidate,
    candidate_id: buildCandidateId(
      candidate.chain,
      candidate.contract_address,
      candidate.pair_address,
      candidate.source,
    ),
  }));
  const calibration = buildFilterCalibrationReport(calibrationCandidates);
  const hardReasonCounts = calibration.summary.hard_reject_reason_counts;
  const softReasonCounts = countStrings(calibrationCandidates.flatMap((candidate) => (
    splitFilterReasons(candidate.filter_reasons).soft
  )));
  const pairsWithMatchingToken = pairGroups.map((group) => matchingPairs(group.seed, group.pairs));
  const pairsWithPositiveLiquidity = pairsWithMatchingToken.map((pairs) => pairs.filter(hasPositiveLiquidity));
  const requestStats = client.getStats();

  return {
    report_type: "dexscreener_discovery_only_diagnostic",
    environment: "INTERNAL_BETA",
    discovery_method: "dexscreener_latest_token_profiles",
    discovery_only: true,
    provider_sources_invoked: ["dexscreener"],
    security_calls_performed: 0,
    context_calls_performed: 0,
    raw_payloads_stored: false,
    production_snapshot_published: false,
    atomic_publish_performed: false,
    generated_at: now.toISOString(),
    limits: {
      seed_limit: seedLimit,
      request_budget: 1 + seedLimit + Math.min(seedLimit, 5),
    },
    counts: {
      profiles_loaded: profiles.length,
      seed_count: seeds.length,
      pair_groups: pairGroups.length,
      pairs_loaded: pairsLoaded,
      selected_pairs_before_deduplication: selectedPairs.length,
      pairs_dropped_before_normalization: pairsLoaded - deduplicatedPairs.length,
      candidates_normalized: candidates.length,
      candidates_passing_baseline: candidates.filter((candidate) => candidate.status === "passed_basic_filter").length,
    },
    request_counts: {
      dexscreener: requestStats.request_count,
      goplus_security: 0,
      honeypot_is: 0,
      alternative_me_fng: 0,
      defillama_api: 0,
    },
    request_stats: requestStats,
    rejection_reasons: {
      hard: hardReasonCounts,
      soft: softReasonCounts,
    },
    chain_distribution: countStrings(candidates.map((candidate) => candidate.chain)),
    seed_chain_distribution: countStrings(seeds.map((seed) => seed.chainId)),
    pair_age_distribution: calibration.summary.distributions.pair_age_days,
    missing_field_distribution: calibration.summary.missing_field_distribution,
    discovery_quality: {
      profiles_not_selected_or_invalid_within_response: Math.max(0, profiles.length - seeds.length),
      selected_profiles_without_matching_token_pair: pairsWithMatchingToken.filter((pairs) => pairs.length === 0).length,
      selected_profiles_without_usable_pair: selectedPairs.length === seeds.length ? 0 : seeds.length - selectedPairs.length,
      selected_profiles_without_positive_liquidity_pair: pairsWithPositiveLiquidity.filter((pairs) => pairs.length === 0).length,
      normalized_candidates_missing_market_cap: candidates.filter((candidate) => candidate.market_cap_usd === null).length,
      normalized_candidates_missing_fdv: candidates.filter((candidate) => candidate.fdv_usd === null).length,
      normalized_candidates_missing_volume: candidates.filter((candidate) => candidate.volume_24h_usd === null).length,
      normalized_candidates_missing_liquidity: candidates.filter((candidate) => candidate.liquidity_usd === null).length,
      normalized_candidates_missing_pair_created_at: candidates.filter((candidate) => candidate.pair_created_at === null).length,
      highest_liquidity_selection_valid: pairGroups.every((group) => highestLiquiditySelectionIsValid(group.seed, group.pairs)),
      candidates_failing_baseline_age: calibrationCandidates.filter((candidate) => (
        candidate.pair_age_days === null || candidate.pair_age_days <= 7
      )).length,
      candidates_rejected_only_by_baseline_age: calibration.candidates.filter((candidate) => (
        candidate.hard_reject_reasons.length === 1
        && candidate.hard_reject_reasons[0] === "pair_age_not_above_7_days"
      )).length,
      all_normalized_candidates_fail_baseline_age: calibrationCandidates.length > 0
        && calibrationCandidates.every((candidate) => candidate.pair_age_days === null || candidate.pair_age_days <= 7),
    },
    variants: calibration.variants,
    candidates: calibrationCandidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      symbol: candidate.symbol,
      chain: candidate.chain,
      market_cap_usd: candidate.market_cap_usd,
      fdv_usd: candidate.fdv_usd,
      liquidity_usd: candidate.liquidity_usd,
      volume_24h_usd: candidate.volume_24h_usd,
      volume_market_cap_ratio: candidate.volume_market_cap_ratio,
      pair_age_days: candidate.pair_age_days,
      status: candidate.status,
      filter_reasons: candidate.filter_reasons,
    })),
  };
}

export function assertDiscoveryDiagnosticEnvironment(env: DiscoveryDiagnosticEnvironment): void {
  if (env.CRYPTO_EDGE_DATA_ENV !== "INTERNAL_BETA") {
    throw new Error("DISCOVERY_DIAGNOSTIC_DATA_ENV_INVALID");
  }
  if (env.CRYPTO_EDGE_RUNTIME_MODE !== "INTERNAL_BETA") {
    throw new Error("DISCOVERY_DIAGNOSTIC_RUNTIME_MODE_INVALID");
  }
  if (env.ALLOW_LIVE_PROVIDER_CALLS !== "1") {
    throw new Error("DISCOVERY_DIAGNOSTIC_LIVE_CALLS_NOT_ALLOWED");
  }
}

function matchingPairs(seed: { chainId: string; tokenAddress: string }, pairs: DexScreenerPair[]): DexScreenerPair[] {
  return pairs.filter((pair) => (
    pair.chainId?.toLowerCase() === seed.chainId.toLowerCase()
    && pair.baseToken?.address?.toLowerCase() === seed.tokenAddress.toLowerCase()
  ));
}

function hasPositiveLiquidity(pair: DexScreenerPair): boolean {
  return typeof pair.liquidity?.usd === "number"
    && Number.isFinite(pair.liquidity.usd)
    && pair.liquidity.usd > 0;
}

function highestLiquiditySelectionIsValid(
  seed: { chainId: string; tokenAddress: string },
  pairs: DexScreenerPair[],
): boolean {
  const selected = selectHighestLiquidityPair(seed, pairs);
  const eligible = matchingPairs(seed, pairs).filter((pair) => (
    typeof pair.liquidity?.usd === "number"
    && Number.isFinite(pair.liquidity.usd)
    && pair.liquidity.usd >= 0
  ));
  if (eligible.length === 0) return selected === null;
  const maxLiquidity = Math.max(...eligible.map((pair) => Number(pair.liquidity?.usd)));
  return Number(selected?.liquidity?.usd) === maxLiquidity;
}

function countStrings(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}
