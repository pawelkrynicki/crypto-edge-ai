import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CRYPTO_EDGE_CANDIDATE_OBSERVATION_SCHEMA_VERSION,
  type CanonicalCandidateObservation,
} from "../src/discovery/canonicalCandidate.js";
import {
  createSourceIntelligenceObservation,
  type SourceIntelligenceEvidenceItem,
  type SourceIntelligenceObservation,
  type SourceIntelligenceObservationInput,
} from "../src/intelligence/sourceIntelligence.js";
import {
  CRYPTO_EDGE_INVESTMENT_CHANGE_SET_SCHEMA_VERSION,
  type InvestmentChangeSet,
} from "../src/investment/investmentChangeDetection.js";
import {
  buildInvestmentV2ReadModel,
  CRYPTO_EDGE_INVESTMENT_V2_READ_MODEL_SCHEMA_VERSION,
  INVESTMENT_V2_CANDIDATE_INVALID,
  INVESTMENT_V2_CHANGE_SET_INVALID,
  INVESTMENT_V2_CHANGE_SET_MISMATCH,
  INVESTMENT_V2_DUPLICATE_CHANGE_SET,
  INVESTMENT_V2_DUPLICATE_SOURCE,
  INVESTMENT_V2_IDENTITY_MISMATCH,
  INVESTMENT_V2_ORPHAN_CHANGE_SET,
  INVESTMENT_V2_SOURCE_INVALID,
} from "../src/investment/investmentV2ReadModel.js";

const CANDIDATE_OBSERVED_AT = "2026-09-28T09:30:00.000Z";
const SOURCE_OBSERVED_AT = "2026-09-28T10:00:00.000Z";
const PREVIOUS_OBSERVED_AT = "2026-09-28T09:00:00.000Z";

describe("Investment V2 read model", () => {
  it("builds a valid factual read model", () => {
    const model = buildInvestmentV2ReadModel({
      candidate: candidate(),
      source_observations: [sourceObservation()],
      change_sets: [],
    });

    assert.equal(model.asset.display.symbol, "EDGE");
    assert.equal(model.sources.length, 1);
    assert.equal(model.sources[0]?.latest_change, null);
  });

  it("uses the explicit read-model schema version", () => {
    assert.equal(build().schema_version, CRYPTO_EDGE_INVESTMENT_V2_READ_MODEL_SCHEMA_VERSION);
  });

  it("preserves candidate identity exactly, including address casing", () => {
    const address = "0xAbCdEf0123456789aBCdEf0123456789AbCdEf01";
    const model = buildInvestmentV2ReadModel({
      candidate: candidate({ identity: { chain: "base", contract_or_mint: address } }),
      source_observations: [sourceObservation({ identity: { chain: "base", contract_or_mint: address } })],
      change_sets: [],
    });

    assert.deepEqual(model.asset.identity, { chain: "base", contract_or_mint: address });
  });

  it("preserves candidate display, pair, and market values", () => {
    const model = build();

    assert.deepEqual(model.asset.display, { symbol: "EDGE", name: "Crypto Edge" });
    assert.deepEqual(model.asset.pair, { pair_address: "0xPair456", dex: "uniswap" });
    assert.deepEqual(model.asset.market, candidate().market);
  });

  it("copies candidate social links", () => {
    const input = candidate();
    const model = buildInvestmentV2ReadModel({ candidate: input, source_observations: [], change_sets: [] });

    assert.deepEqual(model.asset.social_links, input.social_links);
    assert.notEqual(model.asset.social_links, input.social_links);
    assert.notEqual(model.asset.social_links[0], input.social_links[0]);
  });

  it("copies candidate provider references", () => {
    const input = candidate();
    const model = buildInvestmentV2ReadModel({ candidate: input, source_observations: [], change_sets: [] });

    assert.deepEqual(model.asset.provider_references, input.provider_references);
    assert.notEqual(model.asset.provider_references, input.provider_references);
    assert.notEqual(model.asset.provider_references[0], input.provider_references[0]);
  });

  it("projects current source intelligence and source provenance", () => {
    const observation = sourceObservation({ reason_codes: ["TIMEOUT"], status: "DEGRADED" });
    const model = buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [observation], change_sets: [] });

    assert.deepEqual(model.sources[0]?.source, observation.source);
    assert.equal(model.sources[0]?.observed_at, SOURCE_OBSERVED_AT);
    assert.equal(model.sources[0]?.status, "DEGRADED");
    assert.deepEqual(model.sources[0]?.reason_codes, ["TIMEOUT"]);
  });

  it("groups evidence by canonical domain order while preserving item order", () => {
    const model = buildInvestmentV2ReadModel({
      candidate: candidate(),
      source_observations: [sourceObservation({ evidence: [
        evidenceItem({ domain: "market", key: "market.price", value: 42 }),
        evidenceItem({ domain: "security", key: "security.verified", value: true }),
        evidenceItem({ domain: "security", key: "security.proxy", value: false }),
      ] })],
      change_sets: [],
    });

    assert.deepEqual(model.sources[0]?.evidence_groups.map((group) => group.domain), ["security", "market"]);
    assert.deepEqual(model.sources[0]?.evidence_groups[0]?.items.map((item) => item.key), ["security.verified", "security.proxy"]);
  });

  it("preserves duplicate evidence keys", () => {
    const model = buildInvestmentV2ReadModel({
      candidate: candidate(),
      source_observations: [sourceObservation({ evidence: [
        evidenceItem({ domain: "holders", key: "holders.top_10_pct", value: 25, source_reference: "holder-api" }),
        evidenceItem({ domain: "holders", key: "holders.top_10_pct", value: 30, source_reference: "indexer" }),
      ] })],
      change_sets: [],
    });

    assert.deepEqual(model.sources[0]?.evidence_groups[0]?.items.map((item) => item.value), [25, 30]);
  });

  it("preserves multiple source views without merging their evidence", () => {
    const alpha = sourceObservation({ source: source("alpha"), evidence: [evidenceItem({ key: "contract.verified", value: true })] });
    const beta = sourceObservation({ source: source("beta"), evidence: [evidenceItem({ key: "contract.verified", value: false })] });
    const model = buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [alpha, beta], change_sets: [] });

    assert.equal(model.sources.length, 2);
    assert.equal(model.sources[0]?.evidence_groups[0]?.items[0]?.value, true);
    assert.equal(model.sources[1]?.evidence_groups[0]?.items[0]?.value, false);
  });

  it("sorts source views by source_id", () => {
    const model = buildInvestmentV2ReadModel({
      candidate: candidate(),
      source_observations: [sourceObservation({ source: source("zeta") }), sourceObservation({ source: source("alpha") })],
      change_sets: [],
    });

    assert.deepEqual(model.sources.map((view) => view.source.source_id), ["alpha", "zeta"]);
  });

  it("is independent of source input order", () => {
    const alpha = sourceObservation({ source: source("alpha") });
    const beta = sourceObservation({ source: source("beta") });

    assert.deepEqual(
      buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [alpha, beta], change_sets: [] }),
      buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [beta, alpha], change_sets: [] }),
    );
  });

  it("rejects source observations with a different identity", () => {
    assert.throws(
      () => buildInvestmentV2ReadModel({
        candidate: candidate(),
        source_observations: [sourceObservation({ identity: { chain: "base", contract_or_mint: "0xabc123def456" } })],
        change_sets: [],
      }),
      new RegExp(INVESTMENT_V2_IDENTITY_MISMATCH),
    );
  });

  it("rejects duplicate source IDs", () => {
    assert.throws(
      () => buildInvestmentV2ReadModel({
        candidate: candidate(),
        source_observations: [sourceObservation(), sourceObservation({ evidence: [] })],
        change_sets: [],
      }),
      new RegExp(INVESTMENT_V2_DUPLICATE_SOURCE),
    );
  });

  it("attaches the latest change set to its matching source", () => {
    const alpha = sourceObservation({ source: source("alpha") });
    const beta = sourceObservation({ source: source("beta") });
    const model = buildInvestmentV2ReadModel({
      candidate: candidate(),
      source_observations: [alpha, beta],
      change_sets: [changeSet({ source_id: "beta" })],
    });

    assert.equal(model.sources[0]?.latest_change, null);
    assert.equal(model.sources[1]?.latest_change?.source_id, "beta");
  });

  it("associates change sets deterministically regardless of their input order", () => {
    const alpha = sourceObservation({ source: source("alpha") });
    const beta = sourceObservation({ source: source("beta") });
    const alphaChange = changeSet({ source_id: "alpha" });
    const betaChange = changeSet({ source_id: "beta" });

    assert.deepEqual(
      buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [beta, alpha], change_sets: [betaChange, alphaChange] }),
      buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [alpha, beta], change_sets: [alphaChange, betaChange] }),
    );
  });

  it("rejects duplicate change sets for one source", () => {
    assert.throws(
      () => buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [sourceObservation()], change_sets: [changeSet(), changeSet()] }),
      new RegExp(INVESTMENT_V2_DUPLICATE_CHANGE_SET),
    );
  });

  it("rejects orphan change sets", () => {
    assert.throws(
      () => buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [sourceObservation()], change_sets: [changeSet({ source_id: "orphan" })] }),
      new RegExp(INVESTMENT_V2_ORPHAN_CHANGE_SET),
    );
  });

  it("rejects change sets with a different identity", () => {
    assert.throws(
      () => buildInvestmentV2ReadModel({
        candidate: candidate(),
        source_observations: [sourceObservation()],
        change_sets: [changeSet({ identity: { chain: "base", contract_or_mint: "0xabc123def456" } })],
      }),
      new RegExp(INVESTMENT_V2_IDENTITY_MISMATCH),
    );
  });

  it("rejects change sets with an unsupported schema", () => {
    const invalid = { ...changeSet(), schema_version: "other_change_schema" } as unknown as InvestmentChangeSet;

    assert.throws(
      () => buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [sourceObservation()], change_sets: [invalid] }),
      new RegExp(INVESTMENT_V2_CHANGE_SET_INVALID),
    );
  });

  it("requires exact change-set current timestamp alignment", () => {
    assert.throws(
      () => buildInvestmentV2ReadModel({
        candidate: candidate(),
        source_observations: [sourceObservation()],
        change_sets: [changeSet({ current_observed_at: "2026-09-28T10:00:00+00:00" })],
      }),
      new RegExp(INVESTMENT_V2_CHANGE_SET_MISMATCH),
    );
  });

  it("leaves latest_change null when no change set is supplied", () => {
    assert.equal(build().sources[0]?.latest_change, null);
  });

  it("builds a valid zero-source model", () => {
    const model = buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [], change_sets: [] });

    assert.deepEqual(model.sources, []);
    assert.deepEqual(model.summary, emptySummary());
  });

  it("calculates factual source, evidence, change, and comparison counts", () => {
    const alpha = sourceObservation({ source: source("alpha"), status: "READY", evidence: [evidenceItem()] });
    const beta = sourceObservation({ source: source("beta"), status: "DEGRADED", evidence: [evidenceItem(), evidenceItem({ key: "security.proxy", value: false })] });
    const gamma = sourceObservation({ source: source("gamma"), status: "UNAVAILABLE", evidence: [] });
    const model = buildInvestmentV2ReadModel({
      candidate: candidate(),
      source_observations: [alpha, beta, gamma],
      change_sets: [
        changeSet({ source_id: "alpha", comparison_status: "COMPLETE", has_changes: true, evidence_changes: [evidenceChange()] }),
        changeSet({ source_id: "beta", comparison_status: "PARTIAL", has_changes: false }),
        changeSet({ source_id: "gamma", comparison_status: "NOT_COMPARABLE", has_changes: true }),
      ],
    });

    assert.deepEqual(model.summary, {
      sources_total: 3,
      sources_ready: 1,
      sources_degraded: 1,
      sources_unavailable: 1,
      sources_with_changes: 2,
      evidence_items_total: 3,
      evidence_changes_total: 1,
      comparisons_complete: 1,
      comparisons_partial: 1,
      comparisons_not_comparable: 1,
    });
  });

  it("retains unavailable source truthfully", () => {
    const model = buildInvestmentV2ReadModel({
      candidate: candidate(),
      source_observations: [sourceObservation({ status: "UNAVAILABLE", evidence: [], reason_codes: ["TIMEOUT"] })],
      change_sets: [],
    });

    assert.equal(model.sources[0]?.status, "UNAVAILABLE");
    assert.deepEqual(model.sources[0]?.reason_codes, ["TIMEOUT"]);
  });

  it("contains no decision fields", () => {
    const model = build();

    for (const field of ["recommendation", "buy", "sell", "watchlist", "ready_to_buy", "reject", "investment_score", "risk_score", "ranking", "confidence", "portfolio_allocation"]) {
      assert.equal(field in model, false, field);
      assert.equal(JSON.stringify(model).includes(`\"${field}\"`), false, field);
    }
  });

  it("does not create Research Playbook or current-step authority", () => {
    const model = build();

    for (const field of ["current_step", "research_step", "playbook_stage", "completed_stages", "research_progress", "1/7", "2/7"]) {
      assert.equal(JSON.stringify(model).includes(field), false, field);
    }
  });

  it("does not mutate candidate input and has no candidate aliases", () => {
    const input = candidate();
    const before = structuredClone(input);
    const model = buildInvestmentV2ReadModel({ candidate: input, source_observations: [], change_sets: [] });

    assert.notEqual(model.asset.identity, input.identity);
    assert.notEqual(model.asset.display, input.display);
    assert.notEqual(model.asset.market, input.market);
    model.asset.identity.chain = "changed";
    model.asset.display.symbol = "CHANGED";
    model.asset.market.price_usd = 1;
    model.asset.social_links[0]!.url = "https://changed.example/";
    model.asset.provider_references[0]!.provider_id = "changed";

    assert.deepEqual(input, before);
  });

  it("does not mutate source inputs and has no source aliases", () => {
    const input = sourceObservation({ reason_codes: ["TIMEOUT"], evidence: [evidenceItem()] });
    const before = structuredClone(input);
    const model = buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [input], change_sets: [] });
    const sourceView = model.sources[0]!;

    assert.notEqual(sourceView.source, input.source);
    assert.notEqual(sourceView.reason_codes, input.reason_codes);
    assert.notEqual(sourceView.evidence_groups[0]?.items, input.evidence);
    assert.notEqual(sourceView.evidence_groups[0]?.items[0], input.evidence[0]);
    sourceView.source.source_id = "changed";
    sourceView.reason_codes.push("CHANGED");
    sourceView.evidence_groups[0]!.items[0]!.value = false;

    assert.deepEqual(input, before);
  });

  it("does not mutate change-set inputs and has no change-set aliases", () => {
    const input = changeSet({ has_changes: true, evidence_changes: [evidenceChange()] });
    const before = structuredClone(input);
    const model = buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [sourceObservation()], change_sets: [input] });
    const change = model.sources[0]!.latest_change!;

    assert.notEqual(change, input);
    assert.notEqual(change.identity, input.identity);
    assert.notEqual(change.reason_code_changes.added, input.reason_code_changes.added);
    assert.notEqual(change.evidence_changes[0], input.evidence_changes[0]);
    assert.notEqual(change.evidence_changes[0]?.identity, input.evidence_changes[0]?.identity);
    change.identity.chain = "changed";
    change.reason_code_changes.added.push("CHANGED");
    change.evidence_changes[0]!.identity.key = "changed";
    change.evidence_changes[0]!.changed_fields.push("status");
    change.evidence_changes[0]!.current!.value = false;

    assert.deepEqual(input, before);
  });

  it("returns deep-equal output for the same logical input", () => {
    const alpha = sourceObservation({ source: source("alpha") });
    const beta = sourceObservation({ source: source("beta") });
    const alphaChange = changeSet({ source_id: "alpha" });
    const betaChange = changeSet({ source_id: "beta" });

    assert.deepEqual(
      buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [alpha, beta], change_sets: [alphaChange, betaChange] }),
      buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [beta, alpha], change_sets: [betaChange, alphaChange] }),
    );
  });

  it("rejects malformed candidates locally", () => {
    const invalid = { ...candidate(), market: null } as unknown as CanonicalCandidateObservation;

    assert.throws(
      () => buildInvestmentV2ReadModel({ candidate: invalid, source_observations: [], change_sets: [] }),
      new RegExp(INVESTMENT_V2_CANDIDATE_INVALID),
    );
  });

  it("validates source observations through the accepted 01D boundary", () => {
    const invalid = {
      ...sourceObservation(),
      evidence: [{ ...evidenceItem(), value: null }],
    } as unknown as SourceIntelligenceObservation;

    assert.throws(
      () => buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [invalid], change_sets: [] }),
      new RegExp(INVESTMENT_V2_SOURCE_INVALID),
    );
  });
});

function build() {
  return buildInvestmentV2ReadModel({ candidate: candidate(), source_observations: [sourceObservation()], change_sets: [] });
}

function candidate(overrides: Partial<CanonicalCandidateObservation> = {}): CanonicalCandidateObservation {
  return {
    schema_version: CRYPTO_EDGE_CANDIDATE_OBSERVATION_SCHEMA_VERSION,
    identity: { chain: "base", contract_or_mint: "0xAbC123Def456" },
    display: { symbol: "EDGE", name: "Crypto Edge" },
    pair: { pair_address: "0xPair456", dex: "uniswap" },
    market: {
      price_usd: 0.42,
      market_cap_usd: 4_200_000,
      fdv_usd: 5_000_000,
      liquidity_usd: 250_000,
      volume_24h_usd: 840_000,
      volume_market_cap_ratio: 0.2,
      pair_created_at: "2026-09-01T00:00:00.000Z",
      pair_age_days: 27,
    },
    social_links: [{ category: "website", url: "https://cryptoedge.example/" }],
    observed_at: CANDIDATE_OBSERVED_AT,
    discovered_at: null,
    confidence: null,
    provider_references: [{
      provider_id: "dexscreener",
      source_url: "https://dexscreener.com/base/edge",
      observed_at: CANDIDATE_OBSERVED_AT,
      provider_candidate_id: "pair-456",
      discovery_method: "fixture",
    }],
    ...overrides,
  };
}

function sourceObservation(overrides: Partial<SourceIntelligenceObservationInput> = {}): SourceIntelligenceObservation {
  return createSourceIntelligenceObservation({
    identity: { chain: "base", contract_or_mint: "0xAbC123Def456" },
    source: source("alpha"),
    observed_at: SOURCE_OBSERVED_AT,
    status: "READY",
    reason_codes: [],
    evidence: [evidenceItem()],
    ...overrides,
  });
}

function source(sourceId: string): SourceIntelligenceObservationInput["source"] {
  return {
    source_id: sourceId,
    source_name: `${sourceId} source`,
    source_url: `https://${sourceId}.example/record`,
    provider_record_id: `${sourceId}-record`,
  };
}

function evidenceItem(overrides: Partial<SourceIntelligenceEvidenceItem> = {}): SourceIntelligenceEvidenceItem {
  return {
    key: "contract.verified",
    domain: "contract",
    value: true,
    unit: null,
    status: "OBSERVED",
    reason_code: null,
    source_reference: null,
    ...overrides,
  };
}

function changeSet(overrides: Partial<InvestmentChangeSet> = {}): InvestmentChangeSet {
  return {
    schema_version: CRYPTO_EDGE_INVESTMENT_CHANGE_SET_SCHEMA_VERSION,
    identity: { chain: "base", contract_or_mint: "0xAbC123Def456" },
    source_id: "alpha",
    previous_observed_at: PREVIOUS_OBSERVED_AT,
    current_observed_at: SOURCE_OBSERVED_AT,
    comparison_status: "COMPLETE",
    source_status_change: { previous: "READY", current: "READY", changed: false },
    reason_code_changes: { added: [], removed: [] },
    evidence_changes: [],
    has_changes: false,
    ...overrides,
  };
}

function evidenceChange(): InvestmentChangeSet["evidence_changes"][number] {
  return {
    change_type: "UPDATED",
    identity: {
      domain: "contract",
      key: "contract.verified",
      unit: null,
      source_reference: null,
      occurrence_index: 0,
    },
    previous: evidenceItem({ value: true }),
    current: evidenceItem({ value: false }),
    changed_fields: ["value"],
  };
}

function emptySummary() {
  return {
    sources_total: 0,
    sources_ready: 0,
    sources_degraded: 0,
    sources_unavailable: 0,
    sources_with_changes: 0,
    evidence_items_total: 0,
    evidence_changes_total: 0,
    comparisons_complete: 0,
    comparisons_partial: 0,
    comparisons_not_comparable: 0,
  };
}
