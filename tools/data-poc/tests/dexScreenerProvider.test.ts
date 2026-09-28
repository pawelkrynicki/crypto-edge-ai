import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BoundedHttpClient } from "../src/boundedHttpClient.js";
import {
  adaptDexScreenerDiscoveryResult,
  createDexScreenerProvider,
  DEXSCREENER_PROVIDER_ID,
  type DexScreenerCollect,
} from "../src/discovery/dexScreenerProvider.js";
import {
  CRYPTO_EDGE_PROVIDER_DISCOVERY_BATCH_SCHEMA_VERSION,
  DISCOVERY_PROVIDER_OBSERVED_AT_INVALID,
  parseDiscoveryObservedAt,
} from "../src/discovery/discoveryProvider.js";
import type { DexScreenerDiscoveryResult } from "../src/dexscreenerDiscovery.js";
import type { CryptoEdgeCandidate } from "../src/types.js";

const OBSERVED_AT = "2026-09-28T10:15:30.000Z";

describe("DEXScreener discovery provider facade", () => {
  it("uses the exact DEXScreener provider id and generic batch schema", async () => {
    const provider = createFakeProvider(async () => discoveryResult());
    const batch = await provider.discover({ environment: "INTERNAL_BETA", observed_at: OBSERVED_AT });

    assert.equal(provider.id, DEXSCREENER_PROVIDER_ID);
    assert.equal(batch.provider_id, "dexscreener");
    assert.equal(batch.schema_version, CRYPTO_EDGE_PROVIDER_DISCOVERY_BATCH_SCHEMA_VERSION);
  });

  it("delegates once with the unchanged environment, configured seed limit, and request observation instant", async () => {
    let calls = 0;
    let receivedEnvironment: string | undefined;
    let receivedSeedLimit: number | undefined;
    let receivedNow: Date | undefined;
    const provider = createFakeProvider(async (options) => {
      calls += 1;
      receivedEnvironment = options.environment;
      receivedSeedLimit = options.seedLimit;
      receivedNow = options.now;
      return discoveryResult();
    }, 7);

    await provider.discover({ environment: "CUSTOM_ENVIRONMENT", observed_at: OBSERVED_AT });

    assert.equal(calls, 1);
    assert.equal(receivedEnvironment, "CUSTOM_ENVIRONMENT");
    assert.equal(receivedSeedLimit, 7);
    assert.ok(receivedNow instanceof Date);
    assert.equal(receivedNow.toISOString(), OBSERVED_AT);
  });

  it("maps deterministic legacy results into canonical candidates with one consistent observed time", async () => {
    const provider = createFakeProvider(async () => discoveryResult());
    const batch = await provider.discover({ environment: "INTERNAL_BETA", observed_at: OBSERVED_AT });

    assert.equal(batch.observed_at, OBSERVED_AT);
    assert.equal(batch.candidates.length, 1);
    assert.equal(batch.candidates[0]?.schema_version, "crypto_edge_candidate_observation_v1");
    assert.equal(batch.candidates[0]?.observed_at, OBSERVED_AT);
    assert.equal(batch.candidates[0]?.provider_references[0]?.provider_id, "dexscreener");
    assert.equal(batch.candidates[0]?.provider_references[0]?.observed_at, OBSERVED_AT);
  });

  it("excludes lifecycle and filter fields from canonical batch candidates", () => {
    const batch = adaptDexScreenerDiscoveryResult(discoveryResult(), OBSERVED_AT);
    const candidate = batch.candidates[0];

    assert.ok(candidate);
    for (const field of [
      "status",
      "filter_reasons",
      "discovery_basket",
      "observation_only",
      "established_eligible",
      "universe_version",
      "universe_entry_index",
      "address_identity_verified",
    ]) {
      assert.equal(field in candidate, false, field);
    }
  });

  it("maps READY diagnostics without fabricating provider health data", () => {
    const batch = adaptDexScreenerDiscoveryResult(discoveryResult(), OBSERVED_AT);

    assert.deepEqual(batch.diagnostics, {
      status: "READY",
      records_received: 3,
      records_emitted: 1,
      reason_codes: [],
    });
  });

  it("maps DEGRADED diagnostics with sorted unique safe reason codes", () => {
    const result = discoveryResult({
      discovery_status: "DEGRADED",
      failure_reason_counts: { TIMEOUT: 2, HTTP_429: 1 },
    });
    const batch = adaptDexScreenerDiscoveryResult(result, OBSERVED_AT);

    assert.deepEqual(batch.diagnostics, {
      status: "DEGRADED",
      records_received: 3,
      records_emitted: 1,
      reason_codes: ["HTTP_429", "TIMEOUT"],
    });
  });

  it("fails closed for malformed observation timestamps", async () => {
    let calls = 0;
    const provider = createFakeProvider(async () => {
      calls += 1;
      return discoveryResult();
    });

    await assert.rejects(
      () => provider.discover({ environment: "INTERNAL_BETA", observed_at: "not-a-timestamp" }),
      (error: unknown) => error instanceof Error && error.message === DISCOVERY_PROVIDER_OBSERVED_AT_INVALID,
    );
    assert.equal(calls, 0);
  });

  it("rejects impossible calendar dates", () => {
    assertInvalidObservedAt("2026-02-31T10:00:00Z");
    assertInvalidObservedAt("2026-04-31T10:00:00Z");
  });

  it("rejects invalid month, day, and time values", () => {
    for (const observedAt of [
      "2026-13-01T10:00:00Z",
      "2026-00-10T10:00:00Z",
      "2026-09-00T10:00:00Z",
      "2026-09-28T25:00:00Z",
      "2026-09-28T10:61:00Z",
    ]) {
      assertInvalidObservedAt(observedAt);
    }
  });

  it("rejects invalid timezone offsets", () => {
    assertInvalidObservedAt("2026-09-28T10:00:00+24:00");
    assertInvalidObservedAt("2026-09-28T10:00:00+12:99");
  });

  it("accepts the maximum positive ISO timezone offset", () => {
    assert.equal(parseDiscoveryObservedAt("2026-09-28T10:00:00+14:00").toISOString(), "2026-09-27T20:00:00.000Z");
  });

  it("accepts the maximum negative ISO timezone offset", () => {
    assert.equal(parseDiscoveryObservedAt("2026-09-28T10:00:00-14:00").toISOString(), "2026-09-29T00:00:00.000Z");
  });

  it("rejects positive offsets beyond the maximum boundary", () => {
    assertInvalidObservedAt("2026-09-28T10:00:00+14:01");
  });

  it("rejects negative offsets beyond the maximum boundary", () => {
    assertInvalidObservedAt("2026-09-28T10:00:00-14:30");
  });

  it("rejects offsets that exceed the ISO maximum", () => {
    assertInvalidObservedAt("2026-09-28T10:00:00+23:59");
  });

  it("continues to accept normal numeric timezone offsets", () => {
    assert.equal(parseDiscoveryObservedAt("2026-09-28T10:15:30+02:00").toISOString(), "2026-09-28T08:15:30.000Z");
  });

  it("accepts leap-day timestamps only in leap years", () => {
    assert.equal(parseDiscoveryObservedAt("2028-02-29T10:00:00Z").toISOString(), "2028-02-29T10:00:00.000Z");
    assertInvalidObservedAt("2027-02-29T10:00:00Z");
  });

  it("accepts a valid UTC timestamp", () => {
    assert.equal(parseDiscoveryObservedAt(OBSERVED_AT).toISOString(), OBSERVED_AT);
  });

  it("preserves valid offset timestamps while passing their UTC instant to the legacy collector", async () => {
    const observedAt = "2026-09-28T10:15:30+02:00";
    let receivedNow: Date | undefined;
    const provider = createFakeProvider(async (options) => {
      receivedNow = options.now;
      return discoveryResult();
    });

    const batch = await provider.discover({ environment: "INTERNAL_BETA", observed_at: observedAt });

    assert.equal(receivedNow?.toISOString(), "2026-09-28T08:15:30.000Z");
    assert.equal(batch.observed_at, observedAt);
    assert.equal(batch.candidates[0]?.observed_at, observedAt);
    assert.equal(batch.candidates[0]?.provider_references[0]?.observed_at, observedAt);
  });

  it("propagates collector failures instead of returning a fake READY batch", async () => {
    const expected = new Error("DEXSCREENER_DISCOVERY_INSUFFICIENT_COVERAGE");
    const provider = createFakeProvider(async () => { throw expected; });

    await assert.rejects(
      () => provider.discover({ environment: "INTERNAL_BETA", observed_at: OBSERVED_AT }),
      (error: unknown) => error === expected,
    );
  });

  it("does not call the network when a fake collector is injected", async () => {
    let networkCalls = 0;
    const client = new BoundedHttpClient({
      sourceId: "test",
      maxRequests: 1,
      fetchImpl: async () => {
        networkCalls += 1;
        throw new Error("network must not be called");
      },
    });
    const provider = createDexScreenerProvider({ client, collect: async () => discoveryResult() });

    await provider.discover({ environment: "INTERNAL_BETA", observed_at: OBSERVED_AT });

    assert.equal(networkCalls, 0);
  });

  it("does not mutate the legacy discovery result or share its candidate container", () => {
    const result = discoveryResult();
    const before = structuredClone(result);
    const batch = adaptDexScreenerDiscoveryResult(result, OBSERVED_AT);

    assert.notEqual(batch.candidates, result.candidates);
    batch.candidates.push(batch.candidates[0]!);
    batch.candidates[0]!.social_links[0]!.url = "https://cryptoedge.example/changed";

    assert.deepEqual(result, before);
  });
});

function createFakeProvider(collect: DexScreenerCollect, seedLimit?: number) {
  return createDexScreenerProvider({
    client: new BoundedHttpClient({
      sourceId: "test",
      maxRequests: 1,
      fetchImpl: async () => { throw new Error("network must not be called"); },
    }),
    seedLimit,
    collect,
  });
}

function assertInvalidObservedAt(observedAt: string): void {
  assert.throws(
    () => parseDiscoveryObservedAt(observedAt),
    (error: unknown) => error instanceof Error && error.message === DISCOVERY_PROVIDER_OBSERVED_AT_INVALID,
  );
}

function discoveryResult(metadataOverrides: Partial<DexScreenerDiscoveryResult["metadata"]> = {}): DexScreenerDiscoveryResult {
  return {
    candidates: [legacyCandidate()],
    metadata: {
      discovery_method: "dexscreener_latest_token_profiles",
      seed_count: 3,
      pair_requests_succeeded: 3,
      pair_requests_failed: 0,
      pairs_loaded: 3,
      candidates_before_filters: 1,
      candidates_after_filters: 1,
      discovery_status: "READY",
      failure_reason_counts: {},
      ...metadataOverrides,
    },
  };
}

function legacyCandidate(): CryptoEdgeCandidate {
  return {
    symbol: "EDGE",
    name: "Crypto Edge",
    chain: "base",
    contract_address: "0xAbC123Def456",
    pair_address: "0xPaIr987",
    dex: "uniswap",
    source: "dexscreener",
    source_url: "https://dexscreener.com/base/edge",
    social_links: [{ category: "website", url: "https://cryptoedge.example/" }],
    price_usd: 0.42,
    market_cap_usd: 4_200_000,
    fdv_usd: 5_000_000,
    liquidity_usd: 250_000,
    volume_24h_usd: 840_000,
    volume_market_cap_ratio: 0.2,
    pair_created_at: "2026-09-01T00:00:00.000Z",
    pair_age_days: 27,
    status: "passed_basic_filter",
    filter_reasons: [],
    discovery_basket: "new_emerging",
    discovery_method: "dexscreener_latest_token_profiles",
    observation_only: true,
    established_eligible: false,
    universe_version: null,
    universe_entry_index: null,
    address_identity_verified: false,
  };
}
