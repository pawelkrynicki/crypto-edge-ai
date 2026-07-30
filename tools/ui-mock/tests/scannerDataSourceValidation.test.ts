import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample.js";
import {
  createEmptyProductScannerViewState,
  resolveProductScannerRefreshState,
} from "../src/productRefreshState.js";
import {
  validateScannerApiOutput,
  type ScannerDataSourceLoadResult,
} from "../src/services/scannerDataSource.js";
import type { ScannerApiOutput } from "../src/types/scannerTypes.js";

type SnapshotMutation = (snapshot: ScannerApiOutput) => void;

const INVALID_VARIANTS: Record<string, SnapshotMutation> = {
  "scan_run source": (snapshot) => { scanRun(snapshot).source = "other-scanner"; },
  "scan_run NaN counter": (snapshot) => { scanRun(snapshot).total_raw = Number.NaN; },
  "scan_run Infinity counter": (snapshot) => { scanRun(snapshot).security_checked = Number.POSITIVE_INFINITY; },
  "scan_run timestamp": (snapshot) => { scanRun(snapshot).finished_at = "not-a-timestamp"; },
  "scan_run impossible calendar timestamp": (snapshot) => { scanRun(snapshot).finished_at = "2026-02-31T12:00:00.000Z"; },
  "scan_run filters array": (snapshot) => { scanRun(snapshot).filters = []; },
  "scan_run nested non-finite limit": (snapshot) => { scanRun(snapshot).limits = { max_candidates: Number.NEGATIVE_INFINITY }; },
  "candidate missing field": (snapshot) => { delete candidate(snapshot).symbol; },
  "candidate nullable field type": (snapshot) => { candidate(snapshot).name = 123; },
  "candidate non-finite number": (snapshot) => { candidate(snapshot).liquidity_usd = Number.NaN; },
  "candidate timestamp": (snapshot) => { candidate(snapshot).created_at = "yesterday"; },
  "candidate discovery enum": (snapshot) => { candidate(snapshot).discovery_basket = "archive"; },
  "security non-object": (snapshot) => { securityArray(snapshot)[0] = "broken"; },
  "security missing field": (snapshot) => { delete security(snapshot).honeypot_status; },
  "security field type": (snapshot) => { security(snapshot).contract_verified = "true"; },
  "security NaN": (snapshot) => { security(snapshot).buy_tax = Number.NaN; },
  "security Infinity": (snapshot) => { security(snapshot).top_wallet_pct = Number.POSITIVE_INFINITY; },
  "security checked_at": (snapshot) => { security(snapshot).checked_at = "invalid"; },
  "security unsafe string array": (snapshot) => { security(snapshot).risk_flags = [""]; },
  "scorecard non-object": (snapshot) => { scorecardArray(snapshot)[0] = null; },
  "scorecard missing checklist section": (snapshot) => { delete checklist(snapshot).personal; },
  "scorecard result type": (snapshot) => { scorecard(snapshot).security_score = "1"; },
  "scorecard NaN": (snapshot) => { scorecard(snapshot).total_score = Number.NaN; },
  "scorecard Infinity": (snapshot) => { scorecard(snapshot).confidence = Number.POSITIVE_INFINITY; },
  "scorecard timestamp": (snapshot) => { scorecard(snapshot).created_at = "invalid"; },
  "scorecard unsafe checklist string": (snapshot) => { checklist(snapshot).security = ["valid", ""]; },
  "candidate run_id mismatch": (snapshot) => { candidate(snapshot).run_id = "scan_other"; },
  "security run_id mismatch": (snapshot) => { security(snapshot).run_id = "scan_other"; },
  "scorecard run_id mismatch": (snapshot) => { scorecard(snapshot).run_id = "scan_other"; },
  "security missing candidate": (snapshot) => { security(snapshot).candidate_id = "candidate_missing"; },
  "scorecard missing candidate": (snapshot) => { scorecard(snapshot).candidate_id = "candidate_missing"; },
  "duplicate candidate_id": (snapshot) => { snapshot.candidates.push(structuredClone(snapshot.candidates[0]!)); },
  "duplicate security check": (snapshot) => { snapshot.security_checks.push(structuredClone(snapshot.security_checks[0]!)); },
  "duplicate scorecard": (snapshot) => { snapshot.scorecards.push(structuredClone(snapshot.scorecards[0]!)); },
  "provenance run_id mismatch": (snapshot) => {
    snapshot.provenance = validProvenance(snapshot);
    snapshot.provenance.run_id = "scan_other";
  },
};

describe("scanner response full contract validation", () => {
  it("accepts the existing complete scanner snapshot", () => {
    const snapshot = validSnapshot();
    assert.equal(validateScannerApiOutput(snapshot), snapshot);
  });

  it("accepts omitted optional scan_run objects and a null started_at", () => {
    const snapshot = validSnapshot();
    delete scanRun(snapshot).filters;
    delete scanRun(snapshot).limits;
    scanRun(snapshot).started_at = null;
    assert.equal(validateScannerApiOutput(snapshot), snapshot);
  });

  it("allows candidates without Security Checks or Scorecards", () => {
    const snapshot = validSnapshot();
    snapshot.security_checks = [];
    snapshot.scorecards = [];
    assert.equal(validateScannerApiOutput(snapshot), snapshot);
  });

  it("rejects an invalid scan_run field", () => assertVariantInvalid("scan_run source"));
  it("rejects a NaN scan_run counter", () => assertVariantInvalid("scan_run NaN counter"));
  it("rejects an Infinity scan_run counter", () => assertVariantInvalid("scan_run Infinity counter"));
  it("rejects an invalid scan_run timestamp", () => assertVariantInvalid("scan_run timestamp"));
  it("rejects an impossible calendar timestamp", () => assertVariantInvalid("scan_run impossible calendar timestamp"));
  it("rejects an array in optional scan_run filters", () => assertVariantInvalid("scan_run filters array"));
  it("rejects a nested non-finite scan_run limit", () => assertVariantInvalid("scan_run nested non-finite limit"));

  it("rejects a candidate with a missing required field", () => assertVariantInvalid("candidate missing field"));
  it("rejects an invalid candidate nullable field type", () => assertVariantInvalid("candidate nullable field type"));
  it("rejects a non-finite candidate number", () => assertVariantInvalid("candidate non-finite number"));
  it("rejects an invalid candidate timestamp", () => assertVariantInvalid("candidate timestamp"));
  it("rejects an invalid candidate discovery enum", () => assertVariantInvalid("candidate discovery enum"));

  it("rejects a non-object Security Check", () => assertVariantInvalid("security non-object"));
  it("rejects a Security Check with a missing field", () => assertVariantInvalid("security missing field"));
  it("rejects an invalid Security Check field type", () => assertVariantInvalid("security field type"));
  it("rejects NaN in a Security Check", () => assertVariantInvalid("security NaN"));
  it("rejects Infinity in a Security Check", () => assertVariantInvalid("security Infinity"));
  it("rejects an invalid Security Check checked_at", () => assertVariantInvalid("security checked_at"));
  it("rejects an unsafe Security Check string array", () => assertVariantInvalid("security unsafe string array"));

  it("rejects a non-object Scorecard", () => assertVariantInvalid("scorecard non-object"));
  it("rejects a Scorecard without a required checklist section", () => assertVariantInvalid("scorecard missing checklist section"));
  it("rejects an invalid Scorecard result type", () => assertVariantInvalid("scorecard result type"));
  it("rejects NaN in a Scorecard", () => assertVariantInvalid("scorecard NaN"));
  it("rejects Infinity in a Scorecard", () => assertVariantInvalid("scorecard Infinity"));
  it("rejects an invalid Scorecard timestamp", () => assertVariantInvalid("scorecard timestamp"));
  it("rejects an unsafe Scorecard checklist string", () => assertVariantInvalid("scorecard unsafe checklist string"));

  it("rejects a candidate run_id that does not match scan_run", () => assertVariantInvalid("candidate run_id mismatch"));
  it("rejects a Security Check run_id that does not match scan_run", () => assertVariantInvalid("security run_id mismatch"));
  it("rejects a Scorecard run_id that does not match scan_run", () => assertVariantInvalid("scorecard run_id mismatch"));
  it("rejects a Security Check for an unknown candidate", () => assertVariantInvalid("security missing candidate"));
  it("rejects a Scorecard for an unknown candidate", () => assertVariantInvalid("scorecard missing candidate"));
  it("rejects a duplicate candidate_id", () => assertVariantInvalid("duplicate candidate_id"));
  it("rejects a duplicate Security Check", () => assertVariantInvalid("duplicate security check"));
  it("rejects a duplicate Scorecard", () => assertVariantInvalid("duplicate scorecard"));
  it("rejects provenance.run_id that does not match scan_run", () => assertVariantInvalid("provenance run_id mismatch"));

  it("preserves last-known-good for every invalid variant", () => {
    const accepted = resolveProductScannerRefreshState(
      createEmptyProductScannerViewState(),
      readyResult(validSnapshot()),
      "2026-07-30T12:00:05.000Z",
    );

    for (const [name, mutation] of Object.entries(INVALID_VARIANTS)) {
      const invalid = mutatedSnapshot(mutation);
      assertScannerInvalid(invalid, name);
      const failed = resolveProductScannerRefreshState(accepted, errorResult(), "2026-07-30T12:01:05.000Z");
      assert.deepEqual(failed.candidates, accepted.candidates, name);
      assert.equal(failed.runId, accepted.runId, name);
      assert.equal(failed.generatedAt, accepted.generatedAt, name);
      assert.equal(failed.viewRefreshedAt, accepted.viewRefreshedAt, name);
      assert.equal(failed.lastKnownGoodRefreshError, true, name);
    }
  });

  it("keeps the true empty state when the first snapshot is invalid", () => {
    const invalid = mutatedSnapshot(INVALID_VARIANTS["security non-object"]!);
    assertScannerInvalid(invalid);
    const failed = resolveProductScannerRefreshState(
      createEmptyProductScannerViewState(),
      errorResult(),
      "2026-07-30T12:00:05.000Z",
    );
    assert.equal(failed.hasAcceptedSnapshot, false);
    assert.deepEqual(failed.candidates, []);
    assert.equal(failed.runId, null);
    assert.equal(failed.generatedAt, null);
    assert.equal(failed.lastKnownGoodRefreshError, false);
  });

  it("accepts the next valid snapshot and restores Radar after a rejected first read", () => {
    const failed = resolveProductScannerRefreshState(
      createEmptyProductScannerViewState(),
      errorResult(),
      "2026-07-30T12:00:05.000Z",
    );
    const recovered = resolveProductScannerRefreshState(
      failed,
      readyResult(validSnapshot()),
      "2026-07-30T12:05:05.000Z",
    );
    assert.equal(recovered.hasAcceptedSnapshot, true);
    assert.ok(recovered.candidates.length > 0);
    assert.equal(recovered.runId, PERSISTABLE_SCANNER_SAMPLE.scan_run.run_id);
    assert.equal(recovered.lastKnownGoodRefreshError, false);
  });
});

function validSnapshot(): ScannerApiOutput {
  return structuredClone(PERSISTABLE_SCANNER_SAMPLE) as ScannerApiOutput;
}

function mutatedSnapshot(mutation: SnapshotMutation): ScannerApiOutput {
  const snapshot = validSnapshot();
  mutation(snapshot);
  return snapshot;
}

function assertVariantInvalid(name: keyof typeof INVALID_VARIANTS): void {
  assertScannerInvalid(mutatedSnapshot(INVALID_VARIANTS[name]!), name);
}

function assertScannerInvalid(snapshot: unknown, label = "snapshot"): void {
  assert.throws(
    () => validateScannerApiOutput(snapshot),
    (error: unknown) => Boolean(error)
      && typeof error === "object"
      && "reasonCode" in error
      && error.reasonCode === "SCANNER_RESPONSE_INVALID",
    label,
  );
}

function readyResult(output: ScannerApiOutput): ScannerDataSourceLoadResult {
  return {
    status: "ready",
    source: "api",
    resolvedSource: "real-output",
    usedFallback: false,
    output,
  };
}

function errorResult(): ScannerDataSourceLoadResult {
  return {
    status: "error",
    source: "api",
    resolvedSource: "unavailable",
    usedFallback: false,
    reasonCode: "SCANNER_RESPONSE_INVALID",
    error: "Scanner response invalid.",
    output: null,
  };
}

function validProvenance(snapshot: ScannerApiOutput): NonNullable<ScannerApiOutput["provenance"]> {
  return {
    schema_version: "scanner_snapshot_v2",
    contract_version: "real_data_contract_v1",
    generator_version: "data_poc_persistable_scanner_v2",
    environment: "INTERNAL_BETA",
    mode: snapshot.scan_run.mode,
    fixture_used: snapshot.scan_run.mode === "fixture",
    run_id: snapshot.scan_run.run_id,
    generated_at: snapshot.scan_run.finished_at,
    finished_at: snapshot.scan_run.finished_at,
    source_ids: ["dexscreener"],
    policy_decisions: {
      dexscreener: {
        live_fetch: "allowed",
        normalized_storage: "allowed",
        user_display: "allowed",
        raw_storage: "denied",
      },
    },
  };
}

function scanRun(snapshot: ScannerApiOutput): Record<string, unknown> {
  return snapshot.scan_run as unknown as Record<string, unknown>;
}

function candidate(snapshot: ScannerApiOutput): Record<string, unknown> {
  return snapshot.candidates[0] as unknown as Record<string, unknown>;
}

function security(snapshot: ScannerApiOutput): Record<string, unknown> {
  return snapshot.security_checks[0] as unknown as Record<string, unknown>;
}

function scorecard(snapshot: ScannerApiOutput): Record<string, unknown> {
  return snapshot.scorecards[0] as unknown as Record<string, unknown>;
}

function checklist(snapshot: ScannerApiOutput): Record<string, unknown> {
  return scorecard(snapshot).checklist as Record<string, unknown>;
}

function securityArray(snapshot: ScannerApiOutput): unknown[] {
  return snapshot.security_checks as unknown[];
}

function scorecardArray(snapshot: ScannerApiOutput): unknown[] {
  return snapshot.scorecards as unknown[];
}
