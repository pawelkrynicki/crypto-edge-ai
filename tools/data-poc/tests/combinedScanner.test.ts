import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCombinedCandidate, buildCombinedScannerOutput } from "../src/combinedScanner.js";
import type { CryptoEdgeCandidate, NormalizedSecurity, SecurityDecision } from "../src/types.js";

function candidate(status: CryptoEdgeCandidate["status"] = "passed_basic_filter", overrides: Partial<CryptoEdgeCandidate> = {}): CryptoEdgeCandidate {
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
    status,
    filter_reasons: status === "rejected_basic_filter" ? ["liquidity_below_30000"] : [],
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

function decision(label: SecurityDecision["security_label"]): SecurityDecision {
  return {
    security_label: label,
    critical_reasons: label === "CRITICAL_RISK" ? ["honeypot_failed"] : [],
    warning_reasons: label === "NEEDS_MANUAL_VERIFICATION" ? ["top_wallet_pct_missing"] : []
  };
}

describe("buildCombinedCandidate", () => {
  it("maps rejected basic filter to final REJECT", () => {
    const result = buildCombinedCandidate(candidate("rejected_basic_filter"), null, null);
    assert.equal(result.decision.final_label, "REJECT");
    assert.deepEqual(result.decision.final_reasons, ["liquidity_below_30000"]);
  });

  it("maps passed basic plus SECURITY_PASSED to WATCHLIST", () => {
    const result = buildCombinedCandidate(candidate(), security(), decision("SECURITY_PASSED"));
    assert.equal(result.decision.final_label, "WATCHLIST");
    assert.ok(result.decision.final_reasons.includes("eligible_for_further_review_not_trading_signal"));
  });

  it("maps WATCHLIST as eligible for further review, not a trading signal", () => {
    const result = buildCombinedCandidate(candidate(), security(), decision("SECURITY_PASSED"));
    assert.equal(result.decision.final_label, "WATCHLIST");
    assert.equal(result.decision.final_reasons.includes("buy_signal"), false);
  });

  it("maps passed basic plus CRITICAL_RISK to CRITICAL_RISK", () => {
    const result = buildCombinedCandidate(candidate(), security(), decision("CRITICAL_RISK"));
    assert.equal(result.decision.final_label, "CRITICAL_RISK");
  });

  it("maps passed basic plus NEEDS_MANUAL_VERIFICATION to NEEDS_MANUAL_VERIFICATION", () => {
    const result = buildCombinedCandidate(candidate(), security(), decision("NEEDS_MANUAL_VERIFICATION"));
    assert.equal(result.decision.final_label, "NEEDS_MANUAL_VERIFICATION");
  });

  it("maps passed basic plus no security to NEEDS_MANUAL_VERIFICATION / NOT_CHECKED", () => {
    const result = buildCombinedCandidate(candidate(), null, null);
    assert.equal(result.decision.final_label, "NEEDS_MANUAL_VERIFICATION");
    assert.equal(result.decision.security_label, "NOT_CHECKED");
  });
});

describe("buildCombinedScannerOutput", () => {
  it("calculates summary counts", async () => {
    const output = await buildCombinedScannerOutput({
      mode: "fixture",
      query: "fixture",
      maxCandidates: 3,
      now: new Date("2026-06-18T00:00:00.000Z"),
      candidates: [candidate(), candidate("rejected_basic_filter"), candidate("passed_basic_filter", { symbol: "TEST2", contract_address: "0xdef" })],
      securityRawProvider: async () => ({
        goplusRaw: {
          result: {
            "0xabc": {
              is_honeypot: "0",
              buy_tax: "0.03",
              sell_tax: "0.04",
              is_open_source: "1",
              owner_address: "0x0000000000000000000000000000000000000000",
              liquidity_locked: true,
              is_mintable: "0",
              is_blacklisted: "0",
              cannot_sell_all: "0",
              top_wallet_pct: 8,
              top_10_wallets_pct: 35
            }
          }
        },
        honeypotRaw: { honeypotResult: { isHoneypot: false } }
      })
    });

    assert.equal(output.summary.total_raw, 3);
    assert.equal(output.summary.passed_basic_filter, 2);
    assert.equal(output.summary.rejected_basic_filter, 1);
    assert.equal(output.summary.security_checked, 2);
    assert.equal(output.summary.watchlist_candidates, 2);
  });

  it("limits security checks by maxCandidates", async () => {
    let checks = 0;
    await buildCombinedScannerOutput({
      mode: "fixture",
      query: "fixture",
      maxCandidates: 1,
      candidates: [candidate(), candidate("passed_basic_filter", { symbol: "T2", contract_address: "0xdef" })],
      securityRawProvider: async () => {
        checks += 1;
        return { goplusRaw: null, honeypotRaw: null };
      }
    });

    assert.equal(checks, 1);
  });
});
