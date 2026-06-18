import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCandidateId, buildPersistableScannerOutput } from "../src/persistableScannerModel.js";
import type { CombinedScannerOutput, CryptoEdgeCandidate, NormalizedSecurity } from "../src/types.js";

function candidate(overrides: Partial<CryptoEdgeCandidate> = {}): CryptoEdgeCandidate {
  return {
    symbol: "TEST",
    name: "Test Token",
    chain: "eth",
    contract_address: "0xabc",
    pair_address: "0xpair",
    dex: "uniswap",
    source: "dexscreener",
    source_url: "https://dexscreener.com/ethereum/0xpair",
    price_usd: 0.01,
    market_cap_usd: 1_000_000,
    fdv_usd: 1_000_000,
    liquidity_usd: 100_000,
    volume_24h_usd: 100_000,
    volume_market_cap_ratio: 0.1,
    pair_created_at: "2026-06-01T00:00:00.000Z",
    pair_age_days: 17,
    status: "passed_basic_filter",
    filter_reasons: [],
    ...overrides
  };
}

function security(): NormalizedSecurity {
  return {
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
    raw_sources_available: { goplus: true, honeypot: true }
  };
}

function combinedOutput(): CombinedScannerOutput {
  return {
    source: "combined-scanner-poc",
    mode: "fixture",
    query: "fixture",
    generated_at: "2026-06-18T00:00:00.000Z",
    limits: { max_candidates: 3 },
    summary: {
      total_raw: 4,
      passed_basic_filter: 3,
      rejected_basic_filter: 1,
      security_checked: 2,
      security_passed: 1,
      needs_manual_verification: 1,
      critical_risk: 1,
      watchlist_candidates: 1
    },
    candidates: [
      {
        candidate: candidate({ symbol: "WATCH" }),
        security: security(),
        decision: {
          basic_filter_status: "passed_basic_filter",
          security_label: "SECURITY_PASSED",
          final_label: "WATCHLIST",
          final_reasons: ["eligible_for_further_review_not_trading_signal"]
        }
      },
      {
        candidate: candidate({ symbol: "REJ", contract_address: "0xrej", status: "rejected_basic_filter", filter_reasons: ["liquidity_below_30000"] }),
        security: null,
        decision: {
          basic_filter_status: "rejected_basic_filter",
          security_label: "NOT_CHECKED",
          final_label: "REJECT",
          final_reasons: ["liquidity_below_30000"]
        }
      },
      {
        candidate: candidate({ symbol: "CRIT", contract_address: "0xcrit" }),
        security: security(),
        decision: {
          basic_filter_status: "passed_basic_filter",
          security_label: "CRITICAL_RISK",
          final_label: "CRITICAL_RISK",
          final_reasons: ["honeypot_failed"]
        }
      },
      {
        candidate: candidate({ symbol: "MANUAL", contract_address: "0xmanual" }),
        security: null,
        decision: {
          basic_filter_status: "passed_basic_filter",
          security_label: "NOT_CHECKED",
          final_label: "NEEDS_MANUAL_VERIFICATION",
          final_reasons: ["security_not_checked"]
        }
      }
    ]
  };
}

describe("buildPersistableScannerOutput", () => {
  it("maps CombinedScannerOutput to scan_run", () => {
    const output = buildPersistableScannerOutput({ combined: combinedOutput(), runId: "scan_test" });
    assert.equal(output.scan_run.run_id, "scan_test");
    assert.equal(output.scan_run.source, "combined-scanner-poc");
    assert.equal(output.scan_run.total_raw, 4);
    assert.equal(output.scan_run.watchlist_candidates, 1);
    assert.deepEqual(output.scan_run.errors, []);
  });

  it("adds run_id and deterministic candidate_id to candidates", () => {
    const output = buildPersistableScannerOutput({ combined: combinedOutput(), runId: "scan_test" });
    assert.equal(output.candidates[0].run_id, "scan_test");
    assert.equal(output.candidates[0].candidate_id, buildCandidateId("eth", "0xabc", "0xpair", "dexscreener"));
  });

  it("does not create a security_check for rejected candidate without security", () => {
    const output = buildPersistableScannerOutput({ combined: combinedOutput(), runId: "scan_test" });
    const rejected = output.candidates.find((item) => item.symbol === "REJ");
    assert.ok(rejected);
    assert.equal(output.security_checks.some((item) => item.candidate_id === rejected.candidate_id), false);
  });

  it("creates a security_check for candidates with security data", () => {
    const output = buildPersistableScannerOutput({ combined: combinedOutput(), runId: "scan_test" });
    assert.equal(output.security_checks.length, 2);
    assert.equal(output.security_checks[0].security_label, "SECURITY_PASSED");
  });

  it("creates one partial scorecard for every candidate", () => {
    const output = buildPersistableScannerOutput({ combined: combinedOutput(), runId: "scan_test" });
    assert.equal(output.scorecards.length, output.candidates.length);
    assert.equal(output.scorecards[0].total_score, null);
  });

  it("maps risk_level from final_label", () => {
    const output = buildPersistableScannerOutput({ combined: combinedOutput(), runId: "scan_test" });
    const riskBySymbol = new Map(output.candidates.map((candidateRow, index) => [candidateRow.symbol, output.scorecards[index].risk_level]));
    assert.equal(riskBySymbol.get("WATCH"), "low");
    assert.equal(riskBySymbol.get("REJ"), "high");
    assert.equal(riskBySymbol.get("CRIT"), "critical");
    assert.equal(riskBySymbol.get("MANUAL"), "medium");
  });
});
