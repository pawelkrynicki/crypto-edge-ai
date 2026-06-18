import type { CryptoEdgeCandidate } from "./types.js";

export const BASIC_FILTERS = {
  minMarketCapUsd: 300_000,
  maxMarketCapUsd: 10_000_000,
  minVolume24hUsd: 30_000,
  minLiquidityUsd: 30_000,
  minVolumeMarketCapRatio: 0.01,
  maxVolumeMarketCapRatio: 1,
  minPairAgeDays: 7,
  preferredMinPairAgeDays: 14,
  preferredMaxPairAgeDays: 90,
  sweetSpotMinVolumeMarketCapRatio: 0.05,
  sweetSpotMaxVolumeMarketCapRatio: 0.3
} as const;

export function calculateVolumeMarketCapRatio(
  volume24hUsd: number | null,
  marketCapUsd: number | null,
  fdvUsd: number | null,
  filterReasons: string[] = []
): number | null {
  const marketCapForRatio = marketCapUsd ?? fdvUsd;

  if (marketCapUsd === null && fdvUsd !== null) {
    filterReasons.push("market_cap_missing_using_fdv");
  }

  if (volume24hUsd === null || marketCapForRatio === null || marketCapForRatio <= 0) {
    return null;
  }

  return volume24hUsd / marketCapForRatio;
}

export function applyBasicFilters(candidate: CryptoEdgeCandidate): CryptoEdgeCandidate {
  const filterReasons = [...candidate.filter_reasons];
  const marketCapForFilter = candidate.market_cap_usd ?? candidate.fdv_usd;

  if (candidate.market_cap_usd === null && candidate.fdv_usd !== null) {
    addReason(filterReasons, "market_cap_missing_using_fdv");
  }

  if (marketCapForFilter === null) {
    filterReasons.push("market_cap_missing");
  } else {
    if (marketCapForFilter < BASIC_FILTERS.minMarketCapUsd) {
      filterReasons.push("market_cap_below_300000");
    }
    if (marketCapForFilter > BASIC_FILTERS.maxMarketCapUsd) {
      filterReasons.push("market_cap_above_10000000");
    }
  }

  if (candidate.volume_24h_usd === null) {
    filterReasons.push("volume_24h_missing");
  } else if (candidate.volume_24h_usd < BASIC_FILTERS.minVolume24hUsd) {
    filterReasons.push("volume_24h_below_30000");
  }

  if (candidate.liquidity_usd === null) {
    filterReasons.push("liquidity_missing");
  } else if (candidate.liquidity_usd < BASIC_FILTERS.minLiquidityUsd) {
    filterReasons.push("liquidity_below_30000");
  }

  if (candidate.volume_market_cap_ratio === null) {
    filterReasons.push("volume_market_cap_ratio_missing");
  } else {
    if (candidate.volume_market_cap_ratio < BASIC_FILTERS.minVolumeMarketCapRatio) {
      filterReasons.push("volume_market_cap_ratio_below_1_percent");
    }
    if (candidate.volume_market_cap_ratio > BASIC_FILTERS.maxVolumeMarketCapRatio) {
      filterReasons.push("volume_market_cap_ratio_above_100_percent");
    }
    if (
      candidate.volume_market_cap_ratio < BASIC_FILTERS.sweetSpotMinVolumeMarketCapRatio ||
      candidate.volume_market_cap_ratio > BASIC_FILTERS.sweetSpotMaxVolumeMarketCapRatio
    ) {
      filterReasons.push("volume_market_cap_ratio_outside_sweet_spot_5_30_percent");
    }
  }

  if (candidate.pair_age_days === null) {
    filterReasons.push("pair_age_missing");
  } else {
    if (candidate.pair_age_days <= BASIC_FILTERS.minPairAgeDays) {
      filterReasons.push("pair_age_not_above_7_days");
    }
    if (
      candidate.pair_age_days < BASIC_FILTERS.preferredMinPairAgeDays ||
      candidate.pair_age_days > BASIC_FILTERS.preferredMaxPairAgeDays
    ) {
      filterReasons.push("pair_age_outside_preferred_14_90_days");
    }
  }

  const hardRejectReasons = filterReasons.filter((reason) => !isSoftReason(reason));

  return {
    ...candidate,
    status: hardRejectReasons.length === 0 ? "passed_basic_filter" : "rejected_basic_filter",
    filter_reasons: filterReasons
  };
}

function isSoftReason(reason: string): boolean {
  return (
    reason === "market_cap_missing_using_fdv" ||
    reason === "volume_market_cap_ratio_outside_sweet_spot_5_30_percent" ||
    reason === "pair_age_outside_preferred_14_90_days"
  );
}

function addReason(reasons: string[], reason: string): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}
