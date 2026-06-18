import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateSecurity } from "../src/securityRules.js";
import type { NormalizedSecurity } from "../src/types.js";

function cleanSecurity(overrides: Partial<NormalizedSecurity> = {}): NormalizedSecurity {
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
    top_wallet_pct: 8.5,
    top_10_wallets_pct: 34.2,
    risk_flags: [],
    missing_data: [],
    raw_sources_available: {
      goplus: true,
      honeypot: true
    },
    ...overrides
  };
}

describe("evaluateSecurity", () => {
  it("marks honeypot failed as CRITICAL_RISK", () => {
    assert.equal(evaluateSecurity(cleanSecurity({ honeypot_status: "failed" })).security_label, "CRITICAL_RISK");
  });

  it("marks buy tax above 10 as CRITICAL_RISK", () => {
    assert.equal(evaluateSecurity(cleanSecurity({ buy_tax: 10.1 })).security_label, "CRITICAL_RISK");
  });

  it("marks sell tax above 10 as CRITICAL_RISK", () => {
    assert.equal(evaluateSecurity(cleanSecurity({ sell_tax: 10.1 })).security_label, "CRITICAL_RISK");
  });

  it("marks unverified contract as CRITICAL_RISK", () => {
    assert.equal(evaluateSecurity(cleanSecurity({ contract_verified: false })).security_label, "CRITICAL_RISK");
  });

  it("marks unlocked liquidity as CRITICAL_RISK", () => {
    assert.equal(evaluateSecurity(cleanSecurity({ liquidity_locked: false })).security_label, "CRITICAL_RISK");
  });

  it("marks top wallet above 30 as CRITICAL_RISK", () => {
    assert.equal(evaluateSecurity(cleanSecurity({ top_wallet_pct: 30.1 })).security_label, "CRITICAL_RISK");
  });

  it("marks top 10 wallets above 60 as CRITICAL_RISK", () => {
    assert.equal(evaluateSecurity(cleanSecurity({ top_10_wallets_pct: 60.1 })).security_label, "CRITICAL_RISK");
  });

  it("marks missing top wallet data as NEEDS_MANUAL_VERIFICATION", () => {
    assert.equal(evaluateSecurity(cleanSecurity({ top_wallet_pct: null })).security_label, "NEEDS_MANUAL_VERIFICATION");
  });

  it("marks missing one source as NEEDS_MANUAL_VERIFICATION", () => {
    assert.equal(
      evaluateSecurity(cleanSecurity({ sources: ["goplus"], raw_sources_available: { goplus: true, honeypot: false } })).security_label,
      "NEEDS_MANUAL_VERIFICATION"
    );
  });

  it("marks clean fixture as SECURITY_PASSED", () => {
    assert.equal(evaluateSecurity(cleanSecurity()).security_label, "SECURITY_PASSED");
  });
});
