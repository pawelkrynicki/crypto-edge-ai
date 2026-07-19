import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { BoundedHttpClient } from "../src/boundedHttpClient.js";
import { collectDexScreenerDiscovery } from "../src/dexscreenerDiscovery.js";
import {
  collectEstablishedAddressUniverse,
  deduplicateEstablishedPairs,
  type SelectedEstablishedPair,
} from "../src/establishedAddressDiscovery.js";
import {
  loadEstablishedAddressUniverse,
  validateEstablishedAddressUniverse,
  type EstablishedAddressUniverse,
  type EstablishedAddressUniverseEntry,
} from "../src/establishedAddressUniverse.js";
import { BASIC_FILTERS } from "../src/filters.js";
import type { DexScreenerPair } from "../src/types.js";

const NOW = new Date("2026-07-19T12:00:00.000Z");
const EVM_ADDRESS = "0x1111111111111111111111111111111111111111";
const SECOND_EVM_ADDRESS = "0x2222222222222222222222222222222222222222";
const SOLANA_ADDRESS = "So11111111111111111111111111111111111111112";
const ENV = {
  CRYPTO_EDGE_DATA_ENV: "INTERNAL_BETA",
  CRYPTO_EDGE_RUNTIME_MODE: "INTERNAL_BETA",
  ALLOW_LIVE_PROVIDER_CALLS: "1",
};

describe("established address universe validation", () => {
  it("accepts the canonical empty universe", () => {
    const universe = loadEstablishedAddressUniverse();
    assert.equal(universe.entries.length, 0);
    assert.equal(universe.production_enabled, true);
  });

  it("fails closed for an unknown version", () => {
    assert.throws(
      () => validateEstablishedAddressUniverse({ ...emptyUniverse(), universe_version: "future" }),
      /ESTABLISHED_UNIVERSE_VERSION_UNSUPPORTED/,
    );
  });

  it("fails closed above 100 entries", () => {
    const entries = Array.from({ length: 101 }, (_, index) => entry({
      contract_address: `0x${(index + 1).toString(16).padStart(40, "0")}`,
    }));
    assert.throws(
      () => validateEstablishedAddressUniverse({ ...emptyUniverse(), entries }),
      /ESTABLISHED_UNIVERSE_TOO_MANY_ENTRIES/,
    );
  });

  it("fails closed for duplicate chain and address", () => {
    assert.throws(
      () => validateEstablishedAddressUniverse({
        ...emptyUniverse(),
        entries: [entry(), entry({ contract_address: EVM_ADDRESS.toUpperCase().replace("0X", "0x") })],
      }),
      /ESTABLISHED_UNIVERSE_DUPLICATE_IDENTITY/,
    );
  });

  it("rejects invalid EVM and Solana addresses", () => {
    assert.throws(
      () => validateEstablishedAddressUniverse({ ...emptyUniverse(), entries: [entry({ contract_address: "0x123" })] }),
      /ESTABLISHED_UNIVERSE_EVM_ADDRESS_INVALID/,
    );
    assert.throws(
      () => validateEstablishedAddressUniverse({
        ...emptyUniverse(),
        entries: [entry({ chain: "solana", contract_address: "not-a-solana-address" })],
      }),
      /ESTABLISHED_UNIVERSE_SOLANA_ADDRESS_INVALID/,
    );
    assert.equal(validateEstablishedAddressUniverse({
      ...emptyUniverse(),
      entries: [entry({ chain: "solana", contract_address: SOLANA_ADDRESS })],
    }).entries.length, 1);
  });

  it("denies robinhood, unknown chains and secret-shaped unknown fields", () => {
    assert.throws(
      () => validateEstablishedAddressUniverse({ ...emptyUniverse(), entries: [entry({ chain: "robinhood" as "base" })] }),
      /ESTABLISHED_UNIVERSE_ROBINHOOD_DENIED/,
    );
    assert.throws(
      () => validateEstablishedAddressUniverse({ ...emptyUniverse(), entries: [entry({ chain: "unknown" as "base" })] }),
      /ESTABLISHED_UNIVERSE_CHAIN_UNSUPPORTED/,
    );
    assert.throws(
      () => validateEstablishedAddressUniverse({ ...emptyUniverse(), api_key: "secret" }),
      /ESTABLISHED_UNIVERSE_CONFIG_UNKNOWN_FIELD/,
    );
  });
});

describe("address-backed established collector", () => {
  it("does not fetch disabled entries and returns the explicit empty state", async () => {
    let calls = 0;
    const result = await collectEstablishedAddressUniverse({
      env: ENV,
      universe: { ...emptyUniverse(), entries: [entry({ enabled: false })] },
      fetchImpl: async () => { calls += 1; return Response.json([]); },
    });
    assert.equal(calls, 0);
    assert.deepEqual(result.candidates, []);
    assert.equal(result.metadata.universe_status, "ESTABLISHED_UNIVERSE_EMPTY");
  });

  it("exits before fetch without live consent or either INTERNAL_BETA flag", async () => {
    for (const env of [
      { ...ENV, ALLOW_LIVE_PROVIDER_CALLS: undefined },
      { ...ENV, CRYPTO_EDGE_DATA_ENV: "LOCAL_POC" },
      { ...ENV, CRYPTO_EDGE_RUNTIME_MODE: "DEVELOPMENT_DEMO" },
    ]) {
      let calls = 0;
      await assert.rejects(() => collectEstablishedAddressUniverse({
        env,
        universe: universeWithEntry(),
        fetchImpl: async () => { calls += 1; return Response.json([]); },
      }));
      assert.equal(calls, 0);
    }
  });

  it("supports configured tokens on the base and quote side", async () => {
    const baseResult = await collectWithPairs([pair()]);
    assert.equal(baseResult.candidates[0]?.contract_address, EVM_ADDRESS);
    assert.equal(baseResult.candidates[0]?.symbol, "CONFIGURED");
    assert.equal(baseResult.metadata.base_token_candidates, 1);

    const quoteResult = await collectWithPairs([pair({
      baseToken: { address: SECOND_EVM_ADDRESS, symbol: "OTHER", name: "Other" },
      quoteToken: { address: EVM_ADDRESS, symbol: "CONFIGURED", name: "Configured" },
    })]);
    assert.equal(quoteResult.candidates[0]?.contract_address, EVM_ADDRESS);
    assert.equal(quoteResult.candidates[0]?.symbol, "CONFIGURED");
    assert.equal(quoteResult.candidates[0]?.market_cap_usd, null);
    assert.equal(quoteResult.metadata.quote_token_candidates, 1);
  });

  it("uses the exact configured address instead of symbols", async () => {
    const result = await collectWithPairs([pair({
      baseToken: { address: SECOND_EVM_ADDRESS, symbol: "CONFIGURED", name: "Spoof" },
      quoteToken: { address: EVM_ADDRESS, symbol: "HONEST", name: "Address-backed" },
    })]);
    assert.equal(result.candidates[0]?.symbol, "HONEST");
    assert.equal(result.candidates[0]?.name, "Address-backed");
    assert.equal(result.candidates[0]?.contract_address, EVM_ADDRESS);
  });

  it("fails closed when the configured address is absent from the provider response", async () => {
    await assert.rejects(
      () => collectWithPairs([pair({ baseToken: { address: SECOND_EVM_ADDRESS, symbol: "CONFIGURED" } })]),
      /ESTABLISHED_ADDRESS_NOT_FOUND_IN_PROVIDER_RESPONSE/,
    );
  });

  it("selects the highest-liquidity valid pair", async () => {
    const result = await collectWithPairs([
      pair({ pairAddress: "low", url: "https://dexscreener.com/base/low", liquidity: { usd: 40_000 } }),
      pair({ pairAddress: "high", url: "https://dexscreener.com/base/high", liquidity: { usd: 90_000 } }),
    ]);
    assert.equal(result.candidates[0]?.pair_address, "high");
    assert.equal(result.candidates[0]?.liquidity_usd, 90_000);
  });

  it("deduplicates by chain, configured address and pair address", () => {
    const configured = entry();
    const record: SelectedEstablishedPair = { entry: configured, universe_entry_index: 0, pair: pair() };
    assert.equal(deduplicateEstablishedPairs([record, structuredClone(record)]).length, 1);
  });

  it("keeps baseline filters unchanged and emits required established metadata", async () => {
    const result = await collectWithPairs([pair()]);
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
    assert.deepEqual({
      discovery_basket: result.candidates[0]?.discovery_basket,
      discovery_method: result.candidates[0]?.discovery_method,
      observation_only: result.candidates[0]?.observation_only,
      universe_version: result.candidates[0]?.universe_version,
      universe_entry_index: result.candidates[0]?.universe_entry_index,
      address_identity_verified: result.candidates[0]?.address_identity_verified,
    }, {
      discovery_basket: "established",
      discovery_method: "address_seeded_universe",
      observation_only: false,
      universe_version: "established_address_universe_v1",
      universe_entry_index: 0,
      address_identity_verified: true,
    });
  });
});

describe("new/emerging separation and archived query plan", () => {
  it("marks latest profiles observation-only and never established-eligible", async () => {
    const client = new BoundedHttpClient({
      sourceId: "dexscreener",
      maxRequests: 2,
      fetchImpl: async (input) => String(input).includes("token-profiles")
        ? Response.json([{ chainId: "base", tokenAddress: EVM_ADDRESS }])
        : Response.json([pair()]),
    });
    const result = await collectDexScreenerDiscovery({ environment: "INTERNAL_BETA", seedLimit: 1, now: NOW, client });
    assert.equal(result.candidates[0]?.discovery_basket, "new_emerging");
    assert.equal(result.candidates[0]?.observation_only, true);
    assert.equal(result.candidates[0]?.established_eligible, false);
    assert.equal(result.candidates.some((candidate) => candidate.discovery_basket === "established"), false);
  });

  it("does not import the archived symbol query plan from the production collector", async () => {
    const collector = await readFile("src/internalBetaCollector.ts", "utf8");
    const packageJson = await readFile("package.json", "utf8");
    assert.equal(collector.includes("establishedDiscoveryQueryPlan"), false);
    assert.equal(packageJson.includes("discovery:established:validate"), false);
    assert.equal(packageJson.includes("discovery:archived-query-plan:diagnostic"), true);
  });
});

async function collectWithPairs(pairs: DexScreenerPair[]) {
  return collectEstablishedAddressUniverse({
    env: ENV,
    universe: universeWithEntry(),
    now: NOW,
    fetchImpl: async () => Response.json(pairs),
  });
}

function emptyUniverse(): EstablishedAddressUniverse {
  return {
    universe_version: "established_address_universe_v1",
    status: "OWNER_MAINTAINED",
    production_enabled: true,
    provider: "dexscreener",
    identity_method: "CHAIN_AND_CONTRACT_ADDRESS",
    max_entries: 100,
    entries: [],
  };
}

function universeWithEntry(): EstablishedAddressUniverse {
  return { ...emptyUniverse(), entries: [entry()] };
}

function entry(overrides: Partial<EstablishedAddressUniverseEntry> = {}): EstablishedAddressUniverseEntry {
  return {
    chain: "base",
    contract_address: EVM_ADDRESS,
    enabled: true,
    display_label: "Configured Token",
    added_at: "2026-07-19T00:00:00.000Z",
    added_by: "owner",
    notes: "test only",
    ...overrides,
  };
}

function pair(overrides: Partial<DexScreenerPair> = {}): DexScreenerPair {
  return {
    chainId: "base",
    dexId: "uniswap",
    url: "https://dexscreener.com/base/pair-1",
    pairAddress: "pair-1",
    baseToken: { address: EVM_ADDRESS, symbol: "CONFIGURED", name: "Configured" },
    quoteToken: { address: SECOND_EVM_ADDRESS, symbol: "QUOTE", name: "Quote" },
    priceUsd: "1",
    marketCap: 1_000_000,
    fdv: 1_000_000,
    liquidity: { usd: 50_000 },
    volume: { h24: 100_000 },
    pairCreatedAt: Date.parse("2026-06-01T12:00:00.000Z"),
    ...overrides,
  };
}
