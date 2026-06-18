import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { writePersistableScannerOutput } from "../src/fileStorage.js";
import type { PersistableScannerOutput } from "../src/persistableScannerModel.js";
import { validatePersistableScannerOutput, validateStorageOutputDir } from "../src/storageValidator.js";

function sampleOutput(): PersistableScannerOutput {
  return {
    scan_run: {
      run_id: "scan_test",
      source: "combined-scanner-poc",
      mode: "fixture",
      query: "fixture",
      filters: {},
      limits: { max_candidates: 3 },
      started_at: null,
      finished_at: "2026-06-18T00:00:00.000Z",
      total_raw: 2,
      passed_basic_filter: 1,
      rejected_basic_filter: 1,
      security_checked: 1,
      security_passed: 1,
      needs_manual_verification: 0,
      critical_risk: 0,
      watchlist_candidates: 1,
      errors: []
    },
    candidates: [
      {
        run_id: "scan_test",
        candidate_id: "candidate_watch",
        symbol: "WATCH",
        name: "Watch Token",
        chain: "eth",
        contract_address: "0xwatch",
        pair_address: "0xpairwatch",
        dex: "uniswap",
        source: "dexscreener",
        source_url: null,
        price_usd: null,
        market_cap_usd: null,
        fdv_usd: null,
        liquidity_usd: null,
        volume_24h_usd: null,
        volume_market_cap_ratio: null,
        pair_created_at: null,
        pair_age_days: null,
        basic_filter_status: "passed_basic_filter",
        filter_reasons: [],
        final_label: "WATCHLIST",
        final_reasons: ["eligible_for_further_review_not_trading_signal"],
        created_at: "2026-06-18T00:00:00.000Z"
      },
      {
        run_id: "scan_test",
        candidate_id: "candidate_reject",
        symbol: "REJ",
        name: "Reject Token",
        chain: "eth",
        contract_address: "0xreject",
        pair_address: "0xpairreject",
        dex: "uniswap",
        source: "dexscreener",
        source_url: null,
        price_usd: null,
        market_cap_usd: null,
        fdv_usd: null,
        liquidity_usd: null,
        volume_24h_usd: null,
        volume_market_cap_ratio: null,
        pair_created_at: null,
        pair_age_days: null,
        basic_filter_status: "rejected_basic_filter",
        filter_reasons: ["liquidity_below_30000"],
        final_label: "REJECT",
        final_reasons: ["liquidity_below_30000"],
        created_at: "2026-06-18T00:00:00.000Z"
      }
    ],
    security_checks: [
      {
        run_id: "scan_test",
        candidate_id: "candidate_watch",
        sources: ["goplus", "honeypot"],
        honeypot_status: "passed",
        buy_tax: 3,
        sell_tax: 4,
        contract_verified: true,
        ownership_status: "renounced",
        liquidity_locked: true,
        liquidity_lock_days: 120,
        mint_risk: false,
        blacklist_risk: false,
        whitelist_risk: false,
        sell_restriction_risk: false,
        proxy_risk: false,
        top_wallet_pct: 8,
        top_10_wallets_pct: 35,
        risk_flags: [],
        missing_data: [],
        security_label: "SECURITY_PASSED",
        critical_reasons: [],
        warning_reasons: [],
        checked_at: "2026-06-18T00:00:00.000Z"
      }
    ],
    scorecards: [
      {
        run_id: "scan_test",
        candidate_id: "candidate_watch",
        security_score: null,
        onchain_score: null,
        social_score: null,
        narrative_score: null,
        total_score: null,
        decision_label: "WATCHLIST",
        risk_level: "low",
        confidence: null,
        checklist: { security: [], distribution: [], liquidity: [], social: [], personal: [] },
        created_at: "2026-06-18T00:00:00.000Z"
      },
      {
        run_id: "scan_test",
        candidate_id: "candidate_reject",
        security_score: null,
        onchain_score: null,
        social_score: null,
        narrative_score: null,
        total_score: null,
        decision_label: "REJECT",
        risk_level: "high",
        confidence: null,
        checklist: { security: [], distribution: [], liquidity: [], social: [], personal: [] },
        created_at: "2026-06-18T00:00:00.000Z"
      }
    ]
  };
}

describe("validatePersistableScannerOutput", () => {
  it("passes valid persistable output", () => {
    const result = validatePersistableScannerOutput(sampleOutput());
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
    assert.equal(result.summary.candidates_count, 2);
  });

  it("returns error when scan_run is missing", () => {
    const output = sampleOutput() as unknown as { scan_run: unknown };
    output.scan_run = null;
    const result = validatePersistableScannerOutput(output as PersistableScannerOutput);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "SCAN_RUN_MISSING"));
  });

  it("returns error when candidate_id is missing", () => {
    const output = sampleOutput();
    output.candidates[0].candidate_id = "";
    const result = validatePersistableScannerOutput(output);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "CANDIDATE_FIELD_MISSING"));
  });

  it("returns error for duplicate candidate_id", () => {
    const output = sampleOutput();
    output.candidates[1].candidate_id = output.candidates[0].candidate_id;
    const result = validatePersistableScannerOutput(output);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "CANDIDATE_ID_DUPLICATE"));
  });

  it("returns error when security_check references missing candidate", () => {
    const output = sampleOutput();
    output.security_checks[0].candidate_id = "missing_candidate";
    const result = validatePersistableScannerOutput(output);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "SECURITY_CHECK_CANDIDATE_MISSING"));
  });

  it("returns error when scorecard references missing candidate", () => {
    const output = sampleOutput();
    output.scorecards[0].candidate_id = "missing_candidate";
    const result = validatePersistableScannerOutput(output);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "SCORECARD_CANDIDATE_MISSING"));
  });

  it("returns error when candidate has no scorecard", () => {
    const output = sampleOutput();
    output.scorecards = output.scorecards.slice(0, 1);
    const result = validatePersistableScannerOutput(output);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "SCORECARD_MISSING_FOR_CANDIDATE"));
  });

  it("returns error for invalid final_label", () => {
    const output = sampleOutput();
    output.candidates[0].final_label = "BUY_NOW";
    const result = validatePersistableScannerOutput(output);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.code === "CANDIDATE_FINAL_LABEL_INVALID"));
  });
});

describe("validateStorageOutputDir", () => {
  it("returns error for invalid JSONL line", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crypto-edge-ai-validation-"));
    try {
      const stored = await writePersistableScannerOutput(sampleOutput(), dir);
      await writeFile(join(stored.output_dir, "candidates.jsonl"), "{\"candidate_id\":\"ok\"}\nnot-json\n", "utf8");
      const result = await validateStorageOutputDir(stored.output_dir);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((error) => error.code === "JSONL_LINE_INVALID"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns warning, not error, when full_output.json is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crypto-edge-ai-validation-"));
    try {
      const stored = await writePersistableScannerOutput(sampleOutput(), dir);
      await rm(join(stored.output_dir, "full_output.json"), { force: true });
      const result = await validateStorageOutputDir(stored.output_dir);
      assert.equal(result.valid, true);
      assert.ok(result.warnings.some((warning) => warning.code === "FULL_OUTPUT_MISSING"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps empty security_checks.jsonl valid with warning", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crypto-edge-ai-validation-"));
    try {
      const output = sampleOutput();
      output.security_checks = [];
      const stored = await writePersistableScannerOutput(output, dir);
      const result = await validateStorageOutputDir(stored.output_dir);
      assert.equal(result.valid, true);
      assert.ok(result.warnings.some((warning) => warning.code === "JSONL_FILE_EMPTY"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns error when candidates.jsonl and scorecards.jsonl are missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crypto-edge-ai-validation-"));
    try {
      const outputDir = join(dir, "missing-files");
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, "scan_run.json"), JSON.stringify(sampleOutput().scan_run), "utf8");
      const result = await validateStorageOutputDir(outputDir);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((error) => error.path === "candidates"));
      assert.ok(result.errors.some((error) => error.path === "scorecards"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
