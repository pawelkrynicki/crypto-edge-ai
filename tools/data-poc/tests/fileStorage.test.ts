import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { writePersistableScannerOutput } from "../src/fileStorage.js";
import type { PersistableScannerOutput } from "../src/persistableScannerModel.js";

function output(): PersistableScannerOutput {
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
      total_raw: 1,
      passed_basic_filter: 1,
      rejected_basic_filter: 0,
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
        candidate_id: "candidate_test",
        symbol: "TEST",
        name: "Test Token",
        chain: "eth",
        contract_address: "0xabc",
        pair_address: "0xpair",
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
      }
    ],
    security_checks: [],
    scorecards: [
      {
        run_id: "scan_test",
        candidate_id: "candidate_test",
        security_score: null,
        onchain_score: null,
        social_score: null,
        narrative_score: null,
        total_score: null,
        decision_label: "WATCHLIST",
        risk_level: "low",
        confidence: null,
        checklist: {
          security: [],
          distribution: [],
          liquidity: [],
          social: [],
          personal: []
        },
        created_at: "2026-06-18T00:00:00.000Z"
      }
    ]
  };
}

describe("writePersistableScannerOutput", () => {
  it("writes JSON and JSONL files to a temporary directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crypto-edge-ai-"));
    try {
      const result = await writePersistableScannerOutput(output(), join(dir, "nested", "output"));
      assert.deepEqual(result.files, ["scan_run.json", "candidates.jsonl", "security_checks.jsonl", "scorecards.jsonl", "full_output.json"]);

      const scanRun = JSON.parse(await readFile(join(result.output_dir, "scan_run.json"), "utf8")) as { run_id: string };
      const candidates = await readFile(join(result.output_dir, "candidates.jsonl"), "utf8");
      const securityChecks = await readFile(join(result.output_dir, "security_checks.jsonl"), "utf8");
      const fullOutput = JSON.parse(await readFile(join(result.output_dir, "full_output.json"), "utf8")) as PersistableScannerOutput;

      assert.equal(scanRun.run_id, "scan_test");
      assert.match(candidates, /"candidate_id":"candidate_test"/);
      assert.equal(securityChecks, "");
      assert.equal(fullOutput.scorecards.length, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("creates output directory when it does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "crypto-edge-ai-"));
    try {
      const result = await writePersistableScannerOutput(output(), join(dir, "missing", "output"));
      const scorecards = await readFile(join(result.output_dir, "scorecards.jsonl"), "utf8");
      assert.match(scorecards, /"decision_label":"WATCHLIST"/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
