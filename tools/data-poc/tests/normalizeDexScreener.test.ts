import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculatePairAgeDays, normalizeDexScreenerPair } from "../src/normalizeDexScreener.js";
import type { DexScreenerPair } from "../src/types.js";

const NOW = new Date("2026-06-18T00:00:00.000Z");
const PAIR_CREATED_AT = new Date("2026-05-19T00:00:00.000Z").getTime();

function basePair(overrides: Partial<DexScreenerPair> = {}): DexScreenerPair {
  return {
    chainId: "solana",
    dexId: "raydium",
    url: "https://dexscreener.com/solana/testpair",
    pairAddress: "PAIR111",
    baseToken: {
      address: "TOKEN111",
      name: "Test Token",
      symbol: "TEST"
    },
    priceUsd: "0.01",
    marketCap: 1_000_000,
    fdv: 1_200_000,
    pairCreatedAt: PAIR_CREATED_AT,
    liquidity: {
      usd: 100_000
    },
    volume: {
      h24: 100_000
    },
    ...overrides
  };
}

describe("normalizeDexScreenerPair", () => {
  it("normalizes a DexScreener pair to a Crypto Edge AI candidate", () => {
    const candidate = normalizeDexScreenerPair(basePair(), NOW);

    assert.deepEqual(
      {
        symbol: candidate.symbol,
        name: candidate.name,
        chain: candidate.chain,
        contract_address: candidate.contract_address,
        pair_address: candidate.pair_address,
        dex: candidate.dex,
        source: candidate.source,
        source_url: candidate.source_url,
        price_usd: candidate.price_usd,
        market_cap_usd: candidate.market_cap_usd,
        fdv_usd: candidate.fdv_usd,
        liquidity_usd: candidate.liquidity_usd,
        volume_24h_usd: candidate.volume_24h_usd,
        volume_market_cap_ratio: candidate.volume_market_cap_ratio,
        pair_age_days: candidate.pair_age_days,
        status: candidate.status
      },
      {
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
      pair_age_days: 30,
      status: "passed_basic_filter"
      }
    );
  });

  it("calculates pair age days", () => {
    assert.equal(calculatePairAgeDays("2026-06-01T00:00:00.000Z", NOW), 17);
  });

  it("uses fdv as fallback when market cap is missing", () => {
    const candidate = normalizeDexScreenerPair(basePair({ marketCap: undefined, fdv: 1_000_000 }), NOW);

    assert.equal(candidate.volume_market_cap_ratio, 0.1);
    assert.ok(candidate.filter_reasons.includes("market_cap_missing_using_fdv"));
    assert.equal(candidate.status, "passed_basic_filter");
  });
});
