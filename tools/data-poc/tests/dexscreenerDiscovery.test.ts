import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BoundedHttpClient } from "../src/boundedHttpClient.js";
import {
  collectDexScreenerDiscovery,
  deduplicatePairs,
  selectHighestLiquidityPair,
  selectProfileSeeds,
} from "../src/dexscreenerDiscovery.js";
import type { DexScreenerPair, DexScreenerTokenProfile } from "../src/types.js";

describe("DexScreener latest-token-profile discovery", () => {
  it("caps and deduplicates profile seeds at 30", () => {
    const profiles: DexScreenerTokenProfile[] = Array.from({ length: 35 }, (_, index) => ({
      chainId: "base",
      tokenAddress: `0x${index}`,
    }));
    profiles.unshift({ chainId: "base", tokenAddress: "0x0" });

    assert.equal(selectProfileSeeds(profiles, 100).length, 30);
  });

  it("loads token pairs with bounded concurrency and picks highest valid liquidity", async () => {
    const profiles = Array.from({ length: 6 }, (_, index) => ({ chainId: "base", tokenAddress: `0x${index}` }));
    let active = 0;
    let maxActive = 0;
    let pairCalls = 0;
    const client = new BoundedHttpClient({
      sourceId: "dexscreener",
      maxRequests: 10,
      concurrency: 3,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/token-profiles/latest/v1")) return Response.json(profiles);
        pairCalls += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        const address = decodeURIComponent(url.split("/").at(-1) ?? "");
        return Response.json([
          pair(address, `${address}-low`, 10_000),
          pair(address, `${address}-high`, 50_000),
        ]);
      },
    });

    const result = await collectDexScreenerDiscovery({
      environment: "INTERNAL_BETA",
      seedLimit: 6,
      now: new Date("2026-07-16T12:00:00.000Z"),
      client,
    });

    assert.equal(pairCalls, 6);
    assert.equal(maxActive <= 3, true);
    assert.equal(result.metadata.seed_count, 6);
    assert.equal(result.metadata.pairs_loaded, 12);
    assert.equal(result.candidates.every((candidate) => candidate.pair_address?.endsWith("-high")), true);
  });

  it("deduplicates the selected chain/contract/pair tuple", () => {
    const duplicate = pair("0x1", "pair-1", 50_000);
    assert.equal(deduplicatePairs([duplicate, structuredClone(duplicate)]).length, 1);
  });

  it("ignores invalid liquidity when selecting a pair", () => {
    const seed = { chainId: "base", tokenAddress: "0x1" };
    const selected = selectHighestLiquidityPair(seed, [
      pair("0x1", "invalid", Number.NaN),
      pair("0x1", "valid", 25_000),
    ]);
    assert.equal(selected?.pairAddress, "valid");
  });

  it("fails closed when latest profiles contain no valid seeds", async () => {
    const client = new BoundedHttpClient({
      sourceId: "dexscreener",
      maxRequests: 2,
      fetchImpl: async () => Response.json([]),
    });
    await assert.rejects(() => collectDexScreenerDiscovery({
      environment: "INTERNAL_BETA",
      seedLimit: 10,
      client,
    }), /DEXSCREENER_SEEDS_UNAVAILABLE/);
  });

  it("fails closed when profiles produce no usable pair", async () => {
    const client = new BoundedHttpClient({
      sourceId: "dexscreener",
      maxRequests: 3,
      fetchImpl: async (input) => String(input).endsWith("/token-profiles/latest/v1")
        ? Response.json([{ chainId: "base", tokenAddress: "0x1" }])
        : Response.json([]),
    });
    await assert.rejects(() => collectDexScreenerDiscovery({
      environment: "INTERNAL_BETA",
      seedLimit: 1,
      client,
    }), /DEXSCREENER_PAIRS_UNAVAILABLE/);
  });
});

function pair(address: string, pairAddress: string, liquidityUsd: number): DexScreenerPair {
  return {
    chainId: "base",
    dexId: "uniswap",
    url: `https://dexscreener.com/base/${pairAddress}`,
    pairAddress,
    baseToken: { address, symbol: "LIVE", name: "Live Token" },
    priceUsd: "1",
    marketCap: 1_000_000,
    fdv: 1_000_000,
    liquidity: { usd: liquidityUsd },
    volume: { h24: 100_000 },
    pairCreatedAt: Date.parse("2026-06-16T12:00:00.000Z"),
  };
}
