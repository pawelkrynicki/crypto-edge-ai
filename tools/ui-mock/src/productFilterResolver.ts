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
  hardFailureReasons: string[];
  missingDataReasons: string[];
  preferredRangeNotes: string[];
  informationalReasons: string[];
  unknownReasons: string[];
};

/**
 * Canonical display metadata for a hard filter failure.  Public research
 * guidance uses this instead of reconstructing thresholds in a second rule
 * engine.
 */
export type ProductFilterThreshold = {
  comparator: "minimum" | "maximum";
  value: number;
  format: "usd" | "percent" | "days";
};

/** Public filter requirements are display metadata owned beside the resolver,
 * never a second pass/fail engine. Preferred ranges remain non-blocking. */
export type ProductFilterRequirement = { hard: string; preferred: string | null };

const FILTER_REQUIREMENTS: Record<BasicFilterCategory, ProductFilterRequirement> = {
  market_cap: { hard: "$300K–$10M", preferred: null },
  volume_24h: { hard: "≥ $30K", preferred: null },
  liquidity: { hard: "≥ $30K", preferred: null },
  volume_market_cap_ratio: { hard: "1%–100%", preferred: "5%–30%" },
  pair_age: { hard: "> 7 days", preferred: "14–90 days" },
};

export function getProductFilterRequirement(category: BasicFilterCategory): ProductFilterRequirement {
  return FILTER_REQUIREMENTS[category];
}

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

const MISSING_DATA_REASONS = new Set([
  "market_cap_missing",
  "volume_24h_missing",
  "liquidity_missing",
  "volume_market_cap_ratio_missing",
  "pair_age_missing",
]);

const INFORMATIONAL_REASONS = new Set([
  "market_cap_missing_using_fdv",
]);

export function resolveProductFilterConditions(
  input: ProductFilterResolverInput,
): ProductFilterResolution {
  const reasons = [...new Set(input.filterReasons.filter((reason) => reason.trim().length > 0))];
  const failures = new Map<BasicFilterCategory, string[]>();
  const hardFailureReasons: string[] = [];
  const missingDataReasons: string[] = [];
  const preferredRangeNotes: string[] = [];
  const informationalReasons: string[] = [];
  const unknownReasons: string[] = [];

  for (const reason of reasons) {
    const category = HARD_FAILURE_CATEGORY_BY_REASON[
      reason as keyof typeof HARD_FAILURE_CATEGORY_BY_REASON
    ];
    if (category) {
      if (MISSING_DATA_REASONS.has(reason)) missingDataReasons.push(reason);
      else hardFailureReasons.push(reason);
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
    hardFailureReasons,
    missingDataReasons,
    preferredRangeNotes,
    informationalReasons,
    unknownReasons,
  };
}

/**
 * Read-only presentation of the values in the current accepted snapshot.
 * Follow-up retains the checkpoint result separately, so this never feeds
 * lifecycle, reclassification, or a new checkpoint write.
 */
export function resolveCurrentProductFilterConditions(input: {
  marketCap: number | null;
  fdvUsd: number | null;
  volume24h: number | null;
  liquidity: number | null;
  volumeMarketCapRatio: number | null;
  pairAgeDays: number | null;
}): BasicFilterConditionResolution[] {
  const threshold = (reason: keyof typeof HARD_FILTER_THRESHOLD_BY_REASON) => HARD_FILTER_THRESHOLD_BY_REASON[reason].value;
  const state = (value: number | null, minimumReason: keyof typeof HARD_FILTER_THRESHOLD_BY_REASON, maximumReason?: keyof typeof HARD_FILTER_THRESHOLD_BY_REASON, strictlyAbove = false): BasicFilterConditionState => {
    if (value === null || !Number.isFinite(value)) return "unknown";
    const minimum = threshold(minimumReason);
    const maximum = maximumReason ? threshold(maximumReason) : null;
    return (strictlyAbove ? value > minimum : value >= minimum) && (maximum === null || value <= maximum) ? "passed" : "failed";
  };
  return [
    { category: "market_cap", state: state(input.marketCap ?? input.fdvUsd, "market_cap_below_300000", "market_cap_above_10000000"), failureReasons: [] },
    { category: "volume_24h", state: state(input.volume24h, "volume_24h_below_30000"), failureReasons: [] },
    { category: "liquidity", state: state(input.liquidity, "liquidity_below_30000"), failureReasons: [] },
    { category: "volume_market_cap_ratio", state: state(input.volumeMarketCapRatio, "volume_market_cap_ratio_below_1_percent", "volume_market_cap_ratio_above_100_percent"), failureReasons: [] },
    { category: "pair_age", state: state(input.pairAgeDays, "pair_age_not_above_7_days", undefined, true), failureReasons: [] },
  ];
}

export const SUPPORTED_HARD_FILTER_REASONS = Object.freeze(
  Object.keys(HARD_FAILURE_CATEGORY_BY_REASON),
);

export function resolveProductFilterThreshold(
  condition: Pick<BasicFilterConditionResolution, "failureReasons">,
): ProductFilterThreshold | null {
  for (const reason of condition.failureReasons) {
    const threshold = HARD_FILTER_THRESHOLD_BY_REASON[reason];
    if (threshold) return threshold;
  }
  return null;
}

const HARD_FILTER_THRESHOLD_BY_REASON: Readonly<Record<string, ProductFilterThreshold>> = {
  market_cap_below_300000: { comparator: "minimum", value: 300_000, format: "usd" },
  market_cap_above_10000000: { comparator: "maximum", value: 10_000_000, format: "usd" },
  volume_24h_below_30000: { comparator: "minimum", value: 30_000, format: "usd" },
  liquidity_below_30000: { comparator: "minimum", value: 30_000, format: "usd" },
  volume_market_cap_ratio_below_1_percent: { comparator: "minimum", value: 0.01, format: "percent" },
  volume_market_cap_ratio_above_100_percent: { comparator: "maximum", value: 1, format: "percent" },
  pair_age_not_above_7_days: { comparator: "minimum", value: 7, format: "days" },
};
