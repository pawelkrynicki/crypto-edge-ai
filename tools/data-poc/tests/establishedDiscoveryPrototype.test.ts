import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeQueries,
  runEstablishedDiscoveryPrototype,
  selectHighestLiquidityPairPerToken,
} from "../src/establishedDiscoveryPrototype.js";
import type { DexScreenerPair } from "../src/types.js";

const ENV = {
  CRYPTO_EDGE_DATA_ENV: "INTERNAL_BETA",
  CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
  ALLOW_LIVE_PROVIDER_CALLS: "1",
};

describe("established-small-cap search prototype", () => {
  it("requires an explicit query plan", async () => {
    await assert.rejects(() => runEstablishedDiscoveryPrototype({ env: ENV, queries: [] }), /ESTABLISHED_DISCOVERY_QUERY_REQUIRED/);
  });

  it("caps and deduplicates owner-provided queries", () => {
    assert.deepEqual(normalizeQueries([" SOL/USDC ", "sol/usdc", "A", "B", "C", "D", "E"]), [
      "SOL/USDC", "A", "B", "C", "D",
    ]);
  });

  it("uses only official DexScreener search and never publishes", async () => {
    const urls: string[] = [];
    const result = await runEstablishedDiscoveryPrototype({
      env: ENV,
      queries: ["SOL/USDC", "WETH/USDC"],
      now: new Date("2026-07-18T12:00:00.000Z"),
      fetchImpl: async (input) => {
        const url = String(input);
        urls.push(url);
        return Response.json({
          pairs: [pair("base", "0x1", "low", 20_000), pair("base", "0x1", "high", 60_000)],
          provider_private_field: "must-not-appear",
        });
      },
    });

    assert.equal(urls.length, 2);
    assert.equal(urls.every((url) => url.startsWith("https://api.dexscreener.com/latest/dex/search?q=")), true);
    assert.equal(result.counts.pairs_loaded, 4);
    assert.equal(result.counts.pairs_selected_by_highest_liquidity_per_token, 1);
    assert.equal(result.candidates[0]?.symbol, "EST");
    assert.equal(result.production_snapshot_published, false);
    assert.equal(result.security_calls_performed, 0);
    assert.equal(result.context_calls_performed, 0);
    assert.equal(JSON.stringify(result).includes("provider_private_field"), false);
    assert.equal(JSON.stringify(result).includes("must-not-appear"), false);
  });

  it("selects the highest-liquidity pair per chain and base token", () => {
    const selected = selectHighestLiquidityPairPerToken([
      pair("base", "0x1", "low", 20_000),
      pair("base", "0x1", "high", 60_000),
      pair("solana", "0x1", "other-chain", 30_000),
    ]);
    assert.deepEqual(selected.map((candidate) => candidate.pairAddress), ["high", "other-chain"]);
  });
});

function pair(chain: string, address: string, pairAddress: string, liquidity: number): DexScreenerPair {
  return {
    chainId: chain,
    dexId: "uniswap",
    url: `https://dexscreener.com/${chain}/${pairAddress}`,
    pairAddress,
    baseToken: { address, symbol: "EST", name: "Established" },
    priceUsd: "1",
    marketCap: 1_000_000,
    fdv: 1_000_000,
    liquidity: { usd: liquidity },
    volume: { h24: 100_000 },
    pairCreatedAt: Date.parse("2026-06-01T12:00:00.000Z"),
  };
}
