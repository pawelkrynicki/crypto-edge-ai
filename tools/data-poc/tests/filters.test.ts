import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyBasicFilters, calculateVolumeMarketCapRatio } from "../src/filters.js";
import type { CryptoEdgeCandidate } from "../src/types.js";

function candidate(overrides: Partial<CryptoEdgeCandidate> = {}): CryptoEdgeCandidate {
  return {
    symbol: "TEST",
    name: "Test Token",
    chain: "solana",
    contract_address: "TOKEN111",
    pair_address: "PAIR111",
    dex: "raydium",
    source: "dexscreener",
    source_url: "https://dexscreener.com/solana/testpair",
    price_usd: 0.01,
    market_cap_usd: 1_000_000,
    fdv_usd: 1_200_000,
    liquidity_usd: 100_000,
    volume_24h_usd: 100_000,
    volume_market_cap_ratio: 0.1,
    pair_created_at: "2026-05-19T00:00:00.000Z",
    pair_age_days: 30,
    status: "raw",
    filter_reasons: [],
    ...overrides
  };
}

describe("calculateVolumeMarketCapRatio", () => {
  it("calculates volume/market-cap ratio", () => {
    assert.equal(calculateVolumeMarketCapRatio(50_000, 1_000_000, null), 0.05);
  });
});

describe("applyBasicFilters", () => {
  it("rejects liquidity below 30000", () => {
    const result = applyBasicFilters(candidate({ liquidity_usd: 29_999 }));
    assert.equal(result.status, "rejected_basic_filter");
    assert.ok(result.filter_reasons.includes("liquidity_below_30000"));
  });

  it("rejects 24h volume below 30000", () => {
    const result = applyBasicFilters(candidate({ volume_24h_usd: 29_999 }));
    assert.equal(result.status, "rejected_basic_filter");
    assert.ok(result.filter_reasons.includes("volume_24h_below_30000"));
  });

  it("rejects market cap below 300000", () => {
    const result = applyBasicFilters(candidate({ market_cap_usd: 299_999 }));
    assert.equal(result.status, "rejected_basic_filter");
    assert.ok(result.filter_reasons.includes("market_cap_below_300000"));
  });

  it("rejects market cap above 10000000", () => {
    const result = applyBasicFilters(candidate({ market_cap_usd: 10_000_001 }));
    assert.equal(result.status, "rejected_basic_filter");
    assert.ok(result.filter_reasons.includes("market_cap_above_10000000"));
  });

  it("rejects volume/market-cap ratio below 1%", () => {
    const result = applyBasicFilters(candidate({ volume_market_cap_ratio: 0.009 }));
    assert.equal(result.status, "rejected_basic_filter");
    assert.ok(result.filter_reasons.includes("volume_market_cap_ratio_below_1_percent"));
  });

  it("rejects volume/market-cap ratio above 100%", () => {
    const result = applyBasicFilters(candidate({ volume_market_cap_ratio: 1.01 }));
    assert.equal(result.status, "rejected_basic_filter");
    assert.ok(result.filter_reasons.includes("volume_market_cap_ratio_above_100_percent"));
  });

  it("passes a valid candidate", () => {
    const result = applyBasicFilters(candidate());
    assert.equal(result.status, "passed_basic_filter");
    assert.deepEqual(result.filter_reasons, []);
  });
});
