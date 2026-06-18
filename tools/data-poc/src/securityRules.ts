import type { NormalizedSecurity, SecurityDecision } from "./types.js";

export function evaluateSecurity(security: NormalizedSecurity): SecurityDecision {
  const criticalReasons: string[] = [];
  const warningReasons: string[] = [];

  if (security.honeypot_status === "failed") {
    criticalReasons.push("honeypot_failed");
  }
  if (security.buy_tax !== null && security.buy_tax > 10) {
    criticalReasons.push("buy_tax_above_10_percent");
  }
  if (security.sell_tax !== null && security.sell_tax > 10) {
    criticalReasons.push("sell_tax_above_10_percent");
  }
  if (security.contract_verified === false) {
    criticalReasons.push("contract_not_verified");
  }
  if (security.liquidity_locked === false) {
    criticalReasons.push("liquidity_unlocked");
  }
  if (security.top_wallet_pct !== null && security.top_wallet_pct > 30) {
    criticalReasons.push("top_wallet_above_30_percent");
  }
  if (security.top_10_wallets_pct !== null && security.top_10_wallets_pct > 60) {
    criticalReasons.push("top_10_wallets_above_60_percent");
  }
  if (security.mint_risk === true) {
    criticalReasons.push("mint_risk_detected");
  }
  if (security.blacklist_risk === true) {
    criticalReasons.push("blacklist_risk_detected");
  }
  if (security.sell_restriction_risk === true) {
    criticalReasons.push("sell_restriction_risk_detected");
  }

  if (!security.raw_sources_available.goplus) {
    warningReasons.push("goplus_missing");
  }
  if (!security.raw_sources_available.honeypot) {
    warningReasons.push("honeypot_missing");
  }
  if (security.ownership_status === "unknown") {
    warningReasons.push("ownership_unknown");
  }
  if (security.liquidity_locked === null) {
    warningReasons.push("liquidity_lock_missing");
  }
  if (security.top_wallet_pct === null) {
    warningReasons.push("top_wallet_pct_missing");
  }
  if (security.top_10_wallets_pct === null) {
    warningReasons.push("top_10_wallets_pct_missing");
  }
  if (security.proxy_risk === true) {
    warningReasons.push("proxy_risk_requires_manual_verification");
  }
  if (security.whitelist_risk === true) {
    warningReasons.push("whitelist_risk_requires_manual_verification");
  }
  if (hasInconsistentHoneypotData(security)) {
    warningReasons.push("security_data_inconsistent_between_sources");
  }

  return {
    security_label: criticalReasons.length > 0 ? "CRITICAL_RISK" : warningReasons.length > 0 ? "NEEDS_MANUAL_VERIFICATION" : "SECURITY_PASSED",
    critical_reasons: criticalReasons,
    warning_reasons: warningReasons
  };
}

function hasInconsistentHoneypotData(security: NormalizedSecurity): boolean {
  return security.risk_flags.includes("goplus_honeypot_failed") && security.risk_flags.includes("honeypot_is_passed");
}
