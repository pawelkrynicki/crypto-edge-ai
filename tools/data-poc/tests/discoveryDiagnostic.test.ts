import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertDiscoveryDiagnosticEnvironment,
  runDiscoveryDiagnostic,
} from "../src/discoveryDiagnostic.js";
import type { DexScreenerPair } from "../src/types.js";

const ENV = {
  CRYPTO_EDGE_DATA_ENV: "INTERNAL_BETA",
  CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
  ALLOW_LIVE_PROVIDER_CALLS: "1",
};

describe("DexScreener discovery-only diagnostic", () => {
  it("fails before fetch without explicit INTERNAL_BETA live consent", async () => {
    let fetchCalls = 0;
    await assert.rejects(() => runDiscoveryDiagnostic({
      env: { ...ENV, ALLOW_LIVE_PROVIDER_CALLS: undefined },
      fetchImpl: async () => { fetchCalls += 1; return Response.json([]); },
    }), /DISCOVERY_DIAGNOSTIC_LIVE_CALLS_NOT_ALLOWED/);
    assert.equal(fetchCalls, 0);
  });

  it("invokes only bounded DexScreener endpoints and never publishes", async () => {
    const urls: string[] = [];
    const result = await runDiscoveryDiagnostic({
      env: ENV,
      seedLimit: 2,
      now: new Date("2026-07-18T12:00:00.000Z"),
      fetchImpl: async (input) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith("/token-profiles/latest/v1")) {
          return Response.json([
            { chainId: "base", tokenAddress: "0x1" },
            { chainId: "base", tokenAddress: "0x2" },
          ]);
        }
        if (url.endsWith("/base/0x1")) return Response.json([
          pair("0x1", "low", 20_000),
          pair("0x1", "high", 60_000),
        ]);
        if (url.endsWith("/base/0x2")) return Response.json([]);
        throw new Error(`unexpected URL ${url}`);
      },
    });

    assert.equal(urls.length, 3);
    assert.equal(urls.every((url) => url.startsWith("https://api.dexscreener.com/")), true);
    assert.equal(result.counts.profiles_loaded, 2);
    assert.equal(result.counts.seed_count, 2);
    assert.equal(result.counts.pairs_loaded, 2);
    assert.equal(result.counts.candidates_normalized, 1);
    assert.equal(result.discovery_quality.selected_profiles_without_usable_pair, 1);
    assert.equal(result.discovery_quality.highest_liquidity_selection_valid, true);
    assert.deepEqual(result.provider_sources_invoked, ["dexscreener"]);
    assert.equal(result.security_calls_performed, 0);
    assert.equal(result.context_calls_performed, 0);
    assert.equal(result.production_snapshot_published, false);
    assert.equal(result.atomic_publish_performed, false);
    assert.equal(JSON.stringify(result).includes("raw_provider_payload"), false);
  });

  it("requires both INTERNAL_BETA flags", () => {
    assert.throws(() => assertDiscoveryDiagnosticEnvironment({
      ...ENV,
      CRYPTO_EDGE_RUNTIME_MODE: "DEVELOPMENT_DEMO",
    }), /DISCOVERY_DIAGNOSTIC_RUNTIME_MODE_INVALID/);
  });
});

function pair(address: string, pairAddress: string, liquidity: number): DexScreenerPair {
  return {
    chainId: "base",
    dexId: "uniswap",
    url: `https://dexscreener.com/base/${pairAddress}`,
    pairAddress,
    baseToken: { address, symbol: "DIA", name: "Diagnostic" },
    priceUsd: "1",
    marketCap: 1_000_000,
    fdv: 1_000_000,
    liquidity: { usd: liquidity },
    volume: { h24: 100_000 },
    pairCreatedAt: Date.parse("2026-07-01T12:00:00.000Z"),
  };
}
