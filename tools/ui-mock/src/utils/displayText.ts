const REASON_TEXT: Record<string, string> = {
  eligible_for_further_review_not_trading_signal: "Eligible for further review only",
  liquidity_below_30000: "Liquidity below minimum",
  pair_age_outside_preferred_14_90_days: "Pair age outside preferred review window",
  market_cap_missing_using_fdv: "Market cap missing; FDV used",
  goplus_honeypot_passed: "Security checks passed",
  honeypot_is_passed: "Honeypot check passed",
};

export function formatReasonText(value: string): string {
  return REASON_TEXT[value] ?? humanizeToken(value);
}

export function formatSecurityFlag(value: string): string {
  if (value.toLowerCase().includes("goplus")) {
    return "Security source check passed";
  }

  return formatReasonText(value);
}

function humanizeToken(value: string): string {
  return value
    .replace(/goplus/gi, "security source")
    .replace(/trading_signal/gi, "research-only")
    .replace(/_/g, " ")
    .trim();
}
