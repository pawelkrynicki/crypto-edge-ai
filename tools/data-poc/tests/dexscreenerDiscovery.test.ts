import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BoundedHttpClient, BoundedHttpError } from "../src/boundedHttpClient.js";
import {
  collectDexScreenerDiscovery,
  deduplicatePairs,
  DEXSCREENER_DISCOVERY_INSUFFICIENT_COVERAGE,
  DexScreenerDiscoveryError,
  DexScreenerProfilesRequestError,
  minimumSuccessfulSeedRequests,
  normalizeDexScreenerFailureReason,
  selectHighestLiquidityPair,
  selectProfileSeeds,
} from "../src/dexscreenerDiscovery.js";
import type { DexScreenerPair, DexScreenerTokenProfile } from "../src/types.js";

const NOW = new Date("2026-07-16T12:00:00.000Z");

describe("DexScreener latest-token-profile discovery", () => {
  it("caps and deduplicates profile seeds at 30", () => {
    const profiles: DexScreenerTokenProfile[] = Array.from({ length: 35 }, (_, index) => ({
      chainId: "base",
      tokenAddress: `0x${index}`,
    }));
    profiles.unshift({ chainId: "base", tokenAddress: "0x0" });

    assert.equal(selectProfileSeeds(profiles, 100).length, 30);
  });

  it("uses max(3, ceil(N * 0.5)) as the successful-seed threshold", () => {
    assert.equal(minimumSuccessfulSeedRequests(1), 3);
    assert.equal(minimumSuccessfulSeedRequests(5), 3);
    assert.equal(minimumSuccessfulSeedRequests(10), 5);
    assert.equal(minimumSuccessfulSeedRequests(11), 6);
  });

  it("loads token pairs with bounded concurrency and picks highest valid liquidity", async () => {
    const profiles = makeProfiles(6);
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
      now: NOW,
      client,
    });

    assert.equal(pairCalls, 6);
    assert.equal(maxActive <= 3, true);
    assert.deepEqual(result.metadata, {
      discovery_method: "dexscreener_latest_token_profiles",
      seed_count: 6,
      pair_requests_succeeded: 6,
      pair_requests_failed: 0,
      pairs_loaded: 12,
      candidates_before_filters: 6,
      candidates_after_filters: 6,
      discovery_status: "READY",
      failure_reason_counts: {},
    });
    assert.equal(result.candidates.every((candidate) => candidate.pair_address?.endsWith("-high")), true);
  });

  it("continues DEGRADED with one failed request out of ten", async () => {
    const result = await collectWithFailures(new Set([9]));
    assert.equal(result.candidates.length, 9);
    assert.equal(result.metadata.discovery_status, "DEGRADED");
    assert.equal(result.metadata.pair_requests_succeeded, 9);
    assert.equal(result.metadata.pair_requests_failed, 1);
    assert.deepEqual(result.metadata.failure_reason_counts, { NETWORK_ERROR: 1 });
  });

  it("continues DEGRADED with two failed requests out of ten", async () => {
    const result = await collectWithFailures(new Set([2, 8]));
    assert.equal(result.candidates.length, 8);
    assert.equal(result.metadata.discovery_status, "DEGRADED");
    assert.equal(result.metadata.pair_requests_succeeded, 8);
    assert.equal(result.metadata.pair_requests_failed, 2);
  });

  it("accepts exactly five successful requests out of ten", async () => {
    const result = await collectWithFailures(new Set([5, 6, 7, 8, 9]));
    assert.equal(result.candidates.length, 5);
    assert.equal(result.metadata.pair_requests_succeeded, 5);
    assert.equal(result.metadata.discovery_status, "DEGRADED");
  });

  it("fails closed below five successful requests out of ten", async () => {
    await assertInsufficientCoverage(new Set([4, 5, 6, 7, 8, 9]), 4, 6);
  });

  it("fails closed when all pair requests fail", async () => {
    await assertInsufficientCoverage(new Set(Array.from({ length: 10 }, (_, index) => index)), 0, 10);
  });

  it("keeps the profiles request as a hard gate", async () => {
    const client = new BoundedHttpClient({
      sourceId: "dexscreener",
      maxRequests: 1,
      maxRetries: 0,
      fetchImpl: async () => { throw new Error("profiles secret URL"); },
    });
    await assert.rejects(
      () => collectDexScreenerDiscovery({ environment: "INTERNAL_BETA", seedLimit: 10, client }),
      (error: unknown) => {
        assert.ok(error instanceof DexScreenerProfilesRequestError);
        assert.equal(error.code, "NETWORK_ERROR");
        assert.deepEqual(error.diagnostics, {
          profiles_request: "FAILED",
          minimum_seed_requests_required: 5,
          seed_count: 0,
          pair_requests_succeeded: 0,
          pair_requests_failed: 0,
          pairs_loaded: 0,
          failure_reason_counts: { NETWORK_ERROR: 1 },
        });
        assert.equal(JSON.stringify(error.diagnostics).includes("secret"), false);
        return true;
      },
    );
  });

  it("fails closed when successful requests produce no normalized pair", async () => {
    const client = new BoundedHttpClient({
      sourceId: "dexscreener",
      maxRequests: 4,
      maxRetries: 0,
      fetchImpl: async (input) => String(input).endsWith("/token-profiles/latest/v1")
        ? Response.json(makeProfiles(3))
        : Response.json([]),
    });
    await assert.rejects(
      () => collectDexScreenerDiscovery({ environment: "INTERNAL_BETA", seedLimit: 3, client }),
      (error: unknown) => error instanceof DexScreenerDiscoveryError
        && error.code === DEXSCREENER_DISCOVERY_INSUFFICIENT_COVERAGE
        && error.diagnostics.pair_requests_succeeded === 3
        && error.diagnostics.pairs_loaded === 0,
    );
  });

  it("normalizes failure reasons without persisting raw errors or token URLs", async () => {
    const result = await collectWithFailures(new Set([0, 1, 2]), (index) => {
      if (index === 0) return new Response("rate limited", { status: 429 });
      if (index === 1) return new Response("upstream down", { status: 503 });
      return new Response("missing", { status: 404 });
    });
    assert.deepEqual(result.metadata.failure_reason_counts, {
      HTTP_429: 1,
      HTTP_4XX: 1,
      HTTP_5XX: 1,
    });
    const serialized = JSON.stringify(result.metadata);
    assert.equal(serialized.includes("token-pairs"), false);
    assert.equal(serialized.includes("upstream down"), false);
    assert.equal(serialized.includes("stack"), false);
  });

  it("normalizes timeout and budget errors into the controlled vocabulary", () => {
    assert.equal(normalizeDexScreenerFailureReason(new BoundedHttpError("REQUEST_TIMEOUT", "dexscreener")), "TIMEOUT");
    assert.equal(normalizeDexScreenerFailureReason(new BoundedHttpError("REQUEST_BUDGET_EXHAUSTED", "dexscreener")), "REQUEST_BUDGET_EXHAUSTED");
    assert.equal(normalizeDexScreenerFailureReason(new BoundedHttpError("INVALID_JSON", "dexscreener", 200)), "INVALID_RESPONSE");
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
});

async function collectWithFailures(
  failed: Set<number>,
  failureResponse?: (index: number) => Response,
) {
  const profiles = makeProfiles(10);
  const client = new BoundedHttpClient({
    sourceId: "dexscreener",
    maxRequests: 11,
    maxRetries: 0,
    concurrency: 3,
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith("/token-profiles/latest/v1")) return Response.json(profiles);
      const address = decodeURIComponent(url.split("/").at(-1) ?? "");
      const index = Number(address.replace("0xtoken", ""));
      if (failed.has(index)) {
        if (failureResponse) return failureResponse(index);
        throw new Error(`transient secret failure for ${url}`);
      }
      return Response.json([pair(address, `pair-${index}`, 50_000)]);
    },
  });
  return collectDexScreenerDiscovery({
    environment: "INTERNAL_BETA",
    seedLimit: 10,
    now: NOW,
    client,
  });
}

async function assertInsufficientCoverage(
  failed: Set<number>,
  succeeded: number,
  failedCount: number,
): Promise<void> {
  await assert.rejects(
    () => collectWithFailures(failed),
    (error: unknown) => {
      assert.ok(error instanceof DexScreenerDiscoveryError);
      assert.equal(error.code, DEXSCREENER_DISCOVERY_INSUFFICIENT_COVERAGE);
      assert.equal(error.diagnostics.minimum_seed_requests_required, 5);
      assert.equal(error.diagnostics.pair_requests_succeeded, succeeded);
      assert.equal(error.diagnostics.pair_requests_failed, failedCount);
      assert.equal(JSON.stringify(error.diagnostics).includes("token-pairs"), false);
      return true;
    },
  );
}

function makeProfiles(count: number): DexScreenerTokenProfile[] {
  return Array.from({ length: count }, (_, index) => ({
    chainId: "base",
    tokenAddress: `0xtoken${index}`,
  }));
}

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
