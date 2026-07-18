import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CALIBRATION_VARIANTS,
  buildFilterCalibrationReport,
  evaluateCandidateAgainstThresholds,
  splitFilterReasons,
  type CalibrationCandidate,
} from "../src/filterCalibration.js";

function candidate(overrides: Partial<CalibrationCandidate> = {}): CalibrationCandidate {
  return {
    candidate_id: "candidate-1",
    symbol: "CAL",
    name: "Calibration",
    chain: "base",
    contract_address: "0x1",
    pair_address: "pair-1",
    dex: "uniswap",
    source_url: "https://dexscreener.com/base/pair-1",
    price_usd: 1,
    market_cap_usd: 1_000_000,
    fdv_usd: 1_000_000,
    liquidity_usd: 50_000,
    volume_24h_usd: 50_000,
    volume_market_cap_ratio: 0.05,
    pair_created_at: "2026-07-12T00:00:00.000Z",
    pair_age_days: 5,
    status: "rejected_basic_filter",
    filter_reasons: ["pair_age_not_above_7_days", "pair_age_outside_preferred_14_90_days"],
    ...overrides,
  };
}

describe("filter calibration", () => {
  it("keeps hard and soft reasons separate", () => {
    assert.deepEqual(splitFilterReasons(candidate().filter_reasons), {
      hard: ["pair_age_not_above_7_days"],
      soft: ["pair_age_outside_preferred_14_90_days"],
    });
  });

  it("calculates variants without mutating the normalized candidate", () => {
    const input = candidate();
    const before = structuredClone(input);
    const report = buildFilterCalibrationReport([input], { run_id: "scan-test" });

    assert.deepEqual(input, before);
    assert.equal(report.variants.find((variant) => variant.variant_id === "A")?.passing_candidate_count, 0);
    assert.equal(report.variants.find((variant) => variant.variant_id === "E")?.passing_candidate_count, 1);
    assert.equal(report.summary.candidates_with_one_hard_reject_reason, 1);
    assert.equal(report.provider_calls_performed, 0);
    assert.equal(report.production_snapshot_published, false);
  });

  it("fails closed when a required filter field is missing", () => {
    const baseline = CALIBRATION_VARIANTS.find((variant) => variant.id === "A");
    assert.ok(baseline);
    const result = evaluateCandidateAgainstThresholds(
      candidate({ market_cap_usd: null, fdv_usd: null }),
      baseline.thresholds,
    );
    assert.equal(result.passed, false);
    assert.ok(result.hard_reject_reasons.includes("market_cap_or_fdv_missing"));
  });
});
