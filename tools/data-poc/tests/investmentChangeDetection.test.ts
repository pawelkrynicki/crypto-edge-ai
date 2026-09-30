import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSourceIntelligenceObservation,
  type SourceIntelligenceEvidenceItem,
  type SourceIntelligenceObservation,
  type SourceIntelligenceObservationInput,
} from "../src/intelligence/sourceIntelligence.js";
import {
  detectInvestmentChanges,
  CRYPTO_EDGE_INVESTMENT_CHANGE_SET_SCHEMA_VERSION,
  INVESTMENT_CHANGE_IDENTITY_MISMATCH,
  INVESTMENT_CHANGE_INPUT_INVALID,
  INVESTMENT_CHANGE_SOURCE_MISMATCH,
  INVESTMENT_CHANGE_TIME_ORDER_INVALID,
} from "../src/investment/investmentChangeDetection.js";

const PREVIOUS_OBSERVED_AT = "2026-09-28T10:00:00.000Z";
const CURRENT_OBSERVED_AT = "2026-09-28T10:01:00.000Z";

describe("Investment change detection", () => {
  it("reports COMPLETE for READY to READY", () => {
    assert.equal(detect().comparison_status, "COMPLETE");
  });

  it("reports PARTIAL for READY to DEGRADED", () => {
    assert.equal(detect(observation(), observation({ status: "DEGRADED" })).comparison_status, "PARTIAL");
  });

  it("reports PARTIAL for DEGRADED to READY", () => {
    assert.equal(detect(observation({ status: "DEGRADED" }), observation()).comparison_status, "PARTIAL");
  });

  it("reports NOT_COMPARABLE when the previous observation is UNAVAILABLE", () => {
    assert.equal(detect(observation({ status: "UNAVAILABLE" }), observation()).comparison_status, "NOT_COMPARABLE");
  });

  it("reports NOT_COMPARABLE when the current observation is UNAVAILABLE", () => {
    assert.equal(detect(observation(), observation({ status: "UNAVAILABLE" })).comparison_status, "NOT_COMPARABLE");
  });

  it("does not treat unchanged READY observations as changes", () => {
    const changeSet = detect();

    assert.equal(changeSet.has_changes, false);
    assert.deepEqual(changeSet.evidence_changes, []);
    assert.deepEqual(changeSet.reason_code_changes, { added: [], removed: [] });
  });

  it("reports a source status change without interpreting it", () => {
    const changeSet = detect(observation(), observation({ status: "DEGRADED" }));

    assert.deepEqual(changeSet.source_status_change, { previous: "READY", current: "DEGRADED", changed: true });
    assert.equal(changeSet.has_changes, true);
  });

  it("detects added reason codes", () => {
    const changeSet = detect(observation({ reason_codes: ["HTTP_429"] }), observation({ reason_codes: ["HTTP_429", "TIMEOUT"] }));

    assert.deepEqual(changeSet.reason_code_changes, { added: ["TIMEOUT"], removed: [] });
  });

  it("detects removed reason codes", () => {
    const changeSet = detect(observation({ reason_codes: ["HTTP_429", "TIMEOUT"] }), observation({ reason_codes: ["HTTP_429"] }));

    assert.deepEqual(changeSet.reason_code_changes, { added: [], removed: ["TIMEOUT"] });
  });

  it("orders reason-code deltas deterministically", () => {
    const changeSet = detect(
      observation({ reason_codes: ["ZETA", "ALPHA"] }),
      observation({ reason_codes: ["OMEGA", "BETA"] }),
    );

    assert.deepEqual(changeSet.reason_code_changes, { added: ["BETA", "OMEGA"], removed: ["ALPHA", "ZETA"] });
  });

  it("detects an evidence value update", () => {
    const changeSet = detect(observation({ evidence: [evidenceItem({ value: 25 })] }), observation({ evidence: [evidenceItem({ value: 25.0001 })] }));

    assert.deepEqual(changeSet.evidence_changes[0]?.changed_fields, ["value"]);
  });

  it("detects an evidence status update", () => {
    const changeSet = detect(
      observation({ evidence: [evidenceItem({ value: true, status: "OBSERVED" })] }),
      observation({ evidence: [evidenceItem({ value: null, status: "UNKNOWN" })] }),
    );

    assert.deepEqual(changeSet.evidence_changes[0]?.changed_fields, ["value", "status"]);
  });

  it("detects an evidence reason-code update", () => {
    const changeSet = detect(
      observation({ evidence: [evidenceItem({ reason_code: "OLD_REASON" })] }),
      observation({ evidence: [evidenceItem({ reason_code: "NEW_REASON" })] }),
    );

    assert.deepEqual(changeSet.evidence_changes[0]?.changed_fields, ["reason_code"]);
  });

  it("reports every changed comparable evidence field in contract order", () => {
    const changeSet = detect(
      observation({ evidence: [evidenceItem({ value: true, status: "OBSERVED", reason_code: "OLD" })] }),
      observation({ evidence: [evidenceItem({ value: null, status: "UNAVAILABLE", reason_code: "NEW" })] }),
    );

    assert.deepEqual(changeSet.evidence_changes[0]?.changed_fields, ["value", "status", "reason_code"]);
  });

  it("reports evidence ADDED in COMPLETE mode in current evidence order", () => {
    const added = evidenceItem({ key: "liquidity.locked", domain: "liquidity", value: false });
    const changeSet = detect(observation({ evidence: [evidenceItem()] }), observation({ evidence: [evidenceItem(), added] }));

    assert.deepEqual(changeSet.evidence_changes, [{
      change_type: "ADDED",
      identity: { domain: "liquidity", key: "liquidity.locked", unit: null, source_reference: null, occurrence_index: 0 },
      previous: null,
      current: added,
      changed_fields: [],
    }]);
  });

  it("reports evidence REMOVED in COMPLETE mode in previous evidence order", () => {
    const removed = evidenceItem({ key: "liquidity.locked", domain: "liquidity", value: false });
    const changeSet = detect(observation({ evidence: [evidenceItem(), removed] }), observation({ evidence: [evidenceItem()] }));

    assert.deepEqual(changeSet.evidence_changes, [{
      change_type: "REMOVED",
      identity: { domain: "liquidity", key: "liquidity.locked", unit: null, source_reference: null, occurrence_index: 0 },
      previous: removed,
      current: null,
      changed_fields: [],
    }]);
  });

  it("suppresses evidence additions in PARTIAL mode", () => {
    const changeSet = detect(
      observation({ status: "DEGRADED", evidence: [evidenceItem()] }),
      observation({ evidence: [evidenceItem(), evidenceItem({ key: "liquidity.locked", domain: "liquidity", value: false })] }),
    );

    assert.deepEqual(changeSet.evidence_changes, []);
  });

  it("suppresses evidence removals in PARTIAL mode", () => {
    const changeSet = detect(
      observation({ evidence: [evidenceItem(), evidenceItem({ key: "liquidity.locked", domain: "liquidity", value: false })] }),
      observation({ status: "DEGRADED", evidence: [evidenceItem()] }),
    );

    assert.deepEqual(changeSet.evidence_changes, []);
  });

  it("suppresses ambiguous duplicate-slot updates when a DEGRADED current observation has fewer occurrences", () => {
    const repeated = { key: "holders.top_10_pct", domain: "holders" as const, source_reference: "holder-api" };
    const changeSet = detect(
      observation({ evidence: [evidenceItem({ ...repeated, value: 25 }), evidenceItem({ ...repeated, value: 30 })] }),
      observation({ status: "DEGRADED", evidence: [evidenceItem({ ...repeated, value: 30 })] }),
    );

    assert.equal(changeSet.comparison_status, "PARTIAL");
    assert.deepEqual(changeSet.evidence_changes, []);
  });

  it("suppresses ambiguous duplicate-slot updates when a DEGRADED previous observation has fewer occurrences", () => {
    const repeated = { key: "holders.top_10_pct", domain: "holders" as const, source_reference: "holder-api" };
    const changeSet = detect(
      observation({ status: "DEGRADED", evidence: [evidenceItem({ ...repeated, value: 30 })] }),
      observation({ evidence: [evidenceItem({ ...repeated, value: 25 }), evidenceItem({ ...repeated, value: 30 })] }),
    );

    assert.equal(changeSet.comparison_status, "PARTIAL");
    assert.deepEqual(changeSet.evidence_changes, []);
  });

  it("updates same-cardinality duplicate slots in PARTIAL mode by their occurrence indexes", () => {
    const repeated = { key: "holders.top_10_pct", domain: "holders" as const, source_reference: "holder-api" };
    const changeSet = detect(
      observation({ status: "DEGRADED", evidence: [evidenceItem({ ...repeated, value: 25 }), evidenceItem({ ...repeated, value: 30 })] }),
      observation({ evidence: [evidenceItem({ ...repeated, value: 26 }), evidenceItem({ ...repeated, value: 31 })] }),
    );

    assert.deepEqual(changeSet.evidence_changes.map((change) => change.identity.occurrence_index), [0, 1]);
    assert.deepEqual(changeSet.evidence_changes.map((change) => change.changed_fields), [["value"], ["value"]]);
  });

  it("still reports explicit matched evidence updates in PARTIAL mode", () => {
    const changeSet = detect(
      observation({ status: "DEGRADED", evidence: [evidenceItem({ value: true })] }),
      observation({ evidence: [evidenceItem({ value: false })] }),
    );

    assert.equal(changeSet.comparison_status, "PARTIAL");
    assert.equal(changeSet.evidence_changes[0]?.change_type, "UPDATED");
    assert.deepEqual(changeSet.evidence_changes[0]?.changed_fields, ["value"]);
  });

  it("never infers evidence changes in NOT_COMPARABLE mode", () => {
    const changeSet = detect(
      observation({ status: "UNAVAILABLE", reason_codes: ["HTTP_429"], evidence: [evidenceItem()] }),
      observation({ reason_codes: ["TIMEOUT"], evidence: [evidenceItem({ key: "liquidity.locked", domain: "liquidity", value: false })] }),
    );

    assert.deepEqual(changeSet.evidence_changes, []);
    assert.deepEqual(changeSet.reason_code_changes, { added: ["TIMEOUT"], removed: ["HTTP_429"] });
  });

  it("keeps duplicate evidence keys with different source references distinct", () => {
    const changeSet = detect(
      observation({ evidence: [
        evidenceItem({ key: "holders.top_10_pct", domain: "holders", value: 25, source_reference: "holder-api" }),
        evidenceItem({ key: "holders.top_10_pct", domain: "holders", value: 30, source_reference: "indexer" }),
      ] }),
      observation({ evidence: [
        evidenceItem({ key: "holders.top_10_pct", domain: "holders", value: 26, source_reference: "holder-api" }),
        evidenceItem({ key: "holders.top_10_pct", domain: "holders", value: 30, source_reference: "indexer" }),
      ] }),
    );

    assert.equal(changeSet.evidence_changes.length, 1);
    assert.equal(changeSet.evidence_changes[0]?.identity.source_reference, "holder-api");
  });

  it("assigns deterministic occurrence indexes to repeated identical evidence slots", () => {
    const repeated = { key: "holders.top_10_pct", domain: "holders" as const, source_reference: "holder-api" };
    const changeSet = detect(
      observation({ evidence: [evidenceItem({ ...repeated, value: 25 }), evidenceItem({ ...repeated, value: 30 })] }),
      observation({ evidence: [evidenceItem({ ...repeated, value: 26 }), evidenceItem({ ...repeated, value: 31 })] }),
    );

    assert.deepEqual(changeSet.evidence_changes.map((change) => change.identity.occurrence_index), [0, 1]);
    assert.deepEqual(changeSet.evidence_changes.map((change) => change.current?.value), [26, 31]);
  });

  it("rejects comparisons across identities without normalizing address casing", () => {
    assert.throws(
      () => detect(observation(), observation({ identity: { chain: "base", contract_or_mint: "0xabc123def456" } })),
      new RegExp(INVESTMENT_CHANGE_IDENTITY_MISMATCH),
    );
  });

  it("rejects comparisons across source IDs", () => {
    assert.throws(
      () => detect(observation(), observation({ source: { ...source(), source_id: "other-source" } })),
      new RegExp(INVESTMENT_CHANGE_SOURCE_MISMATCH),
    );
  });

  it("rejects equal observation timestamps", () => {
    assert.throws(
      () => detect(observation({ observed_at: PREVIOUS_OBSERVED_AT }), observation({ observed_at: PREVIOUS_OBSERVED_AT })),
      new RegExp(INVESTMENT_CHANGE_TIME_ORDER_INVALID),
    );
  });

  it("rejects reverse chronological comparisons", () => {
    assert.throws(
      () => detect(observation({ observed_at: CURRENT_OBSERVED_AT }), observation({ observed_at: PREVIOUS_OBSERVED_AT })),
      new RegExp(INVESTMENT_CHANGE_TIME_ORDER_INVALID),
    );
  });

  it("preserves canonical address casing in its output", () => {
    const address = "0xAbCdEf0123456789aBCdEf0123456789AbCdEf01";
    const changeSet = detect(
      observation({ identity: { chain: "base", contract_or_mint: address } }),
      observation({ identity: { chain: "base", contract_or_mint: address } }),
    );

    assert.equal(changeSet.identity.contract_or_mint, address);
  });

  it("uses the explicit investment change-set schema", () => {
    assert.equal(detect().schema_version, CRYPTO_EDGE_INVESTMENT_CHANGE_SET_SCHEMA_VERSION);
  });

  it("does not expose decision, score, risk, or recommendation fields", () => {
    const changeSet = detect();

    for (const field of ["recommendation", "score", "risk", "risk_verdict", "buy", "sell", "watchlist"]) {
      assert.equal(field in changeSet, false, field);
    }
  });

  it("does not mutate inputs or retain aliases to them", () => {
    const previous = observation({ reason_codes: ["HTTP_429"], evidence: [evidenceItem({ value: true })] });
    const current = observation({ reason_codes: ["TIMEOUT"], evidence: [evidenceItem({ value: false })] });
    const previousBefore = structuredClone(previous);
    const currentBefore = structuredClone(current);
    const changeSet = detect(previous, current);
    const change = changeSet.evidence_changes[0]!;

    assert.notEqual(changeSet.identity, previous.identity);
    assert.notEqual(changeSet.reason_code_changes.added, current.reason_codes);
    assert.notEqual(change.previous, previous.evidence[0]);
    assert.notEqual(change.current, current.evidence[0]);
    changeSet.identity.chain = "mutated";
    changeSet.reason_code_changes.added.push("MUTATED");
    change.previous!.value = false;
    change.current!.value = true;

    assert.deepEqual(previous, previousBefore);
    assert.deepEqual(current, currentBefore);
  });

  it("returns deep-equal output for the same inputs", () => {
    const previous = observation({ evidence: [evidenceItem({ value: true })] });
    const current = observation({ evidence: [evidenceItem({ value: false })] });

    assert.deepEqual(detect(previous, current), detect(previous, current));
  });

  it("does not count a timestamp-only difference as a change", () => {
    assert.equal(detect().has_changes, false);
  });

  it("does not treat source provenance changes alone as an investment change", () => {
    const changeSet = detect(
      observation(),
      observation({ source: {
        source_id: "fixture-source",
        source_name: "Renamed Fixture Source",
        source_url: "https://source.example/new-record",
        provider_record_id: "record-456",
      } }),
    );

    assert.equal(changeSet.has_changes, false);
  });

  it("requires the accepted 01D schema and maps malformed observations to the boundary error", () => {
    const invalidSchema = { ...observation(), schema_version: "other_schema" } as unknown as SourceIntelligenceObservation;
    const malformedEvidence = {
      ...observation(),
      evidence: [{ ...evidenceItem(), value: null }],
    } as unknown as SourceIntelligenceObservation;

    assert.throws(() => detectInvestmentChanges(invalidSchema, observation()), new RegExp(INVESTMENT_CHANGE_INPUT_INVALID));
    assert.throws(() => detectInvestmentChanges(malformedEvidence, observation()), new RegExp(INVESTMENT_CHANGE_INPUT_INVALID));
  });
});

function detect(
  previous: SourceIntelligenceObservation = observation({ observed_at: PREVIOUS_OBSERVED_AT }),
  current: SourceIntelligenceObservation = observation({ observed_at: CURRENT_OBSERVED_AT }),
) {
  const orderedPrevious = previous.observed_at === CURRENT_OBSERVED_AT && current.observed_at === CURRENT_OBSERVED_AT
    ? createSourceIntelligenceObservation({
      identity: previous.identity,
      source: previous.source,
      observed_at: PREVIOUS_OBSERVED_AT,
      status: previous.status,
      reason_codes: previous.reason_codes,
      evidence: previous.evidence,
    })
    : previous;

  return detectInvestmentChanges(orderedPrevious, current);
}

function observation(overrides: Partial<SourceIntelligenceObservationInput> = {}): SourceIntelligenceObservation {
  return createSourceIntelligenceObservation({
    identity: { chain: "base", contract_or_mint: "0xAbC123Def456" },
    source: source(),
    observed_at: CURRENT_OBSERVED_AT,
    status: "READY",
    reason_codes: [],
    evidence: [evidenceItem()],
    ...overrides,
  });
}

function source(): SourceIntelligenceObservationInput["source"] {
  return {
    source_id: "fixture-source",
    source_name: "Fixture Source",
    source_url: "https://source.example/record",
    provider_record_id: "record-123",
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
