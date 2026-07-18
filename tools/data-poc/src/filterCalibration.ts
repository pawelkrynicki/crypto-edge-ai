import type { CryptoEdgeCandidate } from "./types.js";

export const FILTER_CALIBRATION_CONFIG_VERSION = "filter_calibration_12r5a_v1";

export const SOFT_FILTER_REASONS = new Set([
  "market_cap_missing_using_fdv",
  "volume_market_cap_ratio_outside_sweet_spot_5_30_percent",
  "pair_age_outside_preferred_14_90_days",
]);

export type FilterThresholds = {
  minMarketCapUsd: number;
  maxMarketCapUsd: number;
  minVolume24hUsd: number;
  minLiquidityUsd: number;
  minVolumeMarketCapRatio: number;
  maxVolumeMarketCapRatio: number;
  minPairAgeDays: number;
};

export type CalibrationVariant = {
  id: "A" | "B" | "C" | "D" | "E";
  label: string;
  thresholds: FilterThresholds;
  relaxed_conditions: string[];
  increased_risk: string;
};

const BASELINE_THRESHOLDS: FilterThresholds = {
  minMarketCapUsd: 300_000,
  maxMarketCapUsd: 10_000_000,
  minVolume24hUsd: 30_000,
  minLiquidityUsd: 30_000,
  minVolumeMarketCapRatio: 0.01,
  maxVolumeMarketCapRatio: 1,
  minPairAgeDays: 7,
};

export const CALIBRATION_VARIANTS: CalibrationVariant[] = [
  {
    id: "A",
    label: "baseline",
    thresholds: { ...BASELINE_THRESHOLDS },
    relaxed_conditions: [],
    increased_risk: "none_vs_active_baseline",
  },
  {
    id: "B",
    label: "liquidity_20000",
    thresholds: { ...BASELINE_THRESHOLDS, minLiquidityUsd: 20_000 },
    relaxed_conditions: ["min_liquidity_usd_30000_to_20000"],
    increased_risk: "lower_depth_and_higher_slippage_exposure",
  },
  {
    id: "C",
    label: "volume_and_liquidity_20000",
    thresholds: {
      ...BASELINE_THRESHOLDS,
      minVolume24hUsd: 20_000,
      minLiquidityUsd: 20_000,
    },
    relaxed_conditions: [
      "min_volume_24h_usd_30000_to_20000",
      "min_liquidity_usd_30000_to_20000",
    ],
    increased_risk: "lower_activity_and_lower_depth_exposure",
  },
  {
    id: "D",
    label: "wider_market_cap_volume_and_liquidity_20000",
    thresholds: {
      ...BASELINE_THRESHOLDS,
      minMarketCapUsd: 200_000,
      maxMarketCapUsd: 15_000_000,
      minVolume24hUsd: 20_000,
      minLiquidityUsd: 20_000,
    },
    relaxed_conditions: [
      "market_cap_range_300000_10000000_to_200000_15000000",
      "min_volume_24h_usd_30000_to_20000",
      "min_liquidity_usd_30000_to_20000",
    ],
    increased_risk: "smaller_or_larger_caps_with_lower_activity_and_depth",
  },
  {
    id: "E",
    label: "pair_age_above_3_days",
    thresholds: { ...BASELINE_THRESHOLDS, minPairAgeDays: 3 },
    relaxed_conditions: ["min_pair_age_days_above_7_to_above_3"],
    increased_risk: "shorter_trading_history_and_less_mature_liquidity",
  },
];

export type CalibrationCandidate = Pick<CryptoEdgeCandidate,
  | "symbol"
  | "name"
  | "chain"
  | "contract_address"
  | "pair_address"
  | "dex"
  | "source_url"
  | "price_usd"
  | "market_cap_usd"
  | "fdv_usd"
  | "liquidity_usd"
  | "volume_24h_usd"
  | "volume_market_cap_ratio"
  | "pair_created_at"
  | "pair_age_days"
  | "filter_reasons"
> & {
  candidate_id: string;
  status: string;
};

export type FilterEvaluation = {
  passed: boolean;
  hard_reject_reasons: string[];
};

export type MetricDistribution = {
  count: number;
  missing: number;
  min: number | null;
  median: number | null;
  max: number | null;
  values: number[];
  buckets: Record<string, number>;
};

export type FilterCalibrationReport = ReturnType<typeof buildFilterCalibrationReport>;

export function splitFilterReasons(reasons: string[]): { hard: string[]; soft: string[] } {
  return reasons.reduce((result, reason) => {
    (SOFT_FILTER_REASONS.has(reason) ? result.soft : result.hard).push(reason);
    return result;
  }, { hard: [] as string[], soft: [] as string[] });
}

export function evaluateCandidateAgainstThresholds(
  candidate: CalibrationCandidate,
  thresholds: FilterThresholds,
): FilterEvaluation {
  const reasons: string[] = [];
  const marketCapForFilter = candidate.market_cap_usd ?? candidate.fdv_usd;

  if (marketCapForFilter === null) {
    reasons.push("market_cap_or_fdv_missing");
  } else {
    if (marketCapForFilter < thresholds.minMarketCapUsd) reasons.push("market_cap_below_min");
    if (marketCapForFilter > thresholds.maxMarketCapUsd) reasons.push("market_cap_above_max");
  }

  if (candidate.volume_24h_usd === null) {
    reasons.push("volume_24h_missing");
  } else if (candidate.volume_24h_usd < thresholds.minVolume24hUsd) {
    reasons.push("volume_24h_below_min");
  }

  if (candidate.liquidity_usd === null) {
    reasons.push("liquidity_missing");
  } else if (candidate.liquidity_usd < thresholds.minLiquidityUsd) {
    reasons.push("liquidity_below_min");
  }

  if (candidate.volume_market_cap_ratio === null) {
    reasons.push("volume_market_cap_ratio_missing");
  } else {
    if (candidate.volume_market_cap_ratio < thresholds.minVolumeMarketCapRatio) {
      reasons.push("volume_market_cap_ratio_below_min");
    }
    if (candidate.volume_market_cap_ratio > thresholds.maxVolumeMarketCapRatio) {
      reasons.push("volume_market_cap_ratio_above_max");
    }
  }

  if (candidate.pair_age_days === null) {
    reasons.push("pair_age_missing");
  } else if (candidate.pair_age_days <= thresholds.minPairAgeDays) {
    reasons.push("pair_age_not_above_min");
  }

  return { passed: reasons.length === 0, hard_reject_reasons: reasons };
}

export function buildFilterCalibrationReport(
  candidates: CalibrationCandidate[],
  source: { snapshot_path?: string; run_id?: string } = {},
) {
  const candidateRows = candidates.map((candidate) => {
    const reasons = splitFilterReasons(candidate.filter_reasons);
    return {
      ...candidate,
      all_filter_reasons: [...candidate.filter_reasons],
      hard_reject_reasons: reasons.hard,
      soft_reasons: reasons.soft,
      primary_reject_reason: reasons.hard[0] ?? null,
      simultaneous_hard_reject_reason_count: reasons.hard.length,
      required_filter_data_complete: hasCompleteRequiredFilterData(candidate),
    };
  });

  const hardReasonCounts = countStrings(candidateRows.flatMap((candidate) => candidate.hard_reject_reasons));
  const missingFieldDistribution = buildMissingFieldDistribution(candidates);
  const variantResults = CALIBRATION_VARIANTS.map((variant) => {
    const passing = candidates.flatMap((candidate) => {
      const evaluation = evaluateCandidateAgainstThresholds(candidate, variant.thresholds);
      if (!evaluation.passed) return [];
      const baselineReasons = evaluateCandidateAgainstThresholds(candidate, BASELINE_THRESHOLDS).hard_reject_reasons;
      return [{
        candidate_id: candidate.candidate_id,
        symbol: candidate.symbol,
        chain: candidate.chain,
        market_cap_usd: candidate.market_cap_usd,
        fdv_usd: candidate.fdv_usd,
        liquidity_usd: candidate.liquidity_usd,
        volume_24h_usd: candidate.volume_24h_usd,
        volume_market_cap_ratio: candidate.volume_market_cap_ratio,
        pair_age_days: candidate.pair_age_days,
        required_filter_data_complete: hasCompleteRequiredFilterData(candidate),
        baseline_hard_reject_reasons: baselineReasons,
        baseline_hard_reject_reason_count: baselineReasons.length,
        soft_reasons: splitFilterReasons(candidate.filter_reasons).soft,
      }];
    });

    return {
      variant_id: variant.id,
      label: variant.label,
      config_version: FILTER_CALIBRATION_CONFIG_VERSION,
      thresholds: variant.thresholds,
      relaxed_conditions: variant.relaxed_conditions,
      increased_risk: variant.increased_risk,
      passing_candidate_count: passing.length,
      passing_symbols: passing.map((candidate) => candidate.symbol),
      passing_chains: countStrings(passing.map((candidate) => candidate.chain)),
      passing_candidates: passing,
      all_passing_candidates_have_required_filter_data: passing.every((candidate) => candidate.required_filter_data_complete),
      depends_on_single_candidate: passing.length === 1,
      passes_candidate_with_multiple_baseline_hard_weaknesses: passing.some((candidate) => candidate.baseline_hard_reject_reason_count >= 2),
    };
  });

  return {
    report_type: "offline_filter_calibration",
    config_version: FILTER_CALIBRATION_CONFIG_VERSION,
    generated_from_normalized_snapshot_only: true,
    provider_calls_performed: 0,
    snapshot_modified: false,
    production_snapshot_published: false,
    ...source,
    candidate_count: candidates.length,
    candidates: candidateRows,
    summary: {
      hard_reject_reason_counts: hardReasonCounts,
      candidates_with_one_hard_reject_reason: candidateRows.filter((candidate) => candidate.simultaneous_hard_reject_reason_count === 1).length,
      candidates_with_two_or_more_hard_reject_reasons: candidateRows.filter((candidate) => candidate.simultaneous_hard_reject_reason_count >= 2).length,
      candidates_with_missing_data: candidates.filter((candidate) => hasAnyMissingData(candidate)).length,
      candidates_using_fdv_instead_of_market_cap: candidates.filter((candidate) => candidate.market_cap_usd === null && candidate.fdv_usd !== null).length,
      chain_distribution: countStrings(candidates.map((candidate) => candidate.chain)),
      missing_field_distribution: missingFieldDistribution,
      distributions: {
        market_cap_usd: metricDistribution(candidates.map((candidate) => candidate.market_cap_usd), marketCapBuckets),
        fdv_usd: metricDistribution(candidates.map((candidate) => candidate.fdv_usd), marketCapBuckets),
        liquidity_usd: metricDistribution(candidates.map((candidate) => candidate.liquidity_usd), liquidityBuckets),
        volume_24h_usd: metricDistribution(candidates.map((candidate) => candidate.volume_24h_usd), volumeBuckets),
        pair_age_days: metricDistribution(candidates.map((candidate) => candidate.pair_age_days), pairAgeBuckets),
        volume_market_cap_ratio: metricDistribution(candidates.map((candidate) => candidate.volume_market_cap_ratio), ratioBuckets),
      },
    },
    variants: variantResults,
  };
}

function hasCompleteRequiredFilterData(candidate: CalibrationCandidate): boolean {
  return (candidate.market_cap_usd !== null || candidate.fdv_usd !== null)
    && candidate.volume_24h_usd !== null
    && candidate.liquidity_usd !== null
    && candidate.volume_market_cap_ratio !== null
    && candidate.pair_age_days !== null;
}

function hasAnyMissingData(candidate: CalibrationCandidate): boolean {
  return Object.values(missingFields(candidate)).some(Boolean);
}

function buildMissingFieldDistribution(candidates: CalibrationCandidate[]): Record<string, number> {
  const counts = Object.fromEntries(Object.keys(missingFields(candidates[0])).map((field) => [field, 0]));
  for (const candidate of candidates) {
    for (const [field, missing] of Object.entries(missingFields(candidate))) {
      if (missing) counts[field] = (counts[field] ?? 0) + 1;
    }
  }
  return counts;
}

function missingFields(candidate?: CalibrationCandidate): Record<string, boolean> {
  return {
    contract_address: candidate?.contract_address == null,
    pair_address: candidate?.pair_address == null,
    source_url: candidate?.source_url == null,
    price_usd: candidate?.price_usd == null,
    market_cap_usd: candidate?.market_cap_usd == null,
    fdv_usd: candidate?.fdv_usd == null,
    liquidity_usd: candidate?.liquidity_usd == null,
    volume_24h_usd: candidate?.volume_24h_usd == null,
    volume_market_cap_ratio: candidate?.volume_market_cap_ratio == null,
    pair_created_at: candidate?.pair_created_at == null,
    pair_age_days: candidate?.pair_age_days == null,
  };
}

function countStrings(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function metricDistribution(
  rawValues: Array<number | null>,
  bucket: (value: number) => string,
): MetricDistribution {
  const values = rawValues.filter((value): value is number => value !== null).sort((left, right) => left - right);
  return {
    count: values.length,
    missing: rawValues.length - values.length,
    min: values[0] ?? null,
    median: values.length === 0 ? null : values[Math.floor((values.length - 1) / 2)],
    max: values.at(-1) ?? null,
    values,
    buckets: countStrings(values.map(bucket)),
  };
}

function marketCapBuckets(value: number): string {
  if (value < 200_000) return "below_200000";
  if (value < 300_000) return "200000_to_below_300000";
  if (value <= 10_000_000) return "300000_to_10000000";
  if (value <= 15_000_000) return "above_10000000_to_15000000";
  return "above_15000000";
}

function liquidityBuckets(value: number): string {
  if (value < 20_000) return "below_20000";
  if (value < 30_000) return "20000_to_below_30000";
  return "30000_or_more";
}

function volumeBuckets(value: number): string {
  if (value < 20_000) return "below_20000";
  if (value < 30_000) return "20000_to_below_30000";
  return "30000_or_more";
}

function pairAgeBuckets(value: number): string {
  if (value <= 3) return "0_to_3_days";
  if (value <= 7) return "4_to_7_days";
  if (value < 14) return "8_to_13_days";
  if (value <= 90) return "14_to_90_days";
  return "above_90_days";
}

function ratioBuckets(value: number): string {
  if (value < 0.01) return "below_1_percent";
  if (value < 0.05) return "1_to_below_5_percent";
  if (value <= 0.3) return "5_to_30_percent";
  if (value <= 1) return "above_30_to_100_percent";
  return "above_100_percent";
}
