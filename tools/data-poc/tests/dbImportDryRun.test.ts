import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDbImportDryRunFromOutput } from "../src/dbImportDryRun.js";
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

function dryRun(input: PersistableScannerOutput = output()) {
  return buildDbImportDryRunFromOutput({ output: input, mode: "fixture", outputDir: "memory:fixture" });
}

describe("buildDbImportDryRunFromOutput", () => {
  it("generates import_ready true for valid persistable output", () => {
    const result = dryRun();
    assert.equal(result.valid, true);
    assert.equal(result.import_ready, true);
    assert.equal(result.plan?.readiness.can_import_to_db_later, true);
  });

  it("returns import_ready false when validation fails", () => {
    const invalid = output();
    invalid.candidates[0].candidate_id = "";
    const result = dryRun(invalid);
    assert.equal(result.valid, false);
    assert.equal(result.import_ready, false);
    assert.equal(result.plan, null);
  });

  it("plan has four target tables", () => {
    const result = dryRun();
    assert.equal(result.plan?.target_tables.length, 4);
    assert.deepEqual(result.plan?.target_tables.map((table) => table.table), [
      "crypto_token_scan_runs",
      "crypto_token_candidates",
      "crypto_token_security_checks",
      "crypto_token_scorecards"
    ]);
  });

  it("record counts match input", () => {
    const result = dryRun();
    assert.equal(result.plan?.summary.scan_runs, 1);
    assert.equal(result.plan?.summary.candidates, 2);
    assert.equal(result.plan?.summary.security_checks, 1);
    assert.equal(result.plan?.summary.scorecards, 2);
  });

  it("requires candidates_count > 0", () => {
    const empty = output();
    empty.candidates = [];
    empty.security_checks = [];
    empty.scorecards = [];
    const result = dryRun(empty);
    assert.equal(result.import_ready, false);
    assert.ok(result.plan?.readiness.blocking_reasons.includes("no candidates"));
  });

  it("requires scorecards_count to equal candidates_count", () => {
    const mismatch = output();
    mismatch.scorecards = mismatch.scorecards.slice(0, 1);
    const result = dryRun(mismatch);
    assert.equal(result.import_ready, false);
    assert.equal(result.plan, null);
  });

  it("blocks duplicate candidate_id through validation", () => {
    const duplicate = output();
    duplicate.candidates[1].candidate_id = duplicate.candidates[0].candidate_id;
    const result = dryRun(duplicate);
    assert.equal(result.import_ready, false);
    assert.equal(result.plan, null);
  });

  it("adds scorecards partial/null warning", () => {
    const result = dryRun();
    assert.ok(result.plan?.readiness.warnings.includes("scorecards partial/null"));
  });

  it("adds no watchlist candidates warning when no candidate is WATCHLIST", () => {
    const noWatchlist = output();
    noWatchlist.candidates[0].final_label = "NEEDS_MANUAL_VERIFICATION";
    noWatchlist.scorecards[0].decision_label = "NEEDS_MANUAL_VERIFICATION";
    noWatchlist.scorecards[0].risk_level = "medium";
    const result = dryRun(noWatchlist);
    assert.ok(result.plan?.readiness.warnings.includes("no watchlist candidates"));
  });

  it("includes idempotency report", () => {
    const result = dryRun();
    assert.equal(result.plan?.idempotency.safe_to_rerun_same_output, true);
    assert.ok(result.plan?.idempotency.strategy.includes("candidate upsert by candidate_id"));
  });

  it("warns for security_checks_count = 0 without blocking by itself", () => {
    const noSecurity = output();
    noSecurity.security_checks = [];
    const result = dryRun(noSecurity);
    assert.equal(result.import_ready, true);
    assert.ok(result.plan?.readiness.warnings.includes("security_checks_count = 0"));
  });
});
