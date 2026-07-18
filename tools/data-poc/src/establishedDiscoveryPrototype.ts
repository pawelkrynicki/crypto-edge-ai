import {
  BoundedHttpClient,
  BoundedHttpError,
  DEFAULT_HTTP_CONCURRENCY,
  DEFAULT_HTTP_MAX_RETRIES,
  DEFAULT_HTTP_TIMEOUT_MS,
  type BoundedHttpClientStats,
  type FetchLike,
} from "./boundedHttpClient.js";
import { DEXSCREENER_SEARCH_URL, searchDexScreenerPairs } from "./dexscreenerClient.js";
import { assertDiscoveryDiagnosticEnvironment, type DiscoveryDiagnosticEnvironment } from "./discoveryDiagnostic.js";
import {
  ESTABLISHED_ANCHOR_IDENTITY_CONFIDENCE,
  ESTABLISHED_DISCOVERY_QUERY_LIMIT,
  loadEstablishedDiscoveryQueryPlan,
  validateEstablishedDiscoveryQueryPlan,
  type EstablishedDiscoveryQueryPlan,
} from "./establishedDiscoveryQueryPlan.js";
import { buildFilterCalibrationReport, splitFilterReasons, type CalibrationCandidate } from "./filterCalibration.js";
import { normalizeDexScreenerPair } from "./normalizeDexScreener.js";
import { buildCandidateId } from "./persistableScannerModel.js";
import type { DexScreenerPair, DexScreenerToken } from "./types.js";

export const MAX_ESTABLISHED_SEARCH_QUERIES = ESTABLISHED_DISCOVERY_QUERY_LIMIT;
export const ESTABLISHED_DISCOVERY_REQUEST_BUDGET = ESTABLISHED_DISCOVERY_QUERY_LIMIT * (1 + DEFAULT_HTTP_MAX_RETRIES);

export type AnchorSide = "baseToken" | "quoteToken";
export type CandidateSide = "baseToken" | "quoteToken";
export type EstablishedPairRejectionReason =
  | "unsupported_chain"
  | "anchor_not_matched"
  | "ambiguous_anchor"
  | "candidate_identity_missing"
  | "missing_market_data";

export type EstablishedPairResolution = {
  accepted: boolean;
  query: string;
  matched_anchor_symbol: string | null;
  anchor_side: AnchorSide | null;
  candidate_side: CandidateSide | null;
  candidate_token: DexScreenerToken | null;
  anchor_identity_confidence: typeof ESTABLISHED_ANCHOR_IDENTITY_CONFIDENCE;
  rejection_reason: EstablishedPairRejectionReason | null;
  missing_fields: string[];
};

export type EstablishedDiscoveryPrototypeOptions = {
  env?: DiscoveryDiagnosticEnvironment;
  plan?: unknown;
  now?: Date;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  concurrency?: number;
};

type AcceptedPairRecord = {
  query: string;
  pair: DexScreenerPair;
  candidate_pair: DexScreenerPair;
  candidate_contract_address: string;
  candidate_symbol: string;
  matched_anchor_symbol: string;
  anchor_side: AnchorSide;
  candidate_side: CandidateSide;
};

type QueryFetchResult = {
  query: string;
  pairs: DexScreenerPair[];
  request_stats: BoundedHttpClientStats;
  failure: null | { endpoint: string; code: string; status: number | null; reason: string };
};

export async function runEstablishedDiscoveryPrototype(options: EstablishedDiscoveryPrototypeOptions = {}) {
  assertDiscoveryDiagnosticEnvironment(options.env ?? process.env);
  const plan = options.plan === undefined
    ? loadEstablishedDiscoveryQueryPlan()
    : validateEstablishedDiscoveryQueryPlan(options.plan);
  const now = options.now ?? new Date();
  const concurrency = clampConcurrency(options.concurrency);
  const queryResults = await mapWithConcurrency(plan.queries, concurrency, async (query): Promise<QueryFetchResult> => {
    const client = new BoundedHttpClient({
      sourceId: "dexscreener",
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS,
      maxRetries: DEFAULT_HTTP_MAX_RETRIES,
      concurrency: 1,
      maxRequests: 1 + DEFAULT_HTTP_MAX_RETRIES,
    });
    try {
      return {
        query,
        pairs: await searchDexScreenerPairs(query, { environment: "INTERNAL_BETA", client }),
        request_stats: client.getStats(),
        failure: null,
      };
    } catch (error: unknown) {
      const bounded = error instanceof BoundedHttpError ? error : null;
      return {
        query,
        pairs: [],
        request_stats: client.getStats(),
        failure: {
          endpoint: `${DEXSCREENER_SEARCH_URL}?q=${encodeURIComponent(query)}`,
          code: bounded?.code ?? "UNEXPECTED_FETCH_ERROR",
          status: bounded?.status ?? null,
          reason: error instanceof Error ? error.message : "unknown error",
        },
      };
    }
  });

  const accepted: AcceptedPairRecord[] = [];
  const rejectionCounts: Record<string, number> = {};
  const unsupportedChainCounts: Record<string, number> = {};
  const perQueryWork = new Map<string, {
    exact_anchor_matches: number;
    anchor_not_matched: number;
    ambiguous_anchor: number;
    unsupported_chain: number;
    candidate_identity_missing: number;
    missing_market_data: number;
    accepted_before_deduplication: number;
  }>();

  for (const result of queryResults) {
    const work = {
      exact_anchor_matches: 0,
      anchor_not_matched: 0,
      ambiguous_anchor: 0,
      unsupported_chain: 0,
      candidate_identity_missing: 0,
      missing_market_data: 0,
      accepted_before_deduplication: 0,
    };
    perQueryWork.set(result.query, work);
    for (const pair of result.pairs) {
      const resolution = resolveEstablishedCandidatePair(pair, result.query, plan);
      if (resolution.rejection_reason === "unsupported_chain") {
        work.unsupported_chain += 1;
        increment(unsupportedChainCounts, normalizeNonEmpty(pair.chainId) ?? "unknown");
      } else if (resolution.rejection_reason === "anchor_not_matched") {
        work.anchor_not_matched += 1;
      } else if (resolution.rejection_reason === "ambiguous_anchor") {
        work.ambiguous_anchor += 1;
      } else {
        work.exact_anchor_matches += 1;
        if (resolution.rejection_reason === "candidate_identity_missing") work.candidate_identity_missing += 1;
        if (resolution.rejection_reason === "missing_market_data") work.missing_market_data += 1;
      }
      if (!resolution.accepted) {
        increment(rejectionCounts, resolution.rejection_reason ?? "unknown_rejection");
        continue;
      }
      const candidateToken = resolution.candidate_token;
      if (!candidateToken?.address || !candidateToken.symbol || !resolution.matched_anchor_symbol
        || !resolution.anchor_side || !resolution.candidate_side) {
        throw new Error("ESTABLISHED_DISCOVERY_INTERNAL_RESOLUTION_INVALID");
      }
      work.accepted_before_deduplication += 1;
      accepted.push({
        query: result.query,
        pair,
        candidate_pair: orientPairToCandidate(pair, resolution.candidate_side),
        candidate_contract_address: candidateToken.address,
        candidate_symbol: candidateToken.symbol,
        matched_anchor_symbol: resolution.matched_anchor_symbol,
        anchor_side: resolution.anchor_side,
        candidate_side: resolution.candidate_side,
      });
    }
  }

  const selection = selectHighestLiquidityEstablishedPairs(accepted);
  if (selection.duplicates_removed > 0) rejectionCounts.duplicate = selection.duplicates_removed;
  const normalized = selection.selected.map((record) => {
    const candidate = normalizeDexScreenerPair(record.candidate_pair, now);
    const candidateId = buildCandidateId(candidate.chain, candidate.contract_address, candidate.pair_address, candidate.source);
    const reasons = splitFilterReasons(candidate.filter_reasons);
    return {
      candidate_id: candidateId,
      symbol: candidate.symbol,
      name: candidate.name,
      chain: candidate.chain,
      contract_address: candidate.contract_address,
      pair_address: candidate.pair_address,
      dex: candidate.dex,
      source_url: candidate.source_url,
      matched_queries: record.matched_queries,
      matched_anchor: record.matched_anchor_symbol,
      matched_anchors: record.matched_anchors,
      anchor_side: record.anchor_side,
      candidate_side: record.candidate_side,
      anchor_identity_confidence: plan.identity_confidence,
      price_usd: candidate.price_usd,
      market_cap_usd: candidate.market_cap_usd,
      fdv_usd: candidate.fdv_usd,
      liquidity_usd: candidate.liquidity_usd,
      volume_24h_usd: candidate.volume_24h_usd,
      volume_market_cap_ratio: candidate.volume_market_cap_ratio,
      pair_created_at: candidate.pair_created_at,
      pair_age_days: candidate.pair_age_days,
      baseline_status: candidate.status,
      filter_reasons: candidate.filter_reasons,
      hard_reject_reasons: reasons.hard,
      soft_reasons: reasons.soft,
    };
  });
  const calibrationCandidates: CalibrationCandidate[] = normalized.map((candidate) => ({
    ...candidate,
    status: candidate.baseline_status,
  }));
  const calibration = buildFilterCalibrationReport(calibrationCandidates);
  const baselinePasses = normalized.filter((candidate) => candidate.baseline_status === "passed_basic_filter");
  const requestStats = sumRequestStats(queryResults.map((result) => result.request_stats));
  const perQuery = queryResults.map((result) => {
    const work = perQueryWork.get(result.query);
    if (!work) throw new Error("ESTABLISHED_DISCOVERY_INTERNAL_QUERY_STATS_MISSING");
    const selectedForQuery = normalized.filter((candidate) => candidate.matched_queries.includes(result.query));
    return {
      query: result.query,
      raw_pairs_returned: result.pairs.length,
      exact_anchor_matches: work.exact_anchor_matches,
      anchor_not_matched: work.anchor_not_matched,
      ambiguous_anchor: work.ambiguous_anchor,
      unsupported_chain: work.unsupported_chain,
      candidate_identity_missing: work.candidate_identity_missing,
      missing_market_data: work.missing_market_data,
      duplicates_removed: Math.max(0, work.accepted_before_deduplication - selectedForQuery.length),
      candidates_after_pair_selection: selectedForQuery.length,
      candidates_normalized: selectedForQuery.length,
      candidates_passing_baseline: selectedForQuery.filter((candidate) => candidate.baseline_status === "passed_basic_filter").length,
      request_count: result.request_stats.request_count,
      retry_count: result.request_stats.retry_count,
      failure_count: result.request_stats.failure_count,
      failure: result.failure,
    };
  });
  const concentrationByQuery = Object.fromEntries(perQuery.map((row) => [row.query, {
    candidate_count: row.candidates_normalized,
    unique_candidate_share: normalized.length === 0 ? 0 : row.candidates_normalized / normalized.length,
    baseline_pass_count: row.candidates_passing_baseline,
  }]));
  const maxQueryConcentration = Math.max(0, ...Object.values(concentrationByQuery).map((entry) => entry.unique_candidate_share));
  const classification = classifyEstablishedDiscoveryResult({
    baseline_passes: baselinePasses.length,
    unique_candidates: normalized.length,
    raw_pairs: queryResults.reduce((sum, result) => sum + result.pairs.length, 0),
    exact_anchor_matches: perQuery.reduce((sum, row) => sum + row.exact_anchor_matches, 0),
    anchor_not_matched: perQuery.reduce((sum, row) => sum + row.anchor_not_matched, 0),
    unsupported_chains: perQuery.reduce((sum, row) => sum + row.unsupported_chain, 0),
    missing_market_data: perQuery.reduce((sum, row) => sum + row.missing_market_data, 0),
    failure_count: requestStats.failure_count,
    candidates_older_than_7_days: normalized.filter((candidate) => candidate.pair_age_days !== null && candidate.pair_age_days > 7).length,
    anchor_became_candidate_count: normalized.filter((candidate) => candidate.matched_anchors.some((anchor) => (
      anchor.toLowerCase() === candidate.symbol.toLowerCase()
    ))).length,
    critical_orientation_or_deduplication_errors: 0,
    max_query_concentration: maxQueryConcentration,
  });

  return {
    report_type: "dexscreener_established_basket_validation",
    plan_version: plan.plan_version,
    plan_status: plan.status,
    environment: "INTERNAL_BETA",
    diagnostic_only: true,
    production_enabled: false,
    owner_acceptance_required_before_production_integration: true,
    provider_sources_invoked: ["dexscreener"],
    security_calls_performed: 0,
    context_calls_performed: 0,
    raw_payloads_stored: false,
    production_snapshot_published: false,
    atomic_publish_performed: false,
    generated_at: now.toISOString(),
    limits: {
      query_limit: plan.query_limit,
      request_budget: ESTABLISHED_DISCOVERY_REQUEST_BUDGET,
      timeout_ms: options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS,
      concurrency,
      max_retries_per_request: DEFAULT_HTTP_MAX_RETRIES,
    },
    queries: plan.queries,
    per_query: perQuery,
    summary: {
      query_count: plan.queries.length,
      total_raw_pairs: perQuery.reduce((sum, row) => sum + row.raw_pairs_returned, 0),
      total_exact_anchor_matches: perQuery.reduce((sum, row) => sum + row.exact_anchor_matches, 0),
      total_rejected_pairs: perQuery.reduce((sum, row) => sum + row.raw_pairs_returned, 0) - normalized.length,
      duplicates_removed: selection.duplicates_removed,
      unique_candidates: normalized.length,
      baseline_passes: baselinePasses.length,
      chain_distribution: countStrings(normalized.map((candidate) => candidate.chain)),
      pair_age_distribution: calibration.summary.distributions.pair_age_days,
      market_cap_distribution: calibration.summary.distributions.market_cap_usd,
      liquidity_distribution: calibration.summary.distributions.liquidity_usd,
      volume_distribution: calibration.summary.distributions.volume_24h_usd,
      missing_field_distribution: calibration.summary.missing_field_distribution,
      rejection_reason_counts: {
        pair: rejectionCounts,
        baseline_hard: calibration.summary.hard_reject_reason_counts,
        baseline_soft: countStrings(normalized.flatMap((candidate) => candidate.soft_reasons)),
      },
      candidates_found_by_multiple_queries: normalized.filter((candidate) => candidate.matched_queries.length > 1).map((candidate) => ({
        candidate_id: candidate.candidate_id,
        symbol: candidate.symbol,
        queries: candidate.matched_queries,
      })),
      concentration_by_query: concentrationByQuery,
      max_query_concentration: maxQueryConcentration,
      unsupported_chain_counts: unsupportedChainCounts,
      anchor_identity_confidence: {
        value: plan.identity_confidence,
        cryptographically_verified: false,
        spoofing_risk: "HIGH",
      },
      request_count: requestStats.request_count,
      retry_count: requestStats.retry_count,
      failure_count: requestStats.failure_count,
      raw_payloads_stored: false,
      security_calls_performed: 0,
      context_calls_performed: 0,
      production_snapshot_published: false,
      atomic_publish_performed: false,
    },
    classification,
    baseline_profile: {
      profile_id: "dexscreener_basic_filters_v1",
      changed: false,
    },
    candidates: normalized,
  };
}

export function resolveEstablishedCandidatePair(
  pair: DexScreenerPair,
  query: string,
  plan: EstablishedDiscoveryQueryPlan,
): EstablishedPairResolution {
  const base: Omit<EstablishedPairResolution, "accepted" | "rejection_reason" | "missing_fields"> = {
    query,
    matched_anchor_symbol: null,
    anchor_side: null,
    candidate_side: null,
    candidate_token: null,
    anchor_identity_confidence: ESTABLISHED_ANCHOR_IDENTITY_CONFIDENCE,
  };
  const chain = normalizeNonEmpty(pair.chainId)?.toLowerCase();
  if (!chain || !plan.supported_chains.includes(chain)) {
    return { ...base, accepted: false, rejection_reason: "unsupported_chain", missing_fields: chain ? [] : ["chain"] };
  }
  const aliases = plan.anchor_aliases[query];
  if (!aliases) throw new Error("ESTABLISHED_DISCOVERY_QUERY_NOT_IN_PLAN");
  const baseMatch = exactAliasMatch(pair.baseToken?.symbol, aliases);
  const quoteMatch = exactAliasMatch(pair.quoteToken?.symbol, aliases);
  if (baseMatch && quoteMatch) {
    return { ...base, accepted: false, rejection_reason: "ambiguous_anchor", missing_fields: [] };
  }
  if (!baseMatch && !quoteMatch) {
    return { ...base, accepted: false, rejection_reason: "anchor_not_matched", missing_fields: [] };
  }

  const anchorSide: AnchorSide = baseMatch ? "baseToken" : "quoteToken";
  const candidateSide: CandidateSide = anchorSide === "baseToken" ? "quoteToken" : "baseToken";
  const candidateToken = candidateSide === "baseToken" ? pair.baseToken : pair.quoteToken;
  const matchedAnchorSymbol = baseMatch ?? quoteMatch;
  const resolvedBase = {
    ...base,
    matched_anchor_symbol: matchedAnchorSymbol,
    anchor_side: anchorSide,
    candidate_side: candidateSide,
    candidate_token: candidateToken ?? null,
  };
  const identityMissing = [
    ["candidate_symbol", candidateToken?.symbol],
    ["candidate_contract_address", candidateToken?.address],
    ["pair_address", pair.pairAddress],
    ["source_url", pair.url],
  ].flatMap(([field, value]) => normalizeNonEmpty(value) ? [] : [String(field)]);
  if (identityMissing.length > 0) {
    return { ...resolvedBase, accepted: false, rejection_reason: "candidate_identity_missing", missing_fields: identityMissing };
  }
  if (candidateToken?.symbol && aliases.some((alias) => alias.toLowerCase() === candidateToken.symbol?.toLowerCase())) {
    return { ...resolvedBase, accepted: false, rejection_reason: "ambiguous_anchor", missing_fields: [] };
  }

  const marketMissing: string[] = [];
  if (!isFiniteNonNegative(pair.liquidity?.usd)) marketMissing.push("liquidity_usd");
  if (!isFiniteNonNegative(pair.volume?.h24)) marketMissing.push("volume_24h_usd");
  if (!isFiniteNonNegative(pair.marketCap) && !isFiniteNonNegative(pair.fdv)) marketMissing.push("market_cap_or_fdv");
  if (!isValidTimestamp(pair.pairCreatedAt)) marketMissing.push("pair_created_at");
  // DexScreener pair-level valuation and price fields describe baseToken. Using them
  // for a quote-side candidate would silently attribute the anchor's metrics.
  if (candidateSide === "quoteToken") marketMissing.push("quote_token_market_data_not_attributable");
  if (marketMissing.length > 0) {
    return { ...resolvedBase, accepted: false, rejection_reason: "missing_market_data", missing_fields: marketMissing };
  }
  return { ...resolvedBase, accepted: true, rejection_reason: null, missing_fields: [] };
}

export function exactAliasMatch(symbol: string | undefined, aliases: string[]): string | null {
  const normalized = normalizeNonEmpty(symbol)?.toLowerCase();
  if (!normalized) return null;
  return aliases.find((alias) => alias.toLowerCase() === normalized) ?? null;
}

export function selectHighestLiquidityEstablishedPairs(records: AcceptedPairRecord[]) {
  const byPair = new Map<string, AcceptedPairRecord & { matched_queries: string[]; matched_anchors: string[] }>();
  for (const record of records) {
    const pairAddress = record.pair.pairAddress;
    const chain = record.pair.chainId;
    if (!pairAddress || !chain) continue;
    const key = `${chain.toLowerCase()}:${record.candidate_contract_address.toLowerCase()}:${pairAddress.toLowerCase()}`;
    const current = byPair.get(key);
    if (!current) {
      byPair.set(key, { ...record, matched_queries: [record.query], matched_anchors: [record.matched_anchor_symbol] });
      continue;
    }
    addUnique(current.matched_queries, record.query);
    addUnique(current.matched_anchors, record.matched_anchor_symbol);
  }

  const byCandidate = new Map<string, Array<AcceptedPairRecord & { matched_queries: string[]; matched_anchors: string[] }>>();
  for (const record of byPair.values()) {
    const chain = record.pair.chainId;
    if (!chain) continue;
    const key = `${chain.toLowerCase()}:${record.candidate_contract_address.toLowerCase()}`;
    const group = byCandidate.get(key) ?? [];
    group.push(record);
    byCandidate.set(key, group);
  }
  const selected = [...byCandidate.values()].map((group) => {
    const matchedQueries = unique(group.flatMap((record) => record.matched_queries));
    const matchedAnchors = unique(group.flatMap((record) => record.matched_anchors));
    const winner = group.reduce((best, current) => (
      Number(current.pair.liquidity?.usd) > Number(best.pair.liquidity?.usd) ? current : best
    ));
    return { ...winner, matched_queries: matchedQueries, matched_anchors: matchedAnchors };
  });
  return {
    selected,
    duplicates_removed: records.length - selected.length,
  };
}

export type EstablishedClassificationInput = {
  baseline_passes: number;
  unique_candidates: number;
  raw_pairs: number;
  exact_anchor_matches: number;
  anchor_not_matched: number;
  unsupported_chains: number;
  missing_market_data: number;
  failure_count: number;
  candidates_older_than_7_days: number;
  anchor_became_candidate_count: number;
  critical_orientation_or_deduplication_errors: number;
  max_query_concentration: number;
};

export function classifyEstablishedDiscoveryResult(input: EstablishedClassificationInput) {
  const reasons: string[] = [];
  if (input.failure_count > 0) reasons.push("provider_request_failure");
  if (input.baseline_passes === 0) reasons.push("zero_candidates_passing_baseline");
  if (input.candidates_older_than_7_days === 0) reasons.push("no_established_population_older_than_7_days");
  if (input.anchor_became_candidate_count > 0) reasons.push("anchor_became_candidate");
  if (input.critical_orientation_or_deduplication_errors > 0) reasons.push("critical_orientation_or_deduplication_error");
  if (reasons.length > 0) return { status: "NO_GO_QUERY_PLAN" as const, reasons };

  if (input.baseline_passes > 10) reasons.push("too_many_candidates_passing_baseline");
  if (input.unique_candidates <= 1) reasons.push("sample_too_small_for_go");
  if (input.unsupported_chains > 0) reasons.push("unsupported_chains_present");
  if (input.raw_pairs > 0 && input.anchor_not_matched / input.raw_pairs >= 0.5) reasons.push("anchor_not_matched_rate_high");
  if (input.exact_anchor_matches > 0 && input.missing_market_data / input.exact_anchor_matches >= 0.25) {
    reasons.push("candidate_market_data_uncertainty_high");
  }
  if (input.unique_candidates > 1 && input.max_query_concentration >= 0.8) reasons.push("single_query_concentration_high");
  if (reasons.length > 0) return { status: "REFINE_QUERY_PLAN" as const, reasons };
  return { status: "GO_TO_ADDRESS_BACKED_INTEGRATION" as const, reasons: ["diagnostic_quality_gates_passed"] };
}

function orientPairToCandidate(pair: DexScreenerPair, candidateSide: CandidateSide): DexScreenerPair {
  if (candidateSide === "baseToken") return pair;
  return { ...pair, baseToken: pair.quoteToken, quoteToken: pair.baseToken };
}

function sumRequestStats(stats: BoundedHttpClientStats[]): BoundedHttpClientStats {
  return {
    source_id: "dexscreener",
    request_count: stats.reduce((sum, value) => sum + value.request_count, 0),
    retry_count: stats.reduce((sum, value) => sum + value.retry_count, 0),
    failure_count: stats.reduce((sum, value) => sum + value.failure_count, 0),
  };
}

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function clampConcurrency(value: number | undefined): number {
  if (!Number.isInteger(value)) return DEFAULT_HTTP_CONCURRENCY;
  return Math.min(DEFAULT_HTTP_CONCURRENCY, Math.max(1, Number(value)));
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && !Number.isNaN(new Date(value).getTime());
}

function normalizeNonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function countStrings(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) increment(counts, value);
  return counts;
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
