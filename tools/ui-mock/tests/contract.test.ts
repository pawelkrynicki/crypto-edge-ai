import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { mapPersistableScannerOutputToUiCandidates } from "../src/adapters/scannerOutputAdapter";
import { getMissingSecurityText } from "../src/components/CandidateDetail";
import { PERSISTABLE_SCANNER_SAMPLE } from "../src/fixtures/persistableScannerSample";
import { interpretScannerApiOutput } from "../src/services/scannerDataSource";
import type { PersistableScannerOutput, ScannerApiOutput } from "../src/types/scannerTypes";
import { isPersistableScannerOutputShape } from "../server/latestScannerOutput";

const realFixture = PERSISTABLE_SCANNER_SAMPLE;
const uiCandidates = mapPersistableScannerOutputToUiCandidates(realFixture);
const passCandidate = realFixture.candidates.find((candidate) => candidate.symbol === "PASS");
const lowlCandidate = realFixture.candidates.find((candidate) => candidate.symbol === "LOWL");
const fdvCandidate = realFixture.candidates.find((candidate) => candidate.symbol === "FDV");

assert.ok(passCandidate);
assert.ok(lowlCandidate);
assert.ok(fdvCandidate);

const passUi = uiCandidates.find((candidate) => candidate.symbol === "PASS");
const lowlUi = uiCandidates.find((candidate) => candidate.symbol === "LOWL");
const fdvUi = uiCandidates.find((candidate) => candidate.symbol === "FDV");

assert.ok(passUi);
assert.ok(lowlUi);
assert.ok(fdvUi);

assert.equal(passUi.id, passCandidate.candidate_id, "candidate_id becomes UI id");
assert.equal(passUi.security?.honeypotStatus, "passed", "security_check joins by candidate_id");
assert.equal(passUi.securityLabel, "SECURITY_PASSED", "security_label comes from security_check");
assert.equal(passUi.scorecard?.decisionLabel, "WATCHLIST", "scorecard joins by candidate_id");
assert.equal(passUi.priceUsd, passCandidate.price_usd, "price_usd is preserved");
assert.equal(fdvUi.fdvUsd, fdvCandidate.fdv_usd, "fdv_usd is preserved");

assert.equal(passUi.finalLabel, "WATCHLIST");
assert.ok(passUi.security, "WATCHLIST candidate with security displays security data");

assert.equal(lowlUi.finalLabel, "REJECT");
assert.equal(lowlUi.security, null, "rejected candidate has no security detail");
assert.equal(lowlUi.securityLabel, "NOT_CHECKED", "rejected candidate without security remains NOT_CHECKED");

const passedWithoutSecurity = {
  ...realFixture,
  candidates: [
    {
      ...passCandidate,
      candidate_id: "passed-without-security",
      basic_filter_status: "passed_basic_filter",
    },
  ],
  security_checks: [],
  scorecards: [],
} satisfies PersistableScannerOutput;
const [missingSecurityUi] = mapPersistableScannerOutputToUiCandidates(passedWithoutSecurity);

assert.equal(missingSecurityUi.securityLabel, "NOT_CHECKED");
assert.equal(
  getMissingSecurityText({ basic_filter_status: missingSecurityUi.basicFilterStatus }),
  "Security data is unavailable. Manual verification is required.",
  "missing security for a passed candidate does not claim it failed basic filters",
);

const obsoleteIdOnlyShape = {
  scan_run: { id: "old-run" },
  candidates: [{ id: "old-candidate" }],
  security_checks: [{ id: "old-security", candidate_id: "old-candidate" }],
  scorecards: [{ id: "old-scorecard", candidate_id: "old-candidate" }],
};

assert.equal(
  isPersistableScannerOutputShape(obsoleteIdOnlyShape),
  false,
  "obsolete id-only fixture is rejected by API validation",
);
assert.equal(
  isPersistableScannerOutputShape(realFixture),
  true,
  "real data-poc shaped fixture passes validation",
);

const publicFixturePath = resolve("public", "fixtures", "persistableScannerSample.json");
const publicFixture = JSON.parse(await readFile(publicFixturePath, "utf8"));

assert.equal(
  isPersistableScannerOutputShape(publicFixture),
  true,
  "public JSON fixture passes validation",
);

const apiRealOutput: ScannerApiOutput = {
  ...realFixture,
  _source_meta: {
    source: "real-output",
    path: "../data-poc/output/scan_20260623073520/full_output.json",
    reason: "latest valid tools/data-poc output selected",
    selected_run_id: "scan_20260623073520",
    loaded_at: "2026-06-23T07:35:21.000Z",
  },
};
const apiRealResult = interpretScannerApiOutput(apiRealOutput);

assert.equal(apiRealResult.usedFallback, false, "API real-output metadata is not a fallback");
assert.equal(apiRealResult.resolvedSource, "real-output", "API real-output metadata resolves correctly");

const apiFixtureFallbackOutput: ScannerApiOutput = {
  ...realFixture,
  _source_meta: {
    source: "fixture-fallback",
    path: "public/fixtures/persistableScannerSample.json",
    reason: "no valid real scanner output found",
    selected_run_id: null,
    loaded_at: "2026-06-23T07:35:21.000Z",
  },
};
const apiFixtureFallbackResult = interpretScannerApiOutput(apiFixtureFallbackOutput);

assert.equal(apiFixtureFallbackResult.usedFallback, true, "API fixture-fallback metadata is a fallback");
assert.equal(
  apiFixtureFallbackResult.fallbackReason,
  "no valid real scanner output found",
  "fallbackReason comes from API source metadata",
);
assert.equal(
  apiFixtureFallbackResult.resolvedSource,
  "fixture-fallback",
  "API fixture-fallback metadata resolves correctly",
);

console.log("contract tests passed");
