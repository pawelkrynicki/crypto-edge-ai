import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyEstablishedDiscoveryResult,
  exactAliasMatch,
  resolveEstablishedCandidatePair,
  runEstablishedDiscoveryPrototype,
} from "../src/establishedDiscoveryPrototype.js";
import {
  ESTABLISHED_DISCOVERY_APPROVED_QUERIES,
  loadEstablishedDiscoveryQueryPlan,
  validateEstablishedDiscoveryQueryPlan,
  type EstablishedDiscoveryQueryPlan,
} from "../src/establishedDiscoveryQueryPlan.js";
import { BASIC_FILTERS } from "../src/filters.js";
import type { DexScreenerPair } from "../src/types.js";

const ENV = {
  CRYPTO_EDGE_DATA_ENV: "INTERNAL_BETA",
  CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
  ALLOW_LIVE_PROVIDER_CALLS: "1",
};
const NOW = new Date("2026-07-18T12:00:00.000Z");

describe("established-small-cap query plan", () => {
  it("loads and validates the canonical v1 config", () => {
    const plan = loadEstablishedDiscoveryQueryPlan();
    assert.equal(plan.plan_version, "established_basket_v1");
    assert.deepEqual(plan.queries, ESTABLISHED_DISCOVERY_APPROVED_QUERIES);
    assert.equal(plan.production_enabled, false);
  });

  it("rejects an unknown config version", () => {
    const plan = clonePlan();
    assert.throws(() => validateEstablishedDiscoveryQueryPlan({ ...plan, plan_version: "future" }), /CONFIG_VERSION_UNSUPPORTED/);
  });

  it("rejects more than five queries", () => {
    const plan = clonePlan();
    assert.throws(() => validateEstablishedDiscoveryQueryPlan({ ...plan, queries: [...plan.queries, "EXTRA"] }), /TOO_MANY_QUERIES/);
  });

  it("rejects an unapproved or reordered query", () => {
    const plan = clonePlan();
    assert.throws(() => validateEstablishedDiscoveryQueryPlan({ ...plan, queries: ["USDC", "USDT", "WETH", "WBNB", "BTC"] }), /QUERY_NOT_APPROVED/);
    assert.throws(() => validateEstablishedDiscoveryQueryPlan({ ...plan, queries: ["USDT", "USDC", "WETH", "WBNB", "SOL"] }), /QUERY_NOT_APPROVED/);
  });
});

describe("established anchor/candidate resolution", () => {
  const plan = loadEstablishedDiscoveryQueryPlan();

  it("matches exact symbols case-insensitively", () => {
    assert.equal(exactAliasMatch("usdc", ["USDC"]), "USDC");
  });

  it("forbids substring matches", () => {
    assert.equal(exactAliasMatch("USDTX", ["USDT"]), null);
    assert.equal(exactAliasMatch("SOLCAT", ["SOL", "WSOL"]), null);
  });

  it("uses baseToken as candidate when anchor is quoteToken", () => {
    const result = resolveEstablishedCandidatePair(pair(), "USDC", plan);
    assert.equal(result.accepted, true);
    assert.equal(result.anchor_side, "quoteToken");
    assert.equal(result.candidate_side, "baseToken");
    assert.equal(result.candidate_token?.symbol, "EST");
  });

  it("identifies quoteToken as candidate when anchor is baseToken and fails closed on base-scoped market data", () => {
    const input = pair({ baseToken: { address: "anchor", symbol: "USDC", name: "USD Coin" }, quoteToken: { address: "0xest", symbol: "EST", name: "Established" } });
    const result = resolveEstablishedCandidatePair(input, "USDC", plan);
    assert.equal(result.anchor_side, "baseToken");
    assert.equal(result.candidate_side, "quoteToken");
    assert.equal(result.candidate_token?.symbol, "EST");
    assert.equal(result.rejection_reason, "missing_market_data");
    assert.ok(result.missing_fields.includes("quote_token_market_data_not_attributable"));
  });

  it("rejects an anchor present on both sides", () => {
    const result = resolveEstablishedCandidatePair(pair({ baseToken: { address: "a", symbol: "USDC" } }), "USDC", plan);
    assert.equal(result.rejection_reason, "ambiguous_anchor");
  });

  it("rejects a pair without an exact anchor", () => {
    const result = resolveEstablishedCandidatePair(pair({ quoteToken: { address: "q", symbol: "USDCX" } }), "USDC", plan);
    assert.equal(result.rejection_reason, "anchor_not_matched");
  });

  it("never returns the anchor as candidate", () => {
    const result = resolveEstablishedCandidatePair(pair(), "USDC", plan);
    assert.notEqual(result.candidate_token?.symbol?.toLowerCase(), result.matched_anchor_symbol?.toLowerCase());
  });

  it("rejects robinhood and unknown chains before anchor normalization", () => {
    assert.equal(resolveEstablishedCandidatePair(pair({ chainId: "robinhood" }), "USDC", plan).rejection_reason, "unsupported_chain");
    assert.equal(resolveEstablishedCandidatePair(pair({ chainId: "unknown-chain" }), "USDC", plan).rejection_reason, "unsupported_chain");
  });

  it("rejects a candidate without contract address", () => {
    const result = resolveEstablishedCandidatePair(pair({ baseToken: { symbol: "EST", name: "Established" } }), "USDC", plan);
    assert.equal(result.rejection_reason, "candidate_identity_missing");
    assert.ok(result.missing_fields.includes("candidate_contract_address"));
  });

  it("reports missing required market data", () => {
    const result = resolveEstablishedCandidatePair(pair({ liquidity: undefined, marketCap: undefined, fdv: undefined }), "USDC", plan);
    assert.equal(result.rejection_reason, "missing_market_data");
    assert.ok(result.missing_fields.includes("liquidity_usd"));
    assert.ok(result.missing_fields.includes("market_cap_or_fdv"));
  });
});

describe("established basket validation run", () => {
  it("blocks before fetch without ALLOW_LIVE_PROVIDER_CALLS", async () => {
    let calls = 0;
    await assert.rejects(() => runEstablishedDiscoveryPrototype({
      env: { ...ENV, ALLOW_LIVE_PROVIDER_CALLS: undefined },
      fetchImpl: async () => { calls += 1; return Response.json({ pairs: [] }); },
    }), /LIVE_CALLS_NOT_ALLOWED/);
    assert.equal(calls, 0);
  });

  it("blocks before fetch without both INTERNAL_BETA flags", async () => {
    let calls = 0;
    await assert.rejects(() => runEstablishedDiscoveryPrototype({
      env: { ...ENV, CRYPTO_EDGE_RUNTIME_MODE: "DEVELOPMENT_DEMO" },
      fetchImpl: async () => { calls += 1; return Response.json({ pairs: [] }); },
    }), /RUNTIME_MODE_INVALID/);
    assert.equal(calls, 0);
  });

  it("selects highest liquidity and deduplicates across queries while preserving matched queries", async () => {
    const result = await runWithResponses((query) => {
      if (query === "USDC") return [pair({ pairAddress: "low", liquidity: { usd: 40_000 } })];
      if (query === "USDT") return [pair({ pairAddress: "high", quoteToken: { address: "usdt", symbol: "USDT" }, liquidity: { usd: 80_000 } })];
      return [];
    });
    assert.equal(result.summary.unique_candidates, 1);
    assert.equal(result.summary.duplicates_removed, 1);
    assert.equal(result.candidates[0]?.pair_address, "high");
    assert.deepEqual(result.candidates[0]?.matched_queries, ["USDC", "USDT"]);
    assert.deepEqual(result.summary.candidates_found_by_multiple_queries[0]?.queries, ["USDC", "USDT"]);
  });

  it("normalizes the candidate opposite the quote-side anchor and keeps baseline unchanged", async () => {
    const result = await runWithResponses((query) => query === "USDC" ? [pair()] : []);
    assert.equal(result.candidates[0]?.symbol, "EST");
    assert.equal(result.candidates[0]?.contract_address, "0xest");
    assert.equal(result.candidates[0]?.baseline_status, "passed_basic_filter");
    assert.deepEqual(BASIC_FILTERS, {
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
      sweetSpotMaxVolumeMarketCapRatio: 0.3,
    });
    assert.equal(result.baseline_profile.profile_id, "dexscreener_basic_filters_v1");
    assert.equal(result.baseline_profile.changed, false);
  });

  it("reports per-query counts and all zero-call/no-publish invariants", async () => {
    const result = await runWithResponses((query) => query === "USDC" ? [
      pair(),
      pair({ pairAddress: "noise", quoteToken: { address: "x", symbol: "USDCX" } }),
      pair({ pairAddress: "unsupported", chainId: "robinhood" }),
    ] : []);
    const usdc = result.per_query[0];
    assert.equal(usdc?.raw_pairs_returned, 3);
    assert.equal(usdc?.exact_anchor_matches, 1);
    assert.equal(usdc?.anchor_not_matched, 1);
    assert.equal(usdc?.unsupported_chain, 1);
    assert.equal(usdc?.candidates_normalized, 1);
    assert.equal(usdc?.candidates_passing_baseline, 1);
    assert.equal(result.security_calls_performed, 0);
    assert.equal(result.context_calls_performed, 0);
    assert.equal(result.raw_payloads_stored, false);
    assert.equal(result.production_snapshot_published, false);
    assert.equal(result.atomic_publish_performed, false);
    assert.equal(JSON.stringify(result).includes("provider_private_field"), false);
  });

  it("enforces five-query request budget, timeout, concurrency and one retry maximum", async () => {
    const attempts = new Map<string, number>();
    const result = await runEstablishedDiscoveryPrototype({
      env: ENV,
      now: NOW,
      timeoutMs: 10_000,
      concurrency: 99,
      fetchImpl: async (input) => {
        const query = new URL(String(input)).searchParams.get("q") ?? "";
        const attempt = (attempts.get(query) ?? 0) + 1;
        attempts.set(query, attempt);
        if (query === "USDC") return new Response("temporary", { status: 500 });
        return Response.json({ pairs: [] });
      },
    });
    assert.equal(result.limits.request_budget, 10);
    assert.equal(result.limits.timeout_ms, 10_000);
    assert.equal(result.limits.concurrency, 3);
    assert.equal(result.limits.max_retries_per_request, 1);
    assert.equal(attempts.get("USDC"), 2);
    assert.equal(result.per_query[0]?.retry_count, 1);
    assert.equal(result.per_query[0]?.failure_count, 1);
    assert.equal(result.summary.request_count, 6);
  });
});

describe("established result classification", () => {
  it("classifies GO deterministically", () => {
    assert.equal(classifyEstablishedDiscoveryResult(classificationInput()).status, "GO_TO_ADDRESS_BACKED_INTEGRATION");
  });

  it("classifies REFINE deterministically", () => {
    assert.equal(classifyEstablishedDiscoveryResult(classificationInput({ unsupported_chains: 1 })).status, "REFINE_QUERY_PLAN");
  });

  it("classifies NO-GO deterministically", () => {
    assert.equal(classifyEstablishedDiscoveryResult(classificationInput({ baseline_passes: 0 })).status, "NO_GO_QUERY_PLAN");
  });
});

function clonePlan(): EstablishedDiscoveryQueryPlan {
  return structuredClone(loadEstablishedDiscoveryQueryPlan());
}

async function runWithResponses(resolver: (query: string) => DexScreenerPair[]) {
  return runEstablishedDiscoveryPrototype({
    env: ENV,
    now: NOW,
    fetchImpl: async (input) => {
      const query = new URL(String(input)).searchParams.get("q") ?? "";
      return Response.json({ pairs: resolver(query), provider_private_field: "must-not-appear" });
    },
  });
}

function pair(overrides: Partial<DexScreenerPair> = {}): DexScreenerPair {
  return {
    chainId: "base",
    dexId: "uniswap",
    url: "https://dexscreener.com/base/pair-1",
    pairAddress: "pair-1",
    baseToken: { address: "0xest", symbol: "EST", name: "Established" },
    quoteToken: { address: "usdc", symbol: "USDC", name: "USD Coin" },
    priceUsd: "1",
    marketCap: 1_000_000,
    fdv: 1_000_000,
    liquidity: { usd: 50_000 },
    volume: { h24: 100_000 },
    pairCreatedAt: Date.parse("2026-06-01T12:00:00.000Z"),
    ...overrides,
  };
}

function classificationInput(overrides: Partial<Parameters<typeof classifyEstablishedDiscoveryResult>[0]> = {}) {
  return {
    baseline_passes: 2,
    unique_candidates: 4,
    raw_pairs: 10,
    exact_anchor_matches: 8,
    anchor_not_matched: 1,
    unsupported_chains: 0,
    missing_market_data: 0,
    failure_count: 0,
    candidates_older_than_7_days: 4,
    anchor_became_candidate_count: 0,
    critical_orientation_or_deduplication_errors: 0,
    max_query_concentration: 0.5,
    ...overrides,
  };
}
