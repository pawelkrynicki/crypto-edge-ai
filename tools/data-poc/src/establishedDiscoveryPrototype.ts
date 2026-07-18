import { BoundedHttpClient, type FetchLike } from "./boundedHttpClient.js";
import { searchDexScreenerPairs } from "./dexscreenerClient.js";
import { assertDiscoveryDiagnosticEnvironment, type DiscoveryDiagnosticEnvironment } from "./discoveryDiagnostic.js";
import { buildFilterCalibrationReport, type CalibrationCandidate } from "./filterCalibration.js";
import { normalizeDexScreenerPairs } from "./normalizeDexScreener.js";
import { buildCandidateId } from "./persistableScannerModel.js";
import type { DexScreenerPair } from "./types.js";

export const MAX_ESTABLISHED_SEARCH_QUERIES = 5;

export type EstablishedDiscoveryPrototypeOptions = {
  env?: DiscoveryDiagnosticEnvironment;
  queries: string[];
  now?: Date;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  concurrency?: number;
};

export async function runEstablishedDiscoveryPrototype(options: EstablishedDiscoveryPrototypeOptions) {
  assertDiscoveryDiagnosticEnvironment(options.env ?? process.env);
  const queries = normalizeQueries(options.queries);
  if (queries.length === 0) throw new Error("ESTABLISHED_DISCOVERY_QUERY_REQUIRED");
  const now = options.now ?? new Date();
  const requestBudget = queries.length + Math.min(queries.length, 2);
  const client = new BoundedHttpClient({
    sourceId: "dexscreener",
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    concurrency: options.concurrency,
    maxRequests: requestBudget,
  });
  const queryResults = await Promise.all(queries.map(async (query) => ({
    query,
    pairs: await searchDexScreenerPairs(query, { environment: "INTERNAL_BETA", client }),
  })));
  const allPairs = queryResults.flatMap((result) => result.pairs);
  const selectedPairs = selectHighestLiquidityPairPerToken(allPairs);
  const candidates = normalizeDexScreenerPairs(selectedPairs, now);
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
  const requestStats = client.getStats();

  return {
    report_type: "dexscreener_established_small_cap_search_prototype",
    environment: "INTERNAL_BETA",
    prototype_only: true,
    owner_acceptance_required: true,
    query_plan_owner_approved: false,
    provider_sources_invoked: ["dexscreener"],
    security_calls_performed: 0,
    context_calls_performed: 0,
    raw_payloads_stored: false,
    production_snapshot_published: false,
    atomic_publish_performed: false,
    generated_at: now.toISOString(),
    limits: {
      query_limit: MAX_ESTABLISHED_SEARCH_QUERIES,
      request_budget: requestBudget,
    },
    queries,
    counts: {
      query_count: queries.length,
      pairs_loaded: allPairs.length,
      pairs_selected_by_highest_liquidity_per_token: selectedPairs.length,
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
    chain_distribution: countStrings(candidates.map((candidate) => candidate.chain)),
    pair_age_distribution: calibration.summary.distributions.pair_age_days,
    missing_field_distribution: calibration.summary.missing_field_distribution,
    rejection_reasons: calibration.summary.hard_reject_reason_counts,
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

export function normalizeQueries(queries: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const query of queries) {
    const value = query.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
    if (normalized.length >= MAX_ESTABLISHED_SEARCH_QUERIES) break;
  }
  return normalized;
}

export function selectHighestLiquidityPairPerToken(pairs: DexScreenerPair[]): DexScreenerPair[] {
  const selected = new Map<string, DexScreenerPair>();
  for (const pair of pairs) {
    const chain = pair.chainId?.trim();
    const address = pair.baseToken?.address?.trim();
    const liquidity = pair.liquidity?.usd;
    if (!chain || !address || typeof liquidity !== "number" || !Number.isFinite(liquidity) || liquidity < 0) {
      continue;
    }
    const key = `${chain.toLowerCase()}:${address.toLowerCase()}`;
    const current = selected.get(key);
    if (!current || liquidity > Number(current.liquidity?.usd)) selected.set(key, pair);
  }
  return [...selected.values()];
}

function countStrings(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}
