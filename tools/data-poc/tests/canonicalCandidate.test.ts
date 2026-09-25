import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalizeLegacyCandidate,
  CRYPTO_EDGE_CANDIDATE_OBSERVATION_SCHEMA_VERSION,
} from "../src/discovery/canonicalCandidate.js";
import type { CryptoEdgeCandidate } from "../src/types.js";

const OBSERVED_AT = "2026-09-25T09:30:00.000Z";

describe("canonicalizeLegacyCandidate", () => {
  it("maps a standard legacy candidate into the source-neutral identity, display, pair, and market contract", () => {
    const observation = canonicalizeLegacyCandidate(legacyCandidate(), OBSERVED_AT);

    assert.deepEqual(observation.identity, { chain: "base", contract_or_mint: "0xAbC123Def456" });
    assert.deepEqual(observation.display, { symbol: "EDGE", name: "Crypto Edge" });
    assert.deepEqual(observation.pair, { pair_address: "0xPaIr987", dex: "uniswap" });
    assert.deepEqual(observation.market, {
      price_usd: 0.42,
      market_cap_usd: 4_200_000,
      fdv_usd: 5_000_000,
      liquidity_usd: 250_000,
      volume_24h_usd: 840_000,
      volume_market_cap_ratio: 0.2,
      pair_created_at: "2026-09-01T00:00:00.000Z",
      pair_age_days: 24,
    });
  });

  it("records DEXScreener as legacy-provider provenance", () => {
    const observation = canonicalizeLegacyCandidate(legacyCandidate(), OBSERVED_AT);

    assert.equal(observation.provider_references[0]?.provider_id, "dexscreener");
    assert.equal(observation.provider_references[0]?.provider_candidate_id, null);
  });

  it("preserves source URL only in provider provenance", () => {
    const sourceUrl = "https://dexscreener.com/base/edge";
    const observation = canonicalizeLegacyCandidate(legacyCandidate({ source_url: sourceUrl }), OBSERVED_AT);

    assert.equal(observation.provider_references[0]?.source_url, sourceUrl);
    assert.equal("source_url" in observation, false);
  });

  it("places discovery method only in provider provenance", () => {
    const observation = canonicalizeLegacyCandidate(legacyCandidate({ discovery_method: "dexscreener_latest_token_profiles" }), OBSERVED_AT);

    assert.equal(observation.provider_references[0]?.discovery_method, "dexscreener_latest_token_profiles");
    assert.equal("discovery_method" in observation, false);
  });

  it("preserves null when a candidate has no DEX pair reference", () => {
    const observation = canonicalizeLegacyCandidate(legacyCandidate({ pair_address: null, dex: null }), OBSERVED_AT);

    assert.equal(observation.pair, null);
  });

  it("excludes legacy filter and lifecycle state", () => {
    const observation = canonicalizeLegacyCandidate(legacyCandidate({
      status: "rejected_basic_filter",
      filter_reasons: ["liquidity_too_low"],
      discovery_basket: "new_emerging",
      observation_only: true,
      established_eligible: true,
      universe_version: "v1",
      universe_entry_index: 2,
      address_identity_verified: true,
    }), OBSERVED_AT);

    for (const field of [
      "status",
      "filter_reasons",
      "basic_filter_status",
      "final_label",
      "final_reasons",
      "security",
      "discovery_basket",
      "observation_only",
      "established_eligible",
      "universe_version",
      "universe_entry_index",
      "address_identity_verified",
    ]) {
      assert.equal(field in observation, false, field);
      assert.equal(JSON.stringify(observation).includes(`\"${field}\"`), false, field);
    }
  });

  it("does not mutate the legacy input", () => {
    const candidate = legacyCandidate();
    const before = structuredClone(candidate);

    canonicalizeLegacyCandidate(candidate, OBSERVED_AT);

    assert.deepEqual(candidate, before);
  });

  it("preserves nullable market fields exactly", () => {
    const observation = canonicalizeLegacyCandidate(legacyCandidate({
      price_usd: null,
      market_cap_usd: null,
      fdv_usd: null,
      liquidity_usd: null,
      volume_24h_usd: null,
      volume_market_cap_ratio: null,
      pair_created_at: null,
      pair_age_days: null,
    }), OBSERVED_AT);

    assert.deepEqual(observation.market, {
      price_usd: null,
      market_cap_usd: null,
      fdv_usd: null,
      liquidity_usd: null,
      volume_24h_usd: null,
      volume_market_cap_ratio: null,
      pair_created_at: null,
      pair_age_days: null,
    });
  });

  it("preserves the quote-token valuation null regression", () => {
    const observation = canonicalizeLegacyCandidate(legacyCandidate({
      price_usd: null,
      market_cap_usd: null,
      fdv_usd: null,
    }), OBSERVED_AT);

    assert.equal(observation.market.price_usd, null);
    assert.equal(observation.market.market_cap_usd, null);
    assert.equal(observation.market.fdv_usd, null);
  });

  it("preserves mixed-case EVM addresses without generic lowercasing", () => {
    const address = "0xAbCdEf0123456789aBCdEf0123456789AbCdEf01";
    const observation = canonicalizeLegacyCandidate(legacyCandidate({ chain: "base", contract_address: address }), OBSERVED_AT);

    assert.equal(observation.identity.contract_or_mint, address);
  });

  it("preserves mixed-case Solana mints without generic lowercasing", () => {
    const mint = "SoLAnAMintAbCdEfGhijkLmNoPqRsTuVwXyZ123456";
    const observation = canonicalizeLegacyCandidate(legacyCandidate({ chain: "solana", contract_address: mint }), OBSERVED_AT);

    assert.equal(observation.identity.contract_or_mint, mint);
  });

  it("preserves normalized social links", () => {
    const socialLinks = [
      { category: "twitter" as const, url: "https://x.com/cryptoedge" },
      { category: "website" as const, url: "https://cryptoedge.example/" },
    ];
    const observation = canonicalizeLegacyCandidate(legacyCandidate({ social_links: socialLinks }), OBSERVED_AT);

    assert.deepEqual(observation.social_links, socialLinks);
  });

  it("copies social links so canonical-output mutation cannot alter the legacy candidate", () => {
    const candidate = legacyCandidate({
      social_links: [{ category: "website", url: "https://cryptoedge.example/" }],
    });
    const legacySocialLinks = candidate.social_links;
    const before = structuredClone(legacySocialLinks);
    const observation = canonicalizeLegacyCandidate(candidate, OBSERVED_AT);
    const canonicalFirstLink = observation.social_links[0];
    const legacyFirstLink = legacySocialLinks?.[0];

    assert.deepEqual(observation.social_links, legacySocialLinks);
    assert.notEqual(observation.social_links, legacySocialLinks);
    assert.ok(canonicalFirstLink);
    assert.ok(legacyFirstLink);
    assert.notEqual(canonicalFirstLink, legacyFirstLink);

    observation.social_links.push({ category: "twitter", url: "https://x.com/cryptoedge" });
    canonicalFirstLink.url = "https://cryptoedge.example/changed";

    assert.deepEqual(candidate.social_links, before);
  });

  it("preserves the supplied observation timestamp exactly", () => {
    const observedAt = "2025-01-02T03:04:05.678Z";
    const observation = canonicalizeLegacyCandidate(legacyCandidate(), observedAt);

    assert.equal(observation.observed_at, observedAt);
    assert.equal(observation.provider_references[0]?.observed_at, observedAt);
    assert.equal(observation.discovered_at, null);
  });

  it("does not fabricate confidence", () => {
    assert.equal(canonicalizeLegacyCandidate(legacyCandidate(), OBSERVED_AT).confidence, null);
  });

  it("is deterministic for the same input and observation timestamp", () => {
    const candidate = legacyCandidate();

    assert.deepEqual(
      canonicalizeLegacyCandidate(candidate, OBSERVED_AT),
      canonicalizeLegacyCandidate(candidate, OBSERVED_AT),
    );
  });

  it("uses the explicit canonical schema version", () => {
    assert.equal(
      canonicalizeLegacyCandidate(legacyCandidate(), OBSERVED_AT).schema_version,
      CRYPTO_EDGE_CANDIDATE_OBSERVATION_SCHEMA_VERSION,
    );
  });
});

function legacyCandidate(overrides: Partial<CryptoEdgeCandidate> = {}): CryptoEdgeCandidate {
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
    pair_age_days: 24,
    status: "passed_basic_filter",
    filter_reasons: [],
    ...overrides,
  };
}
