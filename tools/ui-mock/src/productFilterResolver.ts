export const BASIC_FILTER_CATEGORIES = [
  "market_cap",
  "volume_24h",
  "liquidity",
  "volume_market_cap_ratio",
  "pair_age",
] as const;

export type BasicFilterCategory = (typeof BASIC_FILTER_CATEGORIES)[number];
export type BasicFilterConditionState = "passed" | "failed" | "unknown";

export type BasicFilterConditionResolution = {
  category: BasicFilterCategory;
  state: BasicFilterConditionState;
  failureReasons: string[];
};

export type ProductFilterResolution = {
  conditions: BasicFilterConditionResolution[];
  preferredRangeNotes: string[];
  informationalReasons: string[];
  unknownReasons: string[];
};

export type ProductFilterResolverInput = {
  basicFilterStatus: string;
  filterReasons: readonly string[];
};

const HARD_FAILURE_CATEGORY_BY_REASON = {
  market_cap_missing: "market_cap",
  market_cap_below_300000: "market_cap",
  market_cap_above_10000000: "market_cap",
  market_cap_below_min: "market_cap",
  market_cap_above_max: "market_cap",
  volume_24h_missing: "volume_24h",
  volume_24h_below_30000: "volume_24h",
  volume_24h_below_min: "volume_24h",
  liquidity_missing: "liquidity",
  liquidity_below_30000: "liquidity",
  liquidity_below_min: "liquidity",
  volume_market_cap_ratio_missing: "volume_market_cap_ratio",
  volume_market_cap_ratio_below_1_percent: "volume_market_cap_ratio",
  volume_market_cap_ratio_above_100_percent: "volume_market_cap_ratio",
  volume_market_cap_ratio_below_min: "volume_market_cap_ratio",
  volume_market_cap_ratio_above_max: "volume_market_cap_ratio",
  pair_age_missing: "pair_age",
  pair_age_not_above_7_days: "pair_age",
  pair_age_below_min: "pair_age",
} as const satisfies Record<string, BasicFilterCategory>;

const PREFERRED_RANGE_REASONS = new Set([
  "volume_market_cap_ratio_outside_sweet_spot_5_30_percent",
  "pair_age_outside_preferred_14_90_days",
]);

const INFORMATIONAL_REASONS = new Set([
  "market_cap_missing_using_fdv",
]);

export function resolveProductFilterConditions(
  input: ProductFilterResolverInput,
): ProductFilterResolution {
  const reasons = [...new Set(input.filterReasons.filter((reason) => reason.trim().length > 0))];
  const failures = new Map<BasicFilterCategory, string[]>();
  const preferredRangeNotes: string[] = [];
  const informationalReasons: string[] = [];
  const unknownReasons: string[] = [];

  for (const reason of reasons) {
    const category = HARD_FAILURE_CATEGORY_BY_REASON[
      reason as keyof typeof HARD_FAILURE_CATEGORY_BY_REASON
    ];
    if (category) {
      const categoryReasons = failures.get(category) ?? [];
      categoryReasons.push(reason);
      failures.set(category, categoryReasons);
    } else if (PREFERRED_RANGE_REASONS.has(reason)) {
      preferredRangeNotes.push(reason);
    } else if (INFORMATIONAL_REASONS.has(reason)) {
      informationalReasons.push(reason);
    } else {
      unknownReasons.push(reason);
    }
  }

  const hasCanonicalFailure = failures.size > 0;
  const statusConfirmsPass = input.basicFilterStatus === "passed_basic_filter";
  const statusConfirmsCanonicalFailures = input.basicFilterStatus === "rejected_basic_filter"
    && hasCanonicalFailure;

  return {
    conditions: BASIC_FILTER_CATEGORIES.map((category) => {
      const failureReasons = failures.get(category) ?? [];
      const state: BasicFilterConditionState = failureReasons.length > 0
        ? "failed"
        : statusConfirmsPass || statusConfirmsCanonicalFailures
          ? "passed"
          : "unknown";
      return { category, state, failureReasons };
    }),
    preferredRangeNotes,
    informationalReasons,
    unknownReasons,
  };
}

export const SUPPORTED_HARD_FILTER_REASONS = Object.freeze(
  Object.keys(HARD_FAILURE_CATEGORY_BY_REASON),
);
