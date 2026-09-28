import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSourceIntelligenceObservation,
  CRYPTO_EDGE_SOURCE_INTELLIGENCE_OBSERVATION_SCHEMA_VERSION,
  SOURCE_INTELLIGENCE_EVIDENCE_INVALID,
  SOURCE_INTELLIGENCE_IDENTITY_INVALID,
  SOURCE_INTELLIGENCE_OBSERVED_AT_INVALID,
  SOURCE_INTELLIGENCE_SOURCE_INVALID,
  type SourceIntelligenceEvidenceItem,
  type SourceIntelligenceObservationInput,
} from "../src/intelligence/sourceIntelligence.js";

const OBSERVED_AT = "2026-09-28T10:15:30.000Z";

describe("Source Intelligence observation contract", () => {
  it("builds a source-neutral observation with the explicit schema and provenance", () => {
    const observation = createSourceIntelligenceObservation(observationInput());

    assert.equal(observation.schema_version, CRYPTO_EDGE_SOURCE_INTELLIGENCE_OBSERVATION_SCHEMA_VERSION);
    assert.deepEqual(observation.identity, { chain: "base", contract_or_mint: "0xAbC123Def456" });
    assert.deepEqual(observation.source, {
      source_id: "fixture-source",
      source_name: "Fixture Source",
      source_url: "https://source.example/record",
      provider_record_id: "record-123",
    });
    assert.equal(observation.status, "READY");
  });

  it("preserves mixed-case EVM addresses", () => {
    const address = "0xAbCdEf0123456789aBCdEf0123456789AbCdEf01";
    const observation = createSourceIntelligenceObservation(observationInput({ identity: { chain: "base", contract_or_mint: address } }));

    assert.equal(observation.identity.contract_or_mint, address);
  });

  it("preserves mixed-case Solana mints", () => {
    const mint = "SoLAnAMintAbCdEfGhijkLmNoPqRsTuVwXyZ123456";
    const observation = createSourceIntelligenceObservation(observationInput({ identity: { chain: "solana", contract_or_mint: mint } }));

    assert.equal(observation.identity.contract_or_mint, mint);
  });

  it("accepts a null contract or mint", () => {
    assert.equal(createSourceIntelligenceObservation(observationInput({ identity: { chain: "bitcoin", contract_or_mint: null } })).identity.contract_or_mint, null);
  });

  it("rejects an empty chain or non-null contract or mint", () => {
    assert.throws(
      () => createSourceIntelligenceObservation(observationInput({ identity: { chain: "  ", contract_or_mint: null } })),
      new RegExp(SOURCE_INTELLIGENCE_IDENTITY_INVALID),
    );
    assert.throws(
      () => createSourceIntelligenceObservation(observationInput({ identity: { chain: "base", contract_or_mint: " " } })),
      new RegExp(SOURCE_INTELLIGENCE_IDENTITY_INVALID),
    );
  });

  it("requires source_id", () => {
    assert.throws(
      () => createSourceIntelligenceObservation(observationInput({ source: { ...source(), source_id: "" } })),
      new RegExp(SOURCE_INTELLIGENCE_SOURCE_INVALID),
    );
  });

  it("accepts every source observation status", () => {
    for (const status of ["READY", "DEGRADED", "UNAVAILABLE"] as const) {
      assert.equal(createSourceIntelligenceObservation(observationInput({ status })).status, status);
    }
  });

  it("sorts and deduplicates reason codes", () => {
    const observation = createSourceIntelligenceObservation(observationInput({ reason_codes: ["TIMEOUT", "HTTP_429", "TIMEOUT"] }));

    assert.deepEqual(observation.reason_codes, ["HTTP_429", "TIMEOUT"]);
  });

  it("rejects sparse reason code arrays at the runtime validation boundary", () => {
    const reasonCodes = new Array<string>(1);

    assert.throws(
      () => createSourceIntelligenceObservation(observationInput({ reason_codes: reasonCodes })),
      new RegExp("SOURCE_INTELLIGENCE_OBSERVATION_INVALID"),
    );
  });

  it("preserves evidence order and duplicate evidence keys", () => {
    const evidence = [
      evidenceItem({ key: "holders.top_10_pct", domain: "holders", value: 25 }),
      evidenceItem({ key: "holders.top_10_pct", domain: "holders", value: 30 }),
    ];
    const observation = createSourceIntelligenceObservation(observationInput({ evidence }));

    assert.deepEqual(observation.evidence.map((item) => item.value), [25, 30]);
    assert.deepEqual(observation.evidence.map((item) => item.key), ["holders.top_10_pct", "holders.top_10_pct"]);
  });

  it("rejects sparse evidence arrays at the runtime validation boundary", () => {
    const evidence = new Array<SourceIntelligenceEvidenceItem>(1);

    assert.throws(
      () => createSourceIntelligenceObservation(observationInput({ evidence })),
      new RegExp(SOURCE_INTELLIGENCE_EVIDENCE_INVALID),
    );
  });

  it("accepts string, finite number, and boolean evidence values", () => {
    const observation = createSourceIntelligenceObservation(observationInput({ evidence: [
      evidenceItem({ key: "contract.name", value: "Edge" }),
      evidenceItem({ key: "holders.top_10_pct", domain: "holders", value: 42.5, unit: "percent" }),
      evidenceItem({ key: "contract.verified", value: true }),
    ] }));

    assert.deepEqual(observation.evidence.map((item) => item.value), ["Edge", 42.5, true]);
  });

  it("accepts UNKNOWN and UNAVAILABLE evidence with null values", () => {
    const observation = createSourceIntelligenceObservation(observationInput({ evidence: [
      evidenceItem({ key: "contract.proxy_risk", value: null, status: "UNKNOWN" }),
      evidenceItem({ key: "liquidity.locked", domain: "liquidity", value: null, status: "UNAVAILABLE" }),
    ] }));

    assert.deepEqual(observation.evidence.map((item) => item.status), ["UNKNOWN", "UNAVAILABLE"]);
  });

  it("rejects evidence status and value inconsistencies", () => {
    for (const evidence of [
      evidenceItem({ value: null, status: "OBSERVED" }),
      evidenceItem({ value: true, status: "UNKNOWN" }),
      evidenceItem({ value: false, status: "UNAVAILABLE" }),
    ]) {
      assert.throws(
        () => createSourceIntelligenceObservation(observationInput({ evidence: [evidence] })),
        new RegExp(SOURCE_INTELLIGENCE_EVIDENCE_INVALID),
      );
    }
  });

  it("rejects non-finite and non-scalar evidence values at the runtime boundary", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, [], {}, new Date()] as unknown[]) {
      const invalidEvidence = evidenceItem({ value: value as SourceIntelligenceEvidenceItem["value"] });
      assert.throws(
        () => createSourceIntelligenceObservation(observationInput({ evidence: [invalidEvidence] })),
        new RegExp(SOURCE_INTELLIGENCE_EVIDENCE_INVALID),
      );
    }
  });

  it("rejects empty or whitespace-padded evidence keys", () => {
    for (const key of ["", " contract.verified", "contract.verified "]) {
      assert.throws(
        () => createSourceIntelligenceObservation(observationInput({ evidence: [evidenceItem({ key })] })),
        new RegExp(SOURCE_INTELLIGENCE_EVIDENCE_INVALID),
      );
    }
  });

  it("rejects malformed and impossible observation timestamps", () => {
    for (const observedAt of [
      "not-a-timestamp",
      "2026-02-31T10:00:00Z",
      "2026-09-28T25:00:00Z",
      "2026-09-28T10:61:00Z",
    ]) {
      assertInvalidObservedAt(observedAt);
    }
  });

  it("accepts leap dates and valid numeric offsets while preserving the original timestamp", () => {
    assert.equal(createSourceIntelligenceObservation(observationInput({ observed_at: "2028-02-29T10:00:00Z" })).observed_at, "2028-02-29T10:00:00Z");
    assert.equal(createSourceIntelligenceObservation(observationInput({ observed_at: "2026-09-28T10:15:30+02:00" })).observed_at, "2026-09-28T10:15:30+02:00");
    assertInvalidObservedAt("2027-02-29T10:00:00Z");
  });

  it("rejects offsets beyond the plus or minus 14 hour boundary", () => {
    assertInvalidObservedAt("2026-09-28T10:00:00+14:01");
    assertInvalidObservedAt("2026-09-28T10:00:00-14:30");
    assertInvalidObservedAt("2026-09-28T10:00:00+23:59");
  });

  it("does not expose decision or fabricated confidence fields", () => {
    const unsafeInput = {
      ...observationInput(),
      security_label: "SECURITY_PASSED",
      final_label: "WATCHLIST",
      decision: "buy",
      confidence: 0.99,
    } as SourceIntelligenceObservationInput;
    const observation = createSourceIntelligenceObservation(unsafeInput);

    for (const field of ["security_label", "final_label", "basic_filter_status", "filter_reasons", "final_reasons", "decision", "recommendation", "score", "ranking", "buy", "sell", "watchlist", "confidence"]) {
      assert.equal(field in observation, false, field);
    }
  });

  it("does not mutate input and copies all mutable boundaries", () => {
    const input = observationInput({ reason_codes: ["TIMEOUT", "HTTP_429"], evidence: [evidenceItem()] });
    const before = structuredClone(input);
    const observation = createSourceIntelligenceObservation(input);

    assert.notEqual(observation.identity, input.identity);
    assert.notEqual(observation.source, input.source);
    assert.notEqual(observation.reason_codes, input.reason_codes);
    assert.notEqual(observation.evidence, input.evidence);
    assert.notEqual(observation.evidence[0], input.evidence[0]);
    observation.identity.chain = "changed";
    observation.source.source_id = "changed";
    observation.reason_codes.push("CHANGED");
    observation.evidence[0]!.value = false;

    assert.deepEqual(input, before);
  });

  it("is deterministic for the same input", () => {
    const input = observationInput();

    assert.deepEqual(createSourceIntelligenceObservation(input), createSourceIntelligenceObservation(input));
  });
});

function observationInput(overrides: Partial<SourceIntelligenceObservationInput> = {}): SourceIntelligenceObservationInput {
  return {
    identity: { chain: "base", contract_or_mint: "0xAbC123Def456" },
    source: source(),
    observed_at: OBSERVED_AT,
    status: "READY",
    reason_codes: [],
    evidence: [evidenceItem()],
    ...overrides,
  };
}

function source() {
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

function assertInvalidObservedAt(observedAt: string): void {
  assert.throws(
    () => createSourceIntelligenceObservation(observationInput({ observed_at: observedAt })),
    new RegExp(SOURCE_INTELLIGENCE_OBSERVED_AT_INVALID),
  );
}
